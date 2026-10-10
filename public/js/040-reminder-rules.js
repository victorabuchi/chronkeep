// ---------------------------------------------------------------- repeating reminders editor
function nudgeEditor(box, rules, onChange) {
  const draw = () => {
    rules.sort((a, b) => rank(b) - rank(a));
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    box.innerHTML = `<div class="nud">${rules.map((r, i) => `<div class="nrow"><select data-i="${i}" data-k="from" aria-label="Start">${opt(FROM, r.from)}</select><span>every</span><select data-i="${i}" data-k="every" aria-label="Interval">${opt(EVERY.some(([v]) => v === +r.every) ? EVERY : [...EVERY, [+r.every, `${r.every} min`]], r.every)}</select><button type="button" class="nx" data-x="${i}" aria-label="Remove">✕</button></div>`).join('')}<button type="button" class="btn ghost sm" data-add>+ Add a repeating reminder</button></div>`;
    box.querySelectorAll('select').forEach((el) => (el.onchange = () => { const r = rules[el.dataset.i]; r[el.dataset.k] = el.dataset.k === 'from' ? (el.value === 'day' ? 'day' : +el.value) : +el.value; onChange?.(); draw(); }));
    box.querySelectorAll('[data-x]').forEach((el) => (el.onclick = () => { rules.splice(el.dataset.x, 1); onChange?.(); draw(); }));
    box.querySelector('[data-add]').onclick = () => { rules.push({ from: 525600, every: 30 }); onChange?.(); draw(); };
  };
  draw();
}
