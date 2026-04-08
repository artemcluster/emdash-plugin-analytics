# emdash-plugin-analytics

Page view analytics plugin for [EmDash CMS](https://emdashcms.com). Instant tracking, real-time dashboard, popular content — zero external services.

## Features

- **Instant tracking** — every page view is counted immediately, no cron jobs or batch processing
- **Works with all Content Types** — posts, pages, and any custom collections
- **Dashboard** — bar chart of views over time, stat cards, popular content table
- **Real-time counter** — "Last Hour" views with 30-second auto-refresh
- **Dashboard widget** — compact view count with 7-day sparkline on the admin home page
- **Per-collection filtering** — filter analytics by any content type
- **Privacy-friendly** — no cookies, no external services, all data stays in your database
- **Auto-injected** — tracking script is added to all pages automatically via the plugin system

## Installation

```bash
npm install emdash-plugin-analytics
```

## Setup

### 1. Register the plugin

```js
// astro.config.mjs
import { analyticsPlugin } from "emdash-plugin-analytics";
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      // ... your emdash config
      plugins: [analyticsPlugin()],
    }),
  ],
});
```

That's it. No additional configuration needed.

### 2. View analytics

Go to **Admin Panel > Plugins > Analytics** to see:

- **Today / Last 30 Days / Last Hour** — stat cards at the top
- **Views chart** — daily page views as a bar chart (7d / 30d / 90d range selector)
- **Popular Content** — table of most viewed pages with collection badges
- **Collection filter** — dropdown to view analytics for a specific content type

The **Page Views** widget also appears on the admin dashboard home page.

## How it works

### Tracking

The plugin injects a tiny beacon script on every page via the `page:fragments` hook. On page load, the script sends a `navigator.sendBeacon()` request to the plugin's public API endpoint with:

- Page path
- Referrer
- Screen width
- Locale
- Content type (collection) and content ID (auto-detected)

The tracking script:
- Skips admin pages (`/_emdash/*`)
- Uses `requestIdleCallback` to avoid blocking rendering
- Sends no cookies — fully privacy-friendly

### Storage

Each page view is stored as a document in EmDash's plugin storage system. Daily summaries and popular content lists are updated in KV (key-value store) on every view — no cron jobs needed.

### Admin UI

The dashboard reads pre-aggregated data from KV for instant loading. The chart uses `@cloudflare/kumo` components. Real-time counter refreshes every 30 seconds.

## API

The plugin exposes routes at `/_emdash/api/plugins/analytics/`:

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `track` | Public | Record a page view (used by beacon script) |
| GET | `stats/overview` | Admin | Last 30 days summary + popular content |
| GET | `stats/content` | Admin | Per-collection breakdown |
| GET | `stats/realtime` | Admin | Views in the last hour |

### Track endpoint payload

```json
{
  "path": "/posts/my-post",
  "referrer": "https://google.com",
  "screenWidth": 1920,
  "locale": "en",
  "collection": "posts",
  "contentId": "01ABC..."
}
```

## For AI / LLM Agents

Step-by-step instructions for AI coding agents to install and configure this plugin correctly.

### Quick install

```bash
npm install emdash-plugin-analytics
```

### Step-by-step configuration

**Step 1.** Open `astro.config.mjs` and add the import at the top:

```js
import { analyticsPlugin } from "emdash-plugin-analytics";
```

**Step 2.** Add `analyticsPlugin()` to the `plugins` array inside the `emdash({})` integration:

```js
integrations: [
  emdash({
    // ... existing config
    plugins: [
      // ... any existing plugins
      analyticsPlugin(),
    ],
  }),
],
```

**Step 3.** Restart the dev server. That's all — no additional configuration needed.

### Verification checklist

After installation, verify:

1. Visit any page on the site (e.g., `http://localhost:4321/`)
2. Open browser DevTools > Network tab — you should see a beacon request to `/_emdash/api/plugins/analytics/track`
3. Go to `http://localhost:4321/_emdash/admin/plugins/analytics/` — the Analytics dashboard should show
4. The "Today" stat card should show at least 1 view
5. The admin home page should show the "Page Views" widget

### Architecture notes

- The plugin uses EmDash's **plugin storage** for raw pageviews and **KV store** for pre-aggregated summaries
- Tracking is injected via the **`page:fragments`** hook — no theme changes needed
- The `track` route is **`public: true`** — no authentication required for the beacon
- All aggregation happens **inline in the track handler** — no cron jobs
- Admin routes require authentication — only admins can view analytics
- The plugin automatically detects collection/contentId from EmDash's page context

### Common mistakes to avoid

- **Do NOT** add the tracking script manually — the plugin injects it automatically
- **Do NOT** set up cron jobs — aggregation is instant
- **Do NOT** worry about Content Types — the plugin works with all collections automatically

## Requirements

- EmDash CMS >= 0.1.0
- Astro >= 6.0.0
- Node.js >= 22

## License

MIT
