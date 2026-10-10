// ---------------------------------------------------------------- typing a sentence
// "Robotics report due Sunday 11pm" -> an assignment on Sunday at 23:00, in the right course, with the usual reminders.
function parseText(text, fallback = {}) {
  const p = Quick.parseQuick(text, { categories: S.categories });
  const type = p.type || fallback.type || 'todo', date = p.date || fallback.date || '';
  return { p, body: { type, title: p.title || text.trim(), date, time: p.time || fallback.time || (type === 'assignment' && date ? S.dueTime : ''), category: p.category || fallback.category || '', repeat: p.repeat || 'none', reminders: date ? [...(S.reminderDefaults[type] || [])] : [], nudges: date ? (S.nudgeDefaults[type] || []).map((r) => ({ ...r })) : [] } };
}
async function createFromText(text, fallback) {
  const { body } = parseText(text, fallback);
  const it = await api('POST', '/api/items', body);
  items.push(it);
  if (it.date) { cur = day(it.date); autoscroll = true; }
  render();
  toast(`Added "${it.title}"${it.date ? ` for ${fmtDay(it.date)}${it.time ? ' at ' + it.time : ''}` : ''}`, 'Undo', async () => { await api('DELETE', '/api/items/' + it.id); items = items.filter((x) => x.id !== it.id); render(); });
  return it;
}
const previewOf = (text, fallback) => { const { p, body } = parseText(text, fallback); const d = Quick.describe({ type: body.type, date: body.date, time: body.time, repeat: body.repeat === 'none' ? '' : body.repeat, category: body.category }); return { p, label: d }; };
