# Scribbly — Full-Stack Quick Note Application

> 🔗 **Live Demo:** https://scribbly-quick-notes.onrender.com/

Scribbly is a modern, full-stack quick note-taking web application designed for fast capture, clean organization, and distraction-free reading and editing. Built with a Node.js/Express REST API and a zero-build Vanilla JavaScript frontend, it persists notes to local JSON storage while offering rich productivity tools like interactive checklists, inline slash commands, voice dictation, and two-way Markdown/JSON backups.

---

## Key Features

- **Full CRUD & Persistent JSON Storage:** Create, read, update, and delete notes persisted to `data/notes.json` via Node's `fs/promises` with serialized write locking and automatic backward compatibility for legacy notes.
- **Category Tags, Color Accents & Pinning:** Organize notes with category tags (`General`, `Work`, `Study`, `Ideas`, `Personal`), 6 subtle card color accents (`default`, `amber`, `emerald`, `sky`, `rose`, `violet`), and one-click pinning (pinned notes stay sorted at the top).
- **Interactive Checklists & Inline Code:** Lines starting with `- [ ] ` / `- [x] ` or `[ ] ` / `[x] ` render safely as clickable checkboxes that strike through completed items and persist updates asynchronously via `PUT /notes/:id`. Inline `` `code` `` snippets render as styled code pills.
- **Inline Slash Commands (`/`):** Typing `/` at the start of a line in the composer opens a floating command menu for `/todo`, `/code`, `/date` (`DD-MM-YYYY`), and `/divider`, navigable via arrow keys, `Enter`/`Tab`, or click.
- **Starter Templates:** Switch cleanly between `Study Summary`, `Code Snippet`, `Daily Checklist`, or `Clear / Blank Note` from the composer toolbar.
- **Voice-to-Note Dictation:** Built-in Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) microphone toggle streams speech directly into the note composer with a pulsing recording indicator.
- **Distraction-Free Focus Modal:** Click any note title or the expand icon (`maximize-2`) to open a blurred-backdrop Focus View modal featuring live checklist toggling, tag/color/pin controls, word count & estimated reading time, and seamless switching to Edit mode (`Ctrl + Enter` to save, `Esc` or outside click to close).
- **Grid / List View & Real-Time Filtering:** Switch between a balanced 2-column equal-height Grid View and a full-width multi-line List View (persisted in `localStorage`), filter by `All`, `Pinned`, or category tag, toggle `Newest`/`Oldest` sort, and search across titles, content, and tags (press `/` to focus search, `Esc` to clear).
- **Undo Delete Toast & Keyboard Shortcuts:** Deleting a note displays a 5-second toast with an **Undo** action that restores the note via `POST /notes`.
- **Dark / Light Mode Persistence:** Theme toggle across all cards, color tints, modals, and inputs persisted in `localStorage`.
- **Two-Way Backup (Export & Import):** Export all notes as formatted Markdown (`.md`) or full-fidelity `.json` backups, and import `.json` backups directly from the top navigation bar.

---

## Tech Stack

- **Backend:** Node.js, Express (`express`, `cors`)
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Icons & Typography:** Lucide Icons (`unpkg.com/lucide@latest`), Google Fonts (`Inter`, `Plus Jakarta Sans`)
- **Storage:** Local JSON file persistence (`data/notes.json` via `fs/promises`)

---

## Project Structure

```text
Scribbly/
├── data/
│   └── notes.json          # Auto-created JSON store for persisted notes
├── public/
│   ├── index.html          # App shell, composer, filter bar, Focus/Edit modal
│   ├── style.css           # Light/dark themes, color tints, Grid/List layouts
│   └── script.js           # Client state, safe DOM rendering, slash commands, API calls
├── .gitignore
├── package.json
├── README.md
└── server.js               # Express server and RESTful /notes API
```

---

## RESTful API Documentation

All endpoints accept and return JSON. `GET /notes` normalizes legacy note objects missing optional fields and sorts **pinned notes first**, followed by newest `id` first.

| Method | Endpoint | Request Body / Params | Behavior | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/notes` | None (client-side filtering/sorting applied in UI) | Returns all normalized notes sorted pinned-first, then newest `id` first | `200 OK`, `500 Internal Server Error` |
| `POST` | `/notes` | `{ content (required), title?, tag?, color?, pinned? }` | Validates non-empty trimmed `content`, assigns `id` & `created_at`, and persists to `data/notes.json` | `201 Created`, `400 Bad Request`, `500 Internal Server Error` |
| `PUT` | `/notes/:id` | URL `:id`; body supports partial/full `{ title?, content?, tag?, color?, pinned? }` | Validates `content` if provided, updates matching note, and persists to `data/notes.json` | `200 OK`, `400 Bad Request`, `404 Not Found`, `500 Internal Server Error` |
| `DELETE` | `/notes/:id` | URL `:id` | Removes the matching note from `data/notes.json` and returns `{ "message": "Deleted" }` | `200 OK`, `404 Not Found`, `500 Internal Server Error` |

### Note Object Schema

```json
{
  "id": 1732709400000,
  "title": "Sprint Planning",
  "content": "- [x] Finalize API schema\n- [ ] Run `npm start` smoke test",
  "tag": "Work",
  "color": "sky",
  "pinned": true,
  "created_at": "27-11-2026 05:30 PM"
}
```

*Defaults when omitted:* `title` → `""`, `tag` → `"General"`, `color` → `"default"` (allowed: `"default"`, `"amber"`, `"emerald"`, `"sky"`, `"rose"`, `"violet"`), `pinned` → `false`.

---

## Local Setup & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   The server runs on `http://localhost:3000` (or `process.env.PORT`), serves static assets from `public/`, and automatically initializes `data/notes.json` (`[]`) if missing.

---

## Deploying on Render

1. Push the repository to GitHub (ignoring `node_modules/` and `.env` via `.gitignore`).
2. Create a new **Web Service** on Render connected to the repository:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Once deployed, paste your service URL into the **Live Demo** placeholder at the top of this README.
