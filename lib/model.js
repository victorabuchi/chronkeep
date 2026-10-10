// The shape of a person's ChronKeep data, and how older saved data is brought up to date.
const crypto = require('crypto');

const defaults = () => ({
  settings: {
    name: 'ChronKeep',
    userName: '',
    accent: '#3b5bdb',
    theme: 'auto',
    weekStart: 1,
    showWeekends: true,
    dayStart: 7,
    dayEnd: 22,
    allDayHour: 9,
    dueTime: '23:59', // assignments with no time are due at the end of the day
    // Minutes before the due time / start. 0 = at the time.
    reminderDefaults: { assignment: [4320, 1440, 180, 30], event: [10], todo: [0] },
    // Repeating reminders. Each rule: from = minutes before the deadline ('day' = from midnight
    // of the due day), every = minutes between reminders. The latest rule that applies wins.
    nudgeDefaults: { assignment: [{ from: 'day', every: 60 }, { from: 60, every: 10 }], event: [], todo: [] },
    nagHours: 6, // keep reminding about overdue, unticked items every N hours (0 = off)
    digestHour: 8, // a morning summary of today + overdue (-1 = off)
    categories: [
      { name: 'Study', color: '#7c5cf0' },
      { name: 'Work', color: '#0e8fb0' },
      { name: 'Personal', color: '#d6457a' },
      { name: 'Health', color: '#16a36a' },
    ],
    ntfyTopic: 'planner-' + crypto.randomBytes(6).toString('hex'),
    ntfyServer: 'https://ntfy.sh',
    // Shown on phone notifications (ntfy fetches it, so it must be a public URL).
    notifyIcon: 'https://raw.githubusercontent.com/victorabuchi/chronkeep/main/public/icon-512.png',
    notifyMac: true,
    notifyPhone: true,
  },
  profile: { name: '', email: '', phone: '', photo: '' },
  history: [],
  trash: [],
  // Who may reach the server. Kept out of `settings` so the page never receives the PIN hash.
  security: { lan: false, pin: null, sessions: [] },
  items: [],
  notified: [],
  lastDigest: '',
  nudged: {},
  snoozed: {},
  feeds: [], // calendar links to follow. The links hold private tokens, so the page only ever gets masked copies.
  ignored: [], // imported events you deleted, so a sync does not bring them back
  notepad: { html: '', at: null },
});

// Turns whatever was saved (possibly by an older version) into the current shape.
function normalize(saved) {
  const d = defaults();
  const out = { ...d, ...saved, settings: { ...d.settings, ...(saved && saved.settings) } };
  out.security = { ...d.security, ...out.security };
  if (!out.security.actionSecret) out.security.actionSecret = crypto.randomBytes(24).toString('hex');
  out.snoozed = out.snoozed || {};
  out.feeds = out.feeds || []; out.ignored = out.ignored || [];
  // The name used to live in settings; the profile now holds it.
  out.profile = { ...d.profile, ...out.profile };
  if (!out.profile.name && out.settings.userName) out.profile.name = out.settings.userName;
  delete out.settings.userName;
  // Settings saved by earlier versions: move to the current palette.
  delete out.settings.headerColor;
  if (out.settings.name === 'My Planner') out.settings.name = 'ChronKeep';
  if (['#7b2d6b', '#6366f1', '#0f7a63'].includes(out.settings.accent)) out.settings.accent = '#3b5bdb';
  const NEW = { Study: '#7c5cf0', Work: '#0e8fb0', Personal: '#d6457a', Health: '#16a36a' };
  const OLD = ['#b57cf0', '#6b8fd1', '#e0709a', '#3fb59c', '#6366f1', '#f59e0b', '#10b981'];
  for (const c of out.settings.categories) if (NEW[c.name] && OLD.includes(c.color)) c.color = NEW[c.name];
  // Older items had a single `remind`.
  for (const it of out.items) if (!Array.isArray(it.reminders)) it.reminders = it.remind != null && it.remind !== '' ? [Number(it.remind)] : [];
  return out;
}

module.exports = { defaults, normalize };
