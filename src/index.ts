/**
 * Analytics Plugin for EmDash CMS
 *
 * Tracks page views for all content types and provides a dashboard
 * in the admin panel with charts, popular content, and real-time stats.
 *
 * Features:
 * - Beacon-based page view tracking (lightweight, non-blocking)
 * - Inline aggregation on every track event (no cron needed)
 * - Admin dashboard with time-series chart and popular content
 * - Dashboard widget with today's views and sparkline
 * - Per-collection content breakdown
 */

import type {
	PluginDescriptor,
	RouteContext,
	StorageCollection,
	PageFragmentEvent,
	PluginContext,
	LifecycleEvent,
} from "emdash";
import { definePlugin } from "emdash";
import { z } from "astro/zod";

// =============================================================================
// Types
// =============================================================================

interface PageviewRecord {
	path: string;
	referrer: string;
	screenWidth: number;
	locale: string;
	collection: string;
	contentId: string;
	date: string;
	createdAt: string;
	ip: string;
	userAgent: string;
}

interface DailySummary {
	views: number;
	uniquePaths: number;
	topPaths: PopularEntry[];
}

interface PopularEntry {
	path: string;
	views: number;
	collection: string;
	contentId: string;
}

// =============================================================================
// Plugin Descriptor (for astro.config.mjs)
// =============================================================================

export function analyticsPlugin(
	options: Record<string, unknown> = {},
): PluginDescriptor {
	return {
		id: "analytics",
		version: "0.1.0",
		entrypoint: "@emdash-cms/plugin-analytics",
		adminEntry: "@emdash-cms/plugin-analytics/admin",
		options,
		capabilities: ["page:inject"],
		adminPages: [{ path: "/", label: "Analytics", icon: "chart" }],
		adminWidgets: [{ id: "views-today", title: "Page Views", size: "half" }],
	};
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Update the topPaths array in a daily summary, adding or incrementing
 * the given path. Keeps the list sorted by views descending and capped at 50.
 */
function upsertTopPath(
	topPaths: PopularEntry[],
	path: string,
	collection: string,
	contentId: string,
): PopularEntry[] {
	const existing = topPaths.find((p) => p.path === path);
	if (existing) {
		existing.views++;
	} else {
		topPaths.push({ path, views: 1, collection, contentId });
	}
	topPaths.sort((a, b) => b.views - a.views);
	return topPaths.slice(0, 50);
}

/**
 * Rebuild the popular content list (last 30 days) from daily summaries.
 */
async function rebuildPopular(
	kv: PluginContext["kv"],
): Promise<PopularEntry[]> {
	const popularMap = new Map<
		string,
		{ views: number; collection: string; contentId: string }
	>();
	const now = new Date();
	for (let i = 0; i < 30; i++) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		const ds = d.toISOString().slice(0, 10);
		const summary = await kv.get<DailySummary>(`state:daily:${ds}`);
		if (summary?.topPaths) {
			for (const entry of summary.topPaths) {
				const ex = popularMap.get(entry.path) ?? {
					views: 0,
					collection: entry.collection,
					contentId: entry.contentId,
				};
				ex.views += entry.views;
				popularMap.set(entry.path, ex);
			}
		}
	}
	return [...popularMap.entries()]
		.map(([path, data]) => ({ path, ...data }))
		.sort((a, b) => b.views - a.views)
		.slice(0, 20);
}

// =============================================================================
// Plugin Implementation
// =============================================================================

