<p align="center"><img src="public/logo.png" alt="ChronKeep" width="320"></p>

# ChronKeep

A personal calendar and to-do list that keeps reminding you until the work is done. Built for people who miss deadlines.

- **Search:** find any item on any date from the top bar (press `/`).
- **Calendar:** month, week and day views, with assignments, events and to-dos in one place.
- **Tasks page:** everything you owe, grouped as overdue, today, tomorrow, this week and later. Tick items off as you go.
- **History:** completed assignments and to-dos (with "on time" or "2 h late" badges and an Undo) and past events, with a 30-day summary.
- **Bin:** deleted tasks and events wait here for 30 days. Restore them, delete them for good, or undo straight from the toast.
- **Reminders that repeat:** one-off reminders ("1 day before") plus repeating rules ("every 30 min from now, then every 10 min on the due day") that continue until you tick the item. Overdue items keep nagging too.
- **Notifications:** native macOS notifications on your laptop, and push to your phone through [ntfy](https://ntfy.sh).
- **Note:** a floating note with checklists, tables and text styles, always one click away in the top bar.
- **Settings:** profile picture, name, email and phone, a one-click export of your data, and delete account.
- **Customisable:** the Customize page changes the accent colour (type any hex code), theme, courses and colours, day hours and reminder defaults.

No dependencies, no build step. Your data stays on your machine in `data.json`.

## Run

```
node server.js        # or: npm start
```

Open http://localhost:3000. Use `PORT=3001 node server.js` for another port.

## Phone notifications

1. Install the free **ntfy** app.
2. Subscribe to the topic shown in **Customize** (a random name generated on first run; treat it like a password).
3. Press **Send test** in Customize.

Reminders only fire while the server is running.

## Mac notifications

Popups come from a tiny `ChronKeep.app` (built automatically on first run into `~/Library/Application Support/ChronKeep/`), so they show the ChronKeep icon rather than Script Editor's scroll. Rebuild it any time with `./mac/build-notifier.sh`. If a popup does not appear, check **System Settings > Notifications > ChronKeep** is allowed. macOS silently discards notifications from an app that was denied permission, and the server log cannot tell. Customize has a button that opens that pane.

## Layout

```
server.js        API, scheduler, notifications
mac/             builds the ChronKeep.app that Mac notifications come from
public/          the web app (index.html, app.js, app.css, note.js, note.css)
data.json        your data (created on first run, git-ignored)
```

## Access

ChronKeep only listens on this computer. To open it from your phone or another computer on your Wi-Fi, go to **Customize > Other devices**, set a PIN (6 to 12 digits) and switch on "Allow other devices". Other devices must enter the PIN; five wrong tries lock that address out for a minute. Settings can only be changed from the computer ChronKeep runs on.
