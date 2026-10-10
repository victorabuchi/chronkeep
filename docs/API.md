# ChronKeep API

The server is plain HTTP + JSON (`server.js`, no framework). The web app is its only client today; a mobile app can use the same endpoints.
Run it with `node server.js`, default `http://localhost:3000`. All bodies and responses are JSON unless noted.

## Access

| Who | Needs |
| --- | --- |
| This computer (loopback) | nothing |
| Another device on the network | **Customize > Other devices**: set a PIN and switch on "Allow other devices". The server then listens on `0.0.0.0`. |

- `POST /api/login` `{ "pin": "482916" }` sets an `HttpOnly` cookie `ck` (30 days, max 20 sessions). Wrong PINs: 401; five in a row from one address: 429 for a minute. Without the cookie, `/api/*` answers `401 { error }`.
- `POST /api/logout` clears it. `PUT /api/security` (PIN, network switch) works **only from the computer itself**.
- Requests are refused with `421` unless the `Host` header is `localhost`, `127.0.0.1`, `::1` or (with network access on) a private IP / `*.local` name.
- State-changing requests that carry an `Origin` header must have the same origin as the `Host` (`403` otherwise). Native apps send no `Origin`, so they are unaffected.

## Time and dates

Everything is **local wall-clock time of the computer running the server**, as strings: dates `YYYY-MM-DD`, times `HH:MM`. There are no time zones or UTC timestamps in items (only `doneAt`, `deletedAt`, `addedAt`, which are epoch milliseconds).

## Item

```jsonc
{
  "id": "uuid",
  "type": "assignment" | "event" | "todo",
  "title": "Robotics report",
  "notes": "", "location": "",
  "date": "2026-10-13",          // due date (assignment/todo) or start date (event); "" = no date
  "time": "23:59",               // due time or start time; "" = all day
  "endTime": "", "endDate": "",  // events only; an end time earlier than the start means "next day"
  "category": "Study",           // a course name from settings.categories
  "priority": "" | "low" | "medium" | "high",   // not for events
  "subtasks": [{ "id": "a1b2c3d4", "text": "Collect data", "done": false }],
  "attachments": [{ "id": "8hexchars", "name": "notes.pdf", "size": 1234, "type": "application/pdf", "addedAt": 0 }],
  "done": false, "doneAt": null,       // one-off items
  "doneOn": ["2026-10-13"],            // repeating items: the occurrence dates ticked off
  "reminders": [1440, 180],            // one-off reminders, minutes before the due time / start
  "nudges": [{ "from": "day" | 525600 | 60, "every": 30 }],   // repeating reminders, see below
  "repeat": "none" | "daily" | "weekly" | "monthly",
  "repeatUntil": "", "skip": ["2026-10-20"],   // last day of the series; days removed from it
  "source": { "feed": "uuid", "key": "uid" }   // present when it came from a calendar link or file
}
```

**Which days an item appears on** is defined in `public/recur.js` (`occursOn`, `startFor`, `segment`), written to run in the browser, in Node and in a mobile web view. Reuse that file or port it exactly.

**Repeating reminders (`nudges`):** each rule starts `from` minutes before the due time (`"day"` = from midnight of the due day, `525600` = "right away") and repeats `every` minutes. Of the rules that have started, the one with the smallest `from` wins. They continue until the item is ticked off, then (non-repeating items) overdue items are nagged every `settings.nagHours`.

## Endpoints

**Data**

| Method and path | Body / notes | Returns |
| --- | --- | --- |
| `GET /api/state` | | `{ settings, items, notepad, profile, trash, security, mac }` (everything the page needs) |
| `POST /api/items` | an item (any subset of fields) | the new item |
| `PUT /api/items/:id` | fields to change. `attachments` and `source` are ignored. | the item |
| `DELETE /api/items/:id` | moves it to the bin | the item with `deletedAt` |
| `POST /api/items/:id/occurrence` | `{ occ: "YYYY-MM-DD", patch: {...} }` splits one occurrence out of a repeating item | `{ original, created }` |
| `POST /api/trash/:id/restore` | | the item |
| `DELETE /api/trash/:id`, `DELETE /api/trash` | delete forever / empty the bin | `{ ok }` |
| `PUT /api/settings` | any settings keys | settings |
| `PUT /api/profile` | `{ name, email, phone, photo }` (photo = `data:image/jpeg\|png\|webp;base64,...`, under 600 KB) | profile |
| `PUT /api/notepad` | `{ html }` | `{ html, at }` |

**Files:** `POST /api/items/:id/files?name=<urlencoded>` with the raw bytes as the body and the file's `Content-Type` (max 10 MB, 10 per item) returns the attachment; `GET /api/files/:itemId/:attId` downloads it; `DELETE /api/items/:id/files/:attId` removes it.

**Notifications**

| Method and path | Notes |
| --- | --- |
| `GET /api/notifications` | `{ history: [...], upcoming: [...] }`: what was sent, and what is scheduled (one-off reminders, next repeating reminder, overdue nags, morning summary, snooze endings) |
| `POST /api/act` | `{ itemId, date, action: "done" \| "snooze", minutes }` (what the Snooze and Done buttons call) |
| `POST/GET /api/act/<signed token>` | the same, from a phone notification button, no login; tokens are signed, expire after 7 days |
| `POST /api/test` | sends a test notification |

Phone push today goes through **ntfy**: the server posts to `settings.ntfyServer/settings.ntfyTopic` (the topic is random per install and shown in Customize). When network access is on, the push carries Snooze/Done action buttons and a click link.

**Calendars:** `GET/POST /api/feeds`, `PUT/DELETE /api/feeds/:id`, `POST /api/feeds/:id/sync` (links are never returned, only a masked host); `POST /api/import` `{ name, ics, category }`; `GET /api/calendar.ics` (your own items as an iCalendar file).

**Account:** `GET /api/export`, `DELETE /api/account` `{ confirm }`, `GET/POST /api/backups`, `POST /api/backups/:name/restore`.

## Known gaps for a mobile client

1. **Reachability.** The server only answers on the computer it runs on (and, with a PIN, the same Wi-Fi). Away from home the phone needs a tunnel (for example Tailscale) or the server hosted somewhere always on. Plain `http://` to a non-local host is blocked by default on iOS; use HTTPS (a tunnel provides it).
2. **No change tracking.** Items have no `updatedAt` or revision, there is no "changes since" endpoint, and deletions are not reported to a client that was offline. A mobile app today must poll `GET /api/state` and last write wins. A proper offline-first client needs `updatedAt` on items, `GET /api/changes?since=`, and tombstones.
3. **Cookie sessions only.** Fine for a web view; a native app is easier with a bearer token endpoint.
4. **Push.** Phone alerts rely on the ntfy app. A mobile app can do better by scheduling **local notifications itself** from `items` (`reminders`, `nudges`, `snooze`), which also works offline. iOS keeps at most 64 pending local notifications, so schedule a rolling window and refresh it when the app opens.
5. **Time zones.** All times are the server's local time; a phone in another zone will show the same wall-clock times.
6. **One user.** There is a single profile and no accounts.
7. **Web-view origins.** A Capacitor/Cordova web view sends an `Origin` such as `capacitor://localhost`, which the same-origin check rejects for changes; an allow-list setting would be needed.
