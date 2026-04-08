/**
 * Analytics Plugin - Admin UI
 *
 * Provides:
 * - AnalyticsPage: main admin page with chart, stats cards, popular content
 * - ViewsTodayWidget: dashboard widget with today's views and sparkline
 */

import type { PluginAdminExports } from "emdash";
import { apiFetch } from "emdash/plugin-utils";
import * as React from "react";

// =============================================================================
// Constants
// =============================================================================

const API = "/_emdash/api/plugins/analytics";

// =============================================================================
// Types
// =============================================================================

interface OverviewData {
	days: Array<{ date: string; views: number }>;
	today: number;
	totalLast30: number;
	popular: Array<{
		path: string;
		views: number;
		collection: string;
		contentId: string;
	}>;
}

interface RealtimeData {
	lastHour: number;
}

interface ContentData {
	total: number;
	topContent: Array<{
		path: string;
		views: number;
		collection: string;
		contentId: string;
	}>;
	period: number;
}

// =============================================================================
// API Helpers
// =============================================================================

async function apiGet(route: string): Promise<Response> {
	return apiFetch(`${API}/${route}`);
}

async function apiPost(route: string, body?: unknown): Promise<Response> {
	return apiFetch(`${API}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
	});
}

// =============================================================================
// Sparkline Component (SVG-based, lightweight)
// =============================================================================

function Sparkline({
	data,
	width = 120,
	height = 32,
	color = "#3b82f6",
}: {
	data: number[];
	width?: number;
	height?: number;
	color?: string;
}) {
	if (data.length < 2) return null;
	const max = Math.max(...data, 1);
	const min = Math.min(...data, 0);
	const range = max - min || 1;
	const step = width / (data.length - 1);

	const points = data
		.map((v, i) => {
			const x = i * step;
			const y = height - ((v - min) / range) * (height - 4) - 2;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			style={{ display: "block" }}
		>
			<polyline
				points={points}
				fill="none"
				stroke={color}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// =============================================================================
// Simple Bar Chart Component (SVG-based)
// =============================================================================

function SimpleChart({
	data,
	height = 200,
}: {
	data: Array<{ date: string; views: number }>;
	height?: number;
}) {
	if (data.length === 0) return null;
	const max = Math.max(...data.map((d) => d.views), 1);
	const barWidth = 100 / data.length;

	return (
		<div style={{ position: "relative", width: "100%", height: `${height}px` }}>
			<svg
				width="100%"
				height={height}
				viewBox={`0 0 ${data.length * 20} ${height}`}
				preserveAspectRatio="none"
				style={{ display: "block" }}
			>
				{data.map((d, i) => {
					const barH = (d.views / max) * (height - 30);
					return (
						<g key={d.date}>
							<rect
								x={i * 20 + 2}
								y={height - 20 - barH}
								width={16}
								height={barH}
								fill="#3b82f6"
								rx={2}
								opacity={0.85}
							/>
						</g>
					);
				})}
			</svg>
			{/* X axis labels: show every 5th date */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					padding: "4px 0 0",
					fontSize: "10px",
					color: "#9ca3af",
				}}
			>
				{data
					.filter((_, i) => i % 5 === 0 || i === data.length - 1)
					.map((d) => (
						<span key={d.date}>
							{new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})}
						</span>
					))}
			</div>
		</div>
	);
}

// =============================================================================
// Collection Badge
// =============================================================================

const BADGE_COLORS: Record<string, string> = {
	posts: "#8b5cf6",
	pages: "#059669",
	products: "#d97706",
	authors: "#ec4899",
};

function CollectionBadge({ collection }: { collection: string }) {
	if (!collection) return <span style={{ color: "#9ca3af" }}>--</span>;
	const color = BADGE_COLORS[collection] ?? "#6b7280";
	return (
		<span
			style={{
				display: "inline-block",
				padding: "2px 8px",
				fontSize: "11px",
				fontWeight: 600,
				color,
				backgroundColor: `${color}18`,
				borderRadius: "9999px",
			}}
		>
			{collection}
		</span>
	);
}

// =============================================================================
// Stats Card
// =============================================================================

function StatCard({
	label,
	value,
	sub,
}: {
	label: string;
	value: string | number;
	sub?: string;
}) {
	return (
		<div
			style={{
				flex: 1,
				padding: "16px 20px",
				backgroundColor: "#fff",
				border: "1px solid #e5e7eb",
				borderRadius: "8px",
			}}
		>
			<div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
				{label}
			</div>
			<div
				style={{
					fontSize: "28px",
					fontWeight: 700,
					color: "#18181b",
					marginTop: "4px",
				}}
			>
				{typeof value === "number" ? (value ?? 0).toLocaleString() : value}
			</div>
			{sub && (
				<div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>
					{sub}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// Analytics Page
// =============================================================================

function AnalyticsPage() {
	const [overview, setOverview] = React.useState<OverviewData | null>(null);
	const [realtime, setRealtime] = React.useState<RealtimeData | null>(null);
	const [contentData, setContentData] = React.useState<ContentData | null>(
		null,
	);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const [collectionFilter, setCollectionFilter] = React.useState<string>("");
	const [daysFilter, setDaysFilter] = React.useState<number>(7);

	const fetchOverview = React.useCallback(async () => {
		try {
			const res = await apiGet("stats/overview");
			if (!res.ok) throw new Error("Failed to load overview");
			const data = await res.json();
			setOverview(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load analytics",
			);
		}
	}, []);

	const fetchRealtime = React.useCallback(async () => {
		try {
			const res = await apiGet("stats/realtime");
			if (!res.ok) return;
			const data = await res.json();
			setRealtime(data);
		} catch {
			// silent fail for realtime
		}
	}, []);

	const fetchContent = React.useCallback(async () => {
		try {
			const body: Record<string, unknown> = { days: daysFilter };
			if (collectionFilter) body.collection = collectionFilter;
			const res = await apiPost("stats/content", body);
			if (!res.ok) return;
			const data = await res.json();
			setContentData(data);
		} catch {
			// silent fail
		}
	}, [collectionFilter, daysFilter]);

	React.useEffect(() => {
		Promise.all([fetchOverview(), fetchRealtime()]).finally(() =>
			setLoading(false),
		);
	}, [fetchOverview, fetchRealtime]);

	React.useEffect(() => {
		fetchContent();
	}, [fetchContent]);

	// Auto-refresh realtime every 30s
	React.useEffect(() => {
		const interval = setInterval(fetchRealtime, 30000);
		return () => clearInterval(interval);
	}, [fetchRealtime]);

	if (loading) {
		return (
			<div style={{ padding: "24px", textAlign: "center", color: "#888" }}>
				Loading analytics...
			</div>
		);
	}

	if (error) {
		return (
			<div
				style={{
					padding: "24px",
					color: "#dc2626",
					backgroundColor: "#fef2f2",
					borderRadius: "8px",
					margin: "24px",
				}}
			>
				{error}
			</div>
		);
	}

	// Collect unique collections from popular content
	const collections = Array.from(
		new Set(
			(overview?.popular ?? [])
				.map((p) => p.collection)
				.filter(Boolean),
		),
	);

	return (
		<div style={{ padding: "24px", maxWidth: "960px" }}>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "24px",
				}}
			>
				<div>
					<h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>
						Analytics
					</h1>
					<p style={{ fontSize: "14px", color: "#888", margin: "4px 0 0" }}>
						Page view statistics across your site.
					</p>
				</div>
				<div style={{ display: "flex", gap: "6px" }}>
					{[7, 30, 90].map((d) => (
						<button
							key={d}
							type="button"
							onClick={() => setDaysFilter(d)}
							style={{
								padding: "6px 12px",
								fontSize: "13px",
								fontWeight: 500,
								color: daysFilter === d ? "#fff" : "#374151",
								backgroundColor:
									daysFilter === d ? "#18181b" : "#f3f4f6",
								border:
									daysFilter === d
										? "1px solid #18181b"
										: "1px solid #d1d5db",
								borderRadius: "6px",
								cursor: "pointer",
							}}
						>
							{d}d
						</button>
					))}
				</div>
			</div>

			{/* Stats Cards */}
			<div
				style={{
					display: "flex",
					gap: "12px",
					marginBottom: "24px",
				}}
			>
				<StatCard label="Today" value={overview?.today ?? 0} />
				<StatCard
					label="Last 30 Days"
					value={overview?.totalLast30 ?? 0}
				/>
				<StatCard
					label="Last Hour"
					value={realtime?.lastHour ?? 0}
					sub="auto-refreshes every 30s"
				/>
			</div>

			{/* Chart */}
			<div
				style={{
					backgroundColor: "#fff",
					border: "1px solid #e5e7eb",
					borderRadius: "8px",
					padding: "20px",
					marginBottom: "24px",
				}}
			>
				<h2
					style={{
						fontSize: "14px",
						fontWeight: 600,
						color: "#374151",
						margin: "0 0 16px",
					}}
				>
					Page Views (Last 30 Days)
				</h2>
				{overview?.days && <SimpleChart data={overview.days} height={180} />}
			</div>

			{/* Popular Content */}
			<div
				style={{
					backgroundColor: "#fff",
					border: "1px solid #e5e7eb",
					borderRadius: "8px",
					overflow: "hidden",
					marginBottom: "24px",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "16px 20px",
						borderBottom: "1px solid #e5e7eb",
					}}
				>
					<h2
						style={{
							fontSize: "14px",
							fontWeight: 600,
							color: "#374151",
							margin: 0,
						}}
					>
						Popular Content
					</h2>
					{collections.length > 0 && (
						<select
							value={collectionFilter}
							onChange={(e) => setCollectionFilter(e.target.value)}
							style={{
								padding: "4px 8px",
								fontSize: "12px",
								border: "1px solid #d1d5db",
								borderRadius: "4px",
								backgroundColor: "#fff",
								color: "#374151",
							}}
						>
							<option value="">All collections</option>
							{collections.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					)}
				</div>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr
							style={{
								backgroundColor: "#f9fafb",
								borderBottom: "1px solid #e5e7eb",
							}}
						>
							<th
								style={{
									padding: "10px 20px",
									textAlign: "left",
									fontSize: "11px",
									fontWeight: 600,
									color: "#6b7280",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									width: "40px",
								}}
							>
								#
							</th>
							<th
								style={{
									padding: "10px 16px",
									textAlign: "left",
									fontSize: "11px",
									fontWeight: 600,
									color: "#6b7280",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
								}}
							>
								Path
							</th>
							<th
								style={{
									padding: "10px 16px",
									textAlign: "left",
									fontSize: "11px",
									fontWeight: 600,
									color: "#6b7280",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
								}}
							>
								Collection
							</th>
							<th
								style={{
									padding: "10px 20px",
									textAlign: "right",
									fontSize: "11px",
									fontWeight: 600,
									color: "#6b7280",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
								}}
							>
								Views
							</th>
						</tr>
					</thead>
					<tbody>
						{(overview?.popular ?? [])
							.filter(
								(p) =>
									!collectionFilter ||
									p.collection === collectionFilter,
							)
							.map((entry, idx) => (
								<tr
									key={entry.path}
									style={{
										borderBottom: "1px solid #f3f4f6",
									}}
								>
									<td
										style={{
											padding: "10px 20px",
											fontSize: "13px",
											color: "#9ca3af",
										}}
									>
										{idx + 1}
									</td>
									<td
										style={{
											padding: "10px 16px",
											fontSize: "13px",
											fontWeight: 500,
											color: "#18181b",
											fontFamily:
												"ui-monospace, SFMono-Regular, monospace",
										}}
									>
										{entry.path}
									</td>
									<td
										style={{
											padding: "10px 16px",
										}}
									>
										<CollectionBadge
											collection={entry.collection}
										/>
									</td>
									<td
										style={{
											padding: "10px 20px",
											textAlign: "right",
											fontSize: "13px",
											fontWeight: 600,
											color: "#374151",
										}}
									>
										{(entry.views ?? 0).toLocaleString()}
									</td>
								</tr>
							))}
						{(overview?.popular ?? []).length === 0 && (
							<tr>
								<td
									colSpan={4}
									style={{
										padding: "32px",
										textAlign: "center",
										color: "#9ca3af",
										fontSize: "14px",
									}}
								>
									No page views recorded yet. Views will appear here
									as visitors browse your site.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Content breakdown */}
			{contentData && contentData.topContent.length > 0 && (
				<div
					style={{
						backgroundColor: "#fff",
						border: "1px solid #e5e7eb",
						borderRadius: "8px",
						padding: "20px",
					}}
				>
					<h2
						style={{
							fontSize: "14px",
							fontWeight: 600,
							color: "#374151",
							margin: "0 0 12px",
						}}
					>
						Content Breakdown (Last {daysFilter} Days)
					</h2>
					<div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "12px" }}>
						Total views: {(contentData?.total ?? 0).toLocaleString()}
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						{contentData.topContent.slice(0, 10).map((item) => {
							const pct =
								contentData.total > 0
									? (item.views / contentData.total) * 100
									: 0;
							return (
								<div
									key={item.path}
									style={{
										display: "flex",
										alignItems: "center",
										gap: "8px",
									}}
								>
									<span
										style={{
											flex: 1,
											fontSize: "13px",
											fontFamily:
												"ui-monospace, SFMono-Regular, monospace",
											color: "#374151",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{item.path}
									</span>
									<div
										style={{
											width: "120px",
											height: "6px",
											backgroundColor: "#f3f4f6",
											borderRadius: "3px",
											overflow: "hidden",
										}}
									>
										<div
											style={{
												width: `${Math.max(pct, 2)}%`,
												height: "100%",
												backgroundColor: "#3b82f6",
												borderRadius: "3px",
											}}
										/>
									</div>
									<span
										style={{
											fontSize: "12px",
											fontWeight: 600,
											color: "#6b7280",
											minWidth: "40px",
											textAlign: "right",
										}}
									>
										{item.views}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// Dashboard Widget: Views Today
// =============================================================================

function ViewsTodayWidget() {
	const [todayViews, setTodayViews] = React.useState<number>(0);
	const [sparkData, setSparkData] = React.useState<number[]>([]);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		async function load() {
			try {
				const res = await apiGet("stats/overview");
				if (!res.ok) return;
				const data: OverviewData = await res.json();
				setTodayViews(data.today);
				// Last 7 days for sparkline
				const last7 = data.days.slice(-7).map((d) => d.views);
				setSparkData(last7);
			} catch {
				// silent fail
			} finally {
				setLoading(false);
			}
		}
		load();
	}, []);

	if (loading) {
		return (
			<div
				style={{
					padding: "16px",
					textAlign: "center",
					color: "#9ca3af",
					fontSize: "13px",
				}}
			>
				Loading...
			</div>
		);
	}

	return (
		<div style={{ padding: "16px" }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-end",
				}}
			>
				<div>
					<div
						style={{
							fontSize: "32px",
							fontWeight: 700,
							color: "#18181b",
							lineHeight: 1,
						}}
					>
						{(todayViews ?? 0).toLocaleString()}
					</div>
					<div
						style={{
							fontSize: "12px",
							color: "#9ca3af",
							marginTop: "4px",
						}}
					>
						views today
					</div>
				</div>
				<Sparkline data={sparkData} width={100} height={28} />
			</div>
		</div>
	);
}

// =============================================================================
// Exports
// =============================================================================

export const pages: PluginAdminExports["pages"] = {
	"/": AnalyticsPage,
};

export const widgets: PluginAdminExports["widgets"] = {
	"views-today": ViewsTodayWidget,
};
