// The pictures the film plays through: the real web app in its desktop and phone layouts.
// Read-only states first, then the ones that change data (adding and ticking off a task).
// `set` is 'desktop' (1100 x 700) or 'phone' (390 x 780, the narrow layout with the tab bar).
module.exports.run = async ({ chrome: c, base, OUT, film, sleep }, set = 'desktop') => {
  const phone = set === 'phone', W = phone ? 390 : 1100, H = phone ? 780 : 700, pre = phone ? 'p' : 'd';
  await c.viewport(W, H, phone ? 3 : 2, phone);
  const D = (film[set] = { size: [W, H], frames: {}, rects: {} });
  const shot = async (name) => { await c.shot(`${OUT}/${pre}-${name}.webp`, { format: 'webp', quality: phone ? 86 : 90 }); D.frames[name] = `${pre}-${name}.webp`; };
  const fresh = async (js) => { await c.goto(base + '/'); await c.eval('localStorage.clear(); sessionStorage.clear()'); await c.goto(base + '/'); for (let i = 0; i < 40 && !(await c.eval("!!document.querySelector('#btnAdd') && document.querySelectorAll('.chip,.ev,.trow').length > 3")); i++) await sleep(150); await sleep(500); if (js) await c.eval(js); await sleep(600); };
  const click = (sel) => c.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const type = (sel, text) => c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const box = (expr) => c.eval(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(text)}))`;
  const tasksPage = phone ? `document.querySelector('#navTasks').click()` : null;
  const R = (k, v) => { if (!v) throw new Error('no box for ' + k); D.rects[k] = v; };

  // the week
  await fresh();
  await shot('week');
  R('newBtn', await box(`document.querySelector('#btnAdd')`));
  R('roboticsChip', await box(byText('.chip', 'Robotics report')));
  R('monthBtn', await box(`document.querySelector('[data-v="month"]')`));
  R('lectureEv', await box(byText('.ev', 'Web Programming seminar')));
  R('bell', await box(`document.querySelector('#btnBell')`));

  // the month
  await fresh(`document.querySelector('[data-v="month"]').click()`);
  await shot('month');

  // opening a deadline
  await fresh(`${byText('.chip', 'Robotics report')}.click()`);
  await shot('edit');
  R('dlgSave', await box(`document.querySelector('#form button:not([type=button])')`));
  R('dlgCancel', await box(`document.querySelector('#fCancel')`));
  await c.eval(`document.querySelector('#fRem').scrollIntoView({ block: 'center' })`); await sleep(400);
  await shot('edit-reminders');
  R('remChips', await box(`document.querySelector('#fRem')`));
  R('nudges', await box(`document.querySelector('#fNud')`));

  // the bell
  await fresh(`document.querySelector('#btnBell').click()`);
  await shot('bell');
  R('bellPop', await box(`document.querySelector('#nPop')`));

  // history and customize and bin
  await fresh(`document.querySelector('#railHistory').click()`);
  await shot('history');
  R('histStats', await box(`document.querySelector('#hStats')`));
  await fresh(`document.querySelector('#railSet').click()`);
  await shot('customize');
  R('railSet', await box(`document.querySelector('#railSet')`));
  R('railHistory', await box(`document.querySelector('#railHistory')`));

  // search
  await fresh(`(() => { const q = document.querySelector('#q'); q.focus(); q.value = 'rob'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await shot('search');
  R('search', await box(`document.querySelector('#q')`));

  // typing a sentence into quick add, then adding it
  const sentence = 'Machine Learning proposal due Friday 11pm';
  await fresh(`document.querySelector('#qTitle').focus()`);
  R('qTitle', await box(`document.querySelector('#qTitle')`));
  await shot('q0');
  const cuts = [0.2, 0.45, 0.7, 1];
  for (let i = 0; i < cuts.length; i++) { await type('#qTitle', sentence.slice(0, Math.round(sentence.length * cuts[i]))); await sleep(350); await shot(`q${i + 1}`); }
  R('qPrev', await box(`document.querySelector('#qPrev')`));
  await c.eval(`document.querySelector('#qTitle').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); document.querySelector('#quick').requestSubmit()`);
  await sleep(900);
  await shot('q-added');

  // ticking a task off
  await fresh();
  R('tickRow', await box(`${byText('.trow', 'Statistics homework')}.querySelector('[data-tick]')`));
  await shot('t0');
  await c.eval(`${byText('.trow', 'Statistics homework')}.querySelector('[data-tick]').click()`);
  await sleep(160); await shot('t1');
  await sleep(1100); await shot('t2');
};
