# Veghe

Web dashboard for video anomaly detection on multiple surveillance cameras,
built for a bachelor thesis. Two detector families feed it:

- **Unsupervised**: pose-based, learns only normal behaviour per camera. Implemented.
- **Supervised**: trained on labelled anomalies (fight, fall). Not built yet.

Product name: **Veghe**.

## Layout

- `frontend/` — React + Vite + TypeScript + Tailwind CSS v4. Dev server on port 5180
  (`npm run dev`), production build with `npm run build`.
- `frontend/src/mock/` — mock data (`cameras.json`, `incidents.json`) following the
  event contract below. No backend yet.
- `frontend/src/components/` — TopBar, PipelineStatus, CameraGrid, CameraTile,
  FocusTile, AddCameraTile, AlarmTimeline, IncidentQueue, IncidentCard, ScoreMeter.
- Visual checks: Playwright is installed locally in `frontend` with browsers inside
  `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0`). Script: `frontend/scripts/screenshot.mjs`.

## Event contract

```ts
Incident {
  id, camera_id,
  type: "fight" | "fall" | "unusual_posture" | "other",
  started_at, ended_at, alarm_count,
  raised_by: "supervised" | "unsupervised" | "both",
  scores: { supervised: number | null, unsupervised: number | null },
  thresholds: { supervised: number, unsupervised: number },
  caption: string | null, clip_url: string | null,
  status: "needs_review" | "confirmed" | "false_alarm"
}

Camera {
  id, name, stream_url, people_count, to_review,
  supervised: "on" | "off",
  unsupervised: "collecting" | "learning" | "ready" | "off",
  learning_progress: number | null
}
```

## Design tokens

| Token | Value |
| --- | --- |
| page | `#0C141F` |
| header | `#0F1925` |
| panel | `#111B29` |
| card | `#16233A` |
| video | `#0A111A` |
| lines | `#1F2F44`, `#24354C` |
| text | `#E7EEF6` |
| text-secondary | `#C3CFDC` |
| muted | `#8C9DB2` |
| supervised (amber) | `#F2B04A` |
| unsupervised (blue) | `#5AA9F2` |
| live anomaly (red) | `#FF6B6B` |
| healthy (green) | `#4ED3A3` |

Fonts from Google Fonts: **Barlow** (UI, 14px base) and **Barlow Semi Condensed**
(numbers, chips, clock). Tabular numerals everywhere.

Tokens live in `frontend/src/index.css` under `@theme` (Tailwind v4), e.g.
`bg-panel`, `text-muted`, `border-line`, `text-sup`, `bg-unsup`, `text-alarm`.

## Rules

- Red only for a live anomaly. Review counts use a neutral white pill.
- Filled dot = model active, hollow ring = not active yet.
- Sentence case, no all-caps labels.
- Icons are simple outline SVGs, no emoji.
- Only create or change files inside this project folder; never install anything globally.