export function createPlugin() {
	return definePlugin({
		id: "analytics",
		version: "0.1.0",
		capabilities: ["page:inject"],

		storage: {
			pageviews: {
				indexes: ["path", "date", "collection", "contentId", "createdAt"],
			},
		},

		hooks: {
			"plugin:install": async (_event: LifecycleEvent, ctx: PluginContext) => {
				await ctx.kv.set("state:initialized", true);
			},

			"page:fragments": async (
				event: PageFragmentEvent,
				_ctx: PluginContext,
			) => {
				const collection = event.page.content?.collection ?? "";
				const contentId = event.page.content?.id ?? "";

				const code = `(function(){
  if(window.location.pathname.indexOf("/_emdash")===0) return;
  var fn=function(){
    var col=${JSON.stringify(collection)};
    var cid=${JSON.stringify(contentId)};
    if(!col){
      var m=document.querySelector("meta[name=\\"emdash:collection\\"]");
      if(m) col=m.getAttribute("content")||"";
    }
    if(!cid){
      var m2=document.querySelector("meta[name=\\"emdash:content-id\\"]");
      if(m2) cid=m2.getAttribute("content")||"";
    }
    var lang=document.documentElement.lang||"";
    var payload=JSON.stringify({
      path:window.location.pathname,
      referrer:document.referrer||"",
      screenWidth:screen.width,
      locale:lang,
      collection:col,
      contentId:cid
    });
    navigator.sendBeacon("/_emdash/api/plugins/analytics/track",payload);
  };
  if(typeof requestIdleCallback==="function"){
    requestIdleCallback(fn);
  } else {
    setTimeout(fn,50);
  }
})();`;

				return {
					kind: "inline-script" as const,
					placement: "body:end" as const,
					code,
				};
			},
		},

		routes: {
			track: {
				public: true,
				input: z.object({
					path: z.string(),
					referrer: z.string().optional().default(""),
					screenWidth: z.number().optional(),
					locale: z.string().optional().default(""),
					collection: z.string().optional().default(""),
					contentId: z.string().optional().default(""),
				}),
				handler: async (ctx: RouteContext) => {
					const { path, referrer, screenWidth, locale, collection, contentId } =
						ctx.input as {
							path: string;
							referrer: string;
							screenWidth?: number;
							locale: string;
							collection: string;
							contentId: string;
						};
					const date = new Date().toISOString().slice(0, 10);
					const id = crypto.randomUUID();
					const store = ctx.storage
						.pageviews as StorageCollection<PageviewRecord>;

					// Store raw pageview
					await store.put(id, {
						path,
						referrer,
						screenWidth: screenWidth ?? 0,
						locale,
						collection,
						contentId,
						date,
						createdAt: new Date().toISOString(),
						ip: ctx.requestMeta.ip ?? "",
						userAgent: ctx.requestMeta.userAgent ?? "",
					});

					// Update today's daily summary in KV
					const todayKey = `state:daily:${date}`;
					const today =
						(await ctx.kv.get<DailySummary>(todayKey)) ?? {
							views: 0,
							uniquePaths: 0,
							topPaths: [],
						};
					today.views++;
					// Track unique paths: check if path already exists in topPaths
					const pathExists = today.topPaths.some((p) => p.path === path);
					if (!pathExists) {
						today.uniquePaths++;
					}
					today.topPaths = upsertTopPath(
						today.topPaths,
						path,
						collection,
						contentId,
					);
					await ctx.kv.set(todayKey, today);

					// Rebuild popular content list from last 30 days
					const popular = await rebuildPopular(ctx.kv);
					await ctx.kv.set("state:popular", popular);

					return { ok: true };
				},
			} as never,

			"stats/overview": {
				handler: async (ctx: RouteContext) => {
					const days: Array<{ date: string; views: number }> = [];
					const now = new Date();
					for (let i = 29; i >= 0; i--) {
						const d = new Date(now);
						d.setDate(d.getDate() - i);
						const dateStr = d.toISOString().slice(0, 10);
						const summary = await ctx.kv.get<DailySummary>(
							`state:daily:${dateStr}`,
						);
						days.push({ date: dateStr, views: summary?.views ?? 0 });
					}

					const todayStr = now.toISOString().slice(0, 10);
					const today = await ctx.kv.get<DailySummary>(
						`state:daily:${todayStr}`,
					);

					const popular =
						(await ctx.kv.get<PopularEntry[]>("state:popular")) ?? [];

					return {
						days,
						today: today?.views ?? 0,
						totalLast30: days.reduce((sum, d) => sum + d.views, 0),
						popular,
					};
				},
			} as never,

			"stats/content": {
				input: z.object({
					collection: z.string().optional(),
					days: z.number().optional().default(7),
				}),
				handler: async (ctx: RouteContext) => {
					const { collection, days } = ctx.input as {
						collection?: string;
						days: number;
					};
					const store = ctx.storage
						.pageviews as StorageCollection<PageviewRecord>;
					const since = new Date();
					since.setDate(since.getDate() - days);
					const sinceStr = since.toISOString().slice(0, 10);

					const where: Record<string, unknown> = {
						date: { gte: sinceStr },
					};
					if (collection) where.collection = collection;

					const total = await store.count(where as never);

					const result = await store.query({
						where: where as never,
						orderBy: { createdAt: "desc" },
						limit: 100,
					});

					const pathCounts = new Map<
						string,
						{
							views: number;
							collection: string;
							contentId: string;
							path: string;
						}
					>();
					for (const item of result.items) {
						const key = item.data.path;
						const existing = pathCounts.get(key) ?? {
							views: 0,
							collection: item.data.collection,
							contentId: item.data.contentId,
							path: key,
						};
						existing.views++;
						pathCounts.set(key, existing);
					}

					const topContent = [...pathCounts.values()]
						.sort((a, b) => b.views - a.views)
						.slice(0, 20);

					return { total, topContent, period: days };
				},
			} as never,

			"stats/realtime": {
				handler: async (ctx: RouteContext) => {
					const store = ctx.storage
						.pageviews as StorageCollection<PageviewRecord>;
					const oneHourAgo = new Date(
						Date.now() - 3600000,
					).toISOString();
					const count = await store.count({
						createdAt: { gte: oneHourAgo },
					} as never);
					return { lastHour: count };
				},
			} as never,
		},

		admin: {
			entry: "@emdash-cms/plugin-analytics/admin",
			pages: [{ path: "/", label: "Analytics", icon: "chart" }],
			widgets: [{ id: "views-today", title: "Page Views", size: "half" }],
		},
	});
}

export default createPlugin;
