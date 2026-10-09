<p align="center"><img src="public/logo.png" alt="ChronKeep" width="320"></p>

# ChronKeep

A personal calendar and to-do list that keeps reminding you until the work is done. Built for people who miss deadlines.

- **Calendar:** month, week and day views, with assignments, events and to-dos in one place.
- **Tasks page:** everything you owe, grouped as overdue, today, tomorrow, this week and later. Tick items off as you go.
- **Reminders that repeat:** one-off reminders ("1 day before") plus repeating rules ("every 30 min from now, then every 10 min on the due day") that continue until you tick the item. Overdue items keep nagging too.
- **Notifications:** native macOS notifications on your laptop, and push to your phone through [ntfy](https://ntfy.sh).
- **Note:** a floating note with checklists, tables and text styles, always one click away in the top bar.
- **Customisable:** accent colour (type any hex code), light/dark theme, courses and colours, day hours, reminder defaults.

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

## Layout

```
server.js        API, scheduler, notifications
public/          the web app (index.html, app.js, app.css, note.js, note.css)
data.json        your data (created on first run, git-ignored)
```
