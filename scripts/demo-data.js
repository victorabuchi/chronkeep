// A believable week for screenshots. Dates are relative to today, so the pictures always look current.
const crypto = require('node:crypto');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The Monday morning the pictures pretend it is: the coming Monday (or today, if it is Monday before noon), 09:40.
function pretendNow(real = new Date()) {
  const d = new Date(real.getFullYear(), real.getMonth(), real.getDate(), 9, 40);
  const add = (8 - d.getDay()) % 7;
  if (!(d.getDay() === 1 && real.getHours() < 12)) d.setDate(d.getDate() + (add || 7));
  return d;
}

function demo(now = pretendNow()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const at = (n) => { const d = new Date(monday); d.setDate(d.getDate() + n); return ymd(d); };
  const today = ymd(now);
  const base = { notes: '', location: '', endTime: '', endDate: '', priority: '', subtasks: [], attachments: [], done: false, doneOn: [], reminders: [], nudges: [], repeat: 'none' };
  const mk = (o) => ({ id: crypto.randomUUID(), ...base, ...o });
  const rem = { assignment: [1440, 180], event: [10] };
  const nud = [{ from: 'day', every: 60 }, { from: 60, every: 10 }];
  const sub = (...t) => t.map(([text, done]) => ({ id: crypto.randomBytes(4).toString('hex'), text, done: !!done }));
  const soon = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return ymd(d); };
  return [
    mk({ type: 'event', title: 'Machine Learning lecture', date: at(0), time: '10:15', endTime: '12:00', category: 'Study', location: 'Metria ML100', reminders: rem.event }),
    mk({ type: 'event', title: 'Robotics lab', date: at(1), time: '13:00', endTime: '15:00', category: 'Study', location: 'Lab 3', reminders: rem.event }),
    mk({ type: 'event', title: 'Web Programming seminar', date: at(2), time: '09:00', endTime: '11:00', category: 'Study', location: 'Snellmania SN200', reminders: rem.event }),
    mk({ type: 'event', title: 'Statistics lecture', date: at(3), time: '12:15', endTime: '14:00', category: 'Study', location: 'Tietoteknia TT', reminders: rem.event }),
    mk({ type: 'event', title: 'Thesis supervision', date: at(4), time: '14:00', endTime: '15:00', category: 'Work', location: 'Teams', reminders: rem.event }),
    mk({ type: 'event', title: 'Shift at the library', date: at(5), time: '10:00', endTime: '16:00', category: 'Work' }),
    mk({ type: 'event', title: 'Dinner with family', date: at(6), time: '18:00', endTime: '20:00', category: 'Personal' }),
    mk({ type: 'event', title: 'Gym', date: at(0), time: '17:00', endTime: '18:00', category: 'Health', repeat: 'weekly' }),
    mk({ type: 'event', title: 'Gym', date: at(2), time: '17:00', endTime: '18:00', category: 'Health', repeat: 'weekly' }),
    mk({ type: 'assignment', title: 'Robotics report', date: soon(2), time: '15:00', category: 'Study', priority: 'high', reminders: rem.assignment, nudges: nud, subtasks: sub(['Collect sensor data', true], ['Write the analysis', false], ['Add figures', false]) }),
    mk({ type: 'assignment', title: 'Web Programming essay', date: at(2), time: '12:00', category: 'Study', priority: 'medium', reminders: rem.assignment, nudges: nud }),
    mk({ type: 'assignment', title: 'Statistics homework', date: at(-1), time: '18:00', category: 'Study', reminders: rem.assignment }),
    mk({ type: 'assignment', title: 'Machine Learning project', date: soon(9), time: '17:00', category: 'Study', priority: 'high', reminders: rem.assignment, nudges: nud }),
    mk({ type: 'assignment', title: 'Algorithms exercise 4', date: soon(-2), time: '23:59', category: 'Study', done: true, doneAt: Date.now() - 3 * 86400000 }),
    mk({ type: 'assignment', title: 'Database design report', date: soon(-5), time: '23:59', category: 'Study', done: true, doneAt: Date.now() - 5.5 * 86400000 }),
    mk({ type: 'todo', title: 'Buy groceries', date: today, category: 'Personal', reminders: [0] }),
    mk({ type: 'todo', title: 'Renew library card', date: soon(3), category: 'Personal' }),
  ];
}
module.exports = { demo, pretendNow };
