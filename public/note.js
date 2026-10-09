// The floating note from pursecast, ported from React to plain JS. Same markup,
// same classes (prefixed pn-), same behaviour: text styles, lists, checklists
// you tick, tables. Saved to the server as you type.
(function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const stamp = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${d.getHours()}.${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const STYLES = [['h1', 'Title', 'pn-sTitle'], ['h2', 'Heading', 'pn-sHeading'], ['h3', 'Subheading', 'pn-sSub'], ['body', 'Body', 'pn-sBody'], ['pre', 'Monostyled', 'pn-sMono']];
  const LISTS = [['bullet', '•  Bulleted List'], ['dash', '–  Dashed List'], ['number', '1.  Numbered List']];
  const INKS = ['', '#af52de', '#ff2d55', '#ff9500', '#34c759', '#007aff', '#a2845e'];
  const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const DOTS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>';
  const WIN_KEY = 'planner:win:note';
  const OPEN_KEY = 'planner:note-open';

  let win = null, topZ = 90;

  function html() {
    return `
<div class="pn-bar" data-drag>
  <span class="pn-lights">
    <button type="button" class="pn-lightRed" data-a="close" aria-label="Close"><svg class="pn-glyph" viewBox="0 0 12 12" width="8" height="8"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    <button type="button" class="pn-lightYellow" data-a="min" aria-label="Minimise"><svg class="pn-glyph" viewBox="0 0 12 12" width="8" height="8"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    <button type="button" class="pn-lightGreen" data-a="zoom" aria-label="Zoom"><svg class="pn-glyph" viewBox="0 0 12 12" width="8" height="8"><path d="M3.2 8.8V4.4l4.4 4.4ZM8.8 3.2v4.4L4.4 3.2Z" fill="currentColor"/></svg></button>
  </span>
  <b class="pn-title">New Note</b>
  <span class="pn-toolRow" data-keep>
    <span class="pn-pill" data-keep>
      <span class="pn-anchor">
        <button type="button" class="pn-tb" data-a="format" aria-label="Format" title="Format"><span class="pn-aa">Aa</span></button>
        <div class="pn-pop pn-formatPop" data-menu="format" hidden>
          <div class="pn-marks">
            <button type="button" data-mark="bold" aria-label="Bold"><b>B</b></button>
            <button type="button" data-mark="italic" aria-label="Italic"><i style="font-family:Georgia,serif">I</i></button>
            <button type="button" data-mark="underline" aria-label="Underline"><u>U</u></button>
            <button type="button" data-mark="strikeThrough" aria-label="Strikethrough"><s>S</s></button>
            <i class="pn-vsep"></i>
            <button type="button" data-a="hilite" aria-label="Highlight" title="Highlight"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l5 5-9 9H6v-5Z M4 21h16"/></svg></button>
            <span class="pn-anchor"><button type="button" data-a="ink" aria-label="Text colour" title="Text colour"><i class="pn-inkDot"></i></button></span>
          </div>
          <div class="pn-popSep"></div>
          ${STYLES.map(([b, l, c]) => `<button type="button" class="pn-styleRow ${c}" data-block="${b}"><span class="pn-check" data-check="${b}"></span>${l}</button>`).join('')}
          ${LISTS.map(([b, l]) => `<button type="button" class="pn-styleRow pn-sBody" data-block="${b}"><span class="pn-check" data-check="${b}"></span>${l}</button>`).join('')}
          <div class="pn-popSep"></div>
          <button type="button" class="pn-styleRow pn-sBody" data-block="quote"><span class="pn-check" data-check="quote"></span><span class="pn-quoteBar"></span> Block Quote</button>
        </div>
        <div class="pn-pop pn-inkPop" data-menu="ink" hidden>
          ${INKS.map((c) => `<button type="button" class="pn-ink" data-ink="${c}" style="background:${c || 'var(--w-fg)'}" aria-label="${c ? 'Colour ' + c : 'Default colour'}"></button>`).join('')}
        </div>
      </span>
      <button type="button" class="pn-tb" data-a="check" aria-label="Checklist" title="Checklist">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="7" r="2.6" fill="currentColor"/><path d="m4.4 7 .9.9 1.6-1.8" stroke="var(--w-note)" stroke-width="1.2"/><circle cx="5.5" cy="17" r="2.6"/><path d="M11 7h10M11 17h10"/></svg>
      </button>
      <button type="button" class="pn-tb" data-a="table" aria-label="Table" title="Table">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M12 9.5v10"/></svg>
      </button>
    </span>
    <span class="pn-anchor">
      <button type="button" class="pn-more" data-a="more" aria-label="More" title="More"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 6 6-6 6M13 6l6 6-6 6"/></svg></button>
      <div class="pn-pop pn-menuPop pn-morePop" data-menu="more" hidden>
        <button type="button" class="pn-menuRow" data-a="copy">Copy Text</button>
        <button type="button" class="pn-menuRow" data-a="download">Download Note</button>
        <button type="button" class="pn-menuRow" data-a="print">Print…</button>
        <div class="pn-popSep"></div>
        <button type="button" class="pn-menuRow pn-danger" data-a="clear">Clear Note</button>
      </div>
    </span>
  </span>
</div>
<div class="pn-body" data-body>
  <p class="pn-date" data-date></p>
  <span class="pn-anchor" data-thandle hidden style="position:absolute">
    <button type="button" class="pn-handle" data-a="tmenu" aria-label="Table options">${DOTS}</button>
    <div class="pn-pop pn-menuPop" data-menu="table" hidden style="top:24px;left:-60px">
      <button type="button" class="pn-menuRow" data-t="row">Add Row Below</button>
      <button type="button" class="pn-menuRow" data-t="col">Add Column After</button>
      <div class="pn-popSep"></div>
      <button type="button" class="pn-menuRow" data-t="delRow">Delete Row</button>
      <button type="button" class="pn-menuRow" data-t="delCol">Delete Column</button>
      <button type="button" class="pn-menuRow pn-danger" data-t="delete">Delete Table</button>
    </div>
  </span>
  <button type="button" class="pn-handle pn-handleRow" data-trow hidden aria-label="Add row" title="Add a row below">${DOTS}</button>
  <div class="pn-editor" data-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note" spellcheck="true"></div>
</div>`;
  }

  function open(state) {
    if (win) return win.front();
    const el = document.createElement('div');
    el.className = 'pn-window pn-note pn-notes';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Note');
    el.innerHTML = html();
    document.body.appendChild(el);

    const $ = (s) => el.querySelector(s);
    const editor = $('[data-editor]'), body = $('[data-body]');
    let menu = null, block = 'body', range = null, saveTimer = null, min = false, big = false, at = state.at;
    const marks = {};

    // ---- saving ----
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const r = await fetch('/api/notepad', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: editor.innerHTML }) });
        at = (await r.json()).at;
        $('[data-date]').textContent = stamp(at);
      }, 700);
    };
    const refresh = () => {
      const text = editor.innerText.trim();
      editor.toggleAttribute('data-empty', !text && !editor.querySelector('img, video, audio, table, figure'));
      $('.pn-title').textContent = text.split('\n')[0]?.trim().slice(0, 40) || 'New Note';
    };
    const changed = () => { refresh(); save(); };

    // Notes saved as plain text: "☐ " and "☑ " lines become checklists.
    const fromPlain = (t) => {
      if (!t || /^\s*</.test(t)) return t;
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return t.split('\n').map((l) => `<div>${esc(l) || '<br>'}</div>`).join('');
    };
    editor.innerHTML = fromPlain(state.html);
    $('[data-date]').textContent = stamp(at);
    document.execCommand('defaultParagraphSeparator', false, 'div');
    refresh();

    // ---- menus ----
    const setMenu = (m) => {
      menu = m;
      el.querySelectorAll('[data-menu]').forEach((p) => (p.hidden = p.dataset.menu !== m && !(m === 'ink' && p.dataset.menu === 'format')));
      el.querySelectorAll('.pn-tb[data-a="format"]').forEach((b) => b.setAttribute('data-on', m === 'format' || m === 'ink'));
      $('.pn-more').setAttribute('data-on', m === 'more');
    };
    const paintState = () => {
      el.querySelectorAll('[data-check]').forEach((c) => (c.innerHTML = c.dataset.check === block ? CHECK : ''));
      el.querySelectorAll('[data-mark]').forEach((b) => b.setAttribute('data-on', !!marks[b.dataset.mark]));
      $('[data-a="check"]').setAttribute('data-on', block === 'check');
    };

    // ---- cursor ----
    const where = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount || !editor.contains(sel.anchorNode)) return;
      range = sel.getRangeAt(0).cloneRange();
      let n = sel.anchorNode, found = 'body', cell = null;
      while (n && n !== editor) {
        if (n instanceof HTMLElement) {
          const tag = n.tagName;
          if (tag === 'TD' && !cell) cell = n;
          if (found === 'body') {
            if (tag === 'H1') found = 'h1';
            else if (tag === 'H2') found = 'h2';
            else if (tag === 'H3') found = 'h3';
            else if (tag === 'PRE') found = 'pre';
            else if (tag === 'BLOCKQUOTE') found = 'quote';
            else if (tag === 'OL') found = 'number';
            else if (tag === 'UL') found = n.classList.contains('checklist') ? 'check' : n.classList.contains('dashed') ? 'dash' : 'bullet';
          }
        }
        n = n.parentNode;
      }
      block = found;
      for (const k of ['bold', 'italic', 'underline', 'strikeThrough']) marks[k] = document.queryCommandState(k);
      paintState();
      const h = $('[data-thandle]'), r = $('[data-trow]');
      if (cell) {
        const t = cell.closest('table').getBoundingClientRect(), row = cell.closest('tr').getBoundingClientRect(), b = body.getBoundingClientRect();
        h.hidden = false; r.hidden = false;
        h.style.top = t.top - b.top + body.scrollTop - 22 + 'px';
        h.style.left = t.left - b.left + t.width / 2 - 16 + 'px';
        r.style.top = row.top - b.top + body.scrollTop + row.height / 2 - 12 + 'px';
        r.style.left = t.left - b.left - 24 + 'px';
      } else { h.hidden = true; r.hidden = true; if (menu === 'table') setMenu(null); }
    };
    const onSel = () => where();
    document.addEventListener('selectionchange', onSel);

    const restore = () => {
      const sel = window.getSelection();
      if (sel?.rangeCount && editor.contains(sel.anchorNode)) return;
      editor.focus();
      if (range && sel) { sel.removeAllRanges(); sel.addRange(range); }
    };
    const exec = (cmd, value) => {
      restore();
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(cmd, false, value);
      changed(); where();
    };
    const keepCaret = (fn) => {
      const sel = window.getSelection();
      if (!sel?.rangeCount || !sel.isCollapsed) return fn();
      const mark = document.createElement('span');
      mark.setAttribute('data-caret', '');
      sel.getRangeAt(0).insertNode(mark);
      fn();
      const found = editor.querySelector('span[data-caret]');
      if (found) {
        const r = document.createRange();
        r.setStartBefore(found); r.collapse(true);
        const parent = found.parentNode;
        found.remove(); parent?.normalize();
        const s2 = window.getSelection();
        s2.removeAllRanges(); s2.addRange(r);
      }
    };
    const currentList = () => {
      let n = window.getSelection()?.anchorNode ?? null;
      while (n && n !== editor) {
        if (n instanceof HTMLElement && (n.tagName === 'UL' || n.tagName === 'OL')) return n;
        n = n.parentNode;
      }
      return null;
    };
    const applyList = (kind) => {
      const list = currentList();
      const same = list && ((kind === 'number' && list.tagName === 'OL') || (kind !== 'number' && list.tagName === 'UL' && (kind === 'check' ? list.classList.contains('checklist') : kind === 'dash' ? list.classList.contains('dashed') : !list.classList.length)));
      if (same) document.execCommand(kind === 'number' ? 'insertOrderedList' : 'insertUnorderedList');
      else {
        if (list && (list.tagName === 'OL') !== (kind === 'number')) document.execCommand(list.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
        if (!currentList()) document.execCommand(kind === 'number' ? 'insertOrderedList' : 'insertUnorderedList');
        const now = currentList();
        if (now) {
          now.className = kind === 'check' ? 'checklist' : kind === 'dash' ? 'dashed' : '';
          if (!now.className) now.removeAttribute('class');
          now.querySelectorAll('li').forEach((li) => (kind === 'check' ? !li.hasAttribute('data-checked') && li.setAttribute('data-checked', 'false') : li.removeAttribute('data-checked')));
        }
      }
    };
    const setList = (kind) => {
      restore();
      if (!editor.innerText.trim() && !editor.querySelector('img, video, audio, table, figure')) {
        const tag = kind === 'number' ? 'ol' : 'ul';
        const cls = kind === 'check' ? ' class="checklist"' : kind === 'dash' ? ' class="dashed"' : '';
        editor.innerHTML = `<${tag}${cls}><li${kind === 'check' ? ' data-checked="false"' : ''}><br></li></${tag}>`;
        const r = document.createRange();
        r.setStart(editor.querySelector('li'), 0); r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        editor.focus(); changed(); where();
        return;
      }
      keepCaret(() => applyList(kind));
      changed(); where();
    };
    const setBlockStyle = (b) => {
      setMenu(null);
      if (['bullet', 'dash', 'number', 'check'].includes(b)) return setList(b);
      restore();
      const tag = b === 'body' ? 'div' : b === 'quote' ? 'blockquote' : b;
      keepCaret(() => {
        if (currentList()) document.execCommand(currentList().tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
        document.execCommand('formatBlock', false, tag === block ? 'div' : tag);
      });
      changed(); where();
    };

    // ---- tables ----
    const tableCell = () => {
      const n = range?.startContainer ?? null;
      const e = n instanceof HTMLElement ? n : n?.parentElement;
      return e?.closest('td') ?? null;
    };
    const editTable = (what) => {
      setMenu(null);
      const cell = tableCell();
      if (!cell) return;
      const tbl = cell.closest('table'), row = cell.closest('tr'), col = cell.cellIndex;
      if (what === 'row') {
        const tr = document.createElement('tr');
        for (let i = 0; i < row.cells.length; i++) tr.appendChild(Object.assign(document.createElement('td'), { innerHTML: '<br>' }));
        row.after(tr);
      } else if (what === 'col') [...tbl.rows].forEach((r) => r.cells[col].after(Object.assign(document.createElement('td'), { innerHTML: '<br>' })));
      else if (what === 'delRow') { if (tbl.rows.length > 1) row.remove(); else tbl.remove(); }
      else if (what === 'delCol') { if (row.cells.length > 1) [...tbl.rows].forEach((r) => r.cells[col]?.remove()); else tbl.remove(); }
      else tbl.remove();
      changed(); where();
    };

    // ---- editor events ----
    editor.addEventListener('input', changed);
    editor.addEventListener('keyup', where);
    editor.addEventListener('mousedown', (e) => {
      const li = e.target.closest('ul.checklist > li');
      if (!li) return;
      if (e.clientX - li.getBoundingClientRect().left > 26) return;
      e.preventDefault();
      li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
      changed();
    });
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') requestAnimationFrame(() => {
        editor.querySelectorAll('ul.checklist > li:not([data-checked])').forEach((li) => li.setAttribute('data-checked', 'false'));
        const sel = window.getSelection();
        const li = (sel?.anchorNode instanceof HTMLElement ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest('ul.checklist > li');
        if (li && li.getAttribute('data-checked') === 'true' && !li.textContent) li.setAttribute('data-checked', 'false');
      });
      if (e.key === 'Tab') {
        const sel = window.getSelection();
        const cell = (sel?.anchorNode instanceof HTMLElement ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest('td');
        if (cell) {
          e.preventDefault();
          const cells = [...cell.closest('table').querySelectorAll('td')];
          const next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
          if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
        }
      }
    });
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    body.addEventListener('mousedown', () => menu && setMenu(null));

    // ---- clicks ----
    // Toolbar clicks keep the text selection.
    el.querySelectorAll('[data-keep], .pn-pop').forEach((n) => n.addEventListener('mousedown', (e) => e.preventDefault()));
    $('[data-trow]').addEventListener('mousedown', (e) => e.preventDefault());
    $('[data-thandle]').addEventListener('mousedown', (e) => e.preventDefault());

    const close = () => {
      document.removeEventListener('selectionchange', onSel);
      window.removeEventListener('resize', onResize);
      clearTimeout(saveTimer);
      el.remove(); win = null;
      try { localStorage.setItem(OPEN_KEY, '0'); } catch {}
      document.dispatchEvent(new Event('note:closed'));
    };
    const title = () => $('.pn-title').textContent;
    const actions = {
      close,
      min: () => { min = !min; el.classList.toggle('pn-noteMin', min); body.hidden = min; $('.pn-toolRow').hidden = min; },
      zoom: () => { el.style.width = ''; el.style.height = ''; min = false; el.classList.remove('pn-noteMin'); body.hidden = false; $('.pn-toolRow').hidden = false; big = !big; el.classList.toggle('pn-notesBig', big); fit(); },
      format: () => setMenu(menu === 'format' || menu === 'ink' ? null : 'format'),
      hilite: () => exec('hiliteColor', '#fde68a'),
      ink: () => setMenu('ink'),
      check: () => setList('check'),
      table: () => exec('insertHTML', '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><div><br></div>'),
      more: () => setMenu(menu === 'more' ? null : 'more'),
      tmenu: () => setMenu(menu === 'table' ? null : 'table'),
      copy: async () => { setMenu(null); await navigator.clipboard.writeText(editor.innerText); },
      download: () => {
        setMenu(null);
        const doc = `<!doctype html><meta charset="utf-8"><title>${title()}</title><body style="font-family:system-ui;max-width:720px;margin:40px auto;line-height:1.55">${editor.innerHTML}</body>`;
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([doc], { type: 'text/html' })), download: `${title() || 'Note'}.html` });
        a.click(); URL.revokeObjectURL(a.href);
      },
      print: () => { setMenu(null); window.print(); },
      clear: () => { setMenu(null); if (!confirm('Clear this note?')) return; editor.innerHTML = ''; changed(); },
    };
    el.addEventListener('click', (e) => {
      const t = e.target;
      const a = t.closest('[data-a]');
      if (a && actions[a.dataset.a]) return actions[a.dataset.a]();
      const mk = t.closest('[data-mark]'); if (mk) return exec(mk.dataset.mark);
      const bl = t.closest('[data-block]'); if (bl) return setBlockStyle(bl.dataset.block);
      const ik = t.closest('[data-ink]'); if (ik) { exec('foreColor', ik.dataset.ink || getComputedStyle(editor).color); return setMenu(null); }
      const tb = t.closest('[data-t]'); if (tb) return editTable(tb.dataset.t);
      if (t.closest('[data-trow]')) return editTable('row');
    });

    // ---- floating window (drag, remember place, stay on screen) ----
    let pos = null, z = ++topZ;
    const clamp = (x, y) => {
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      return { x: Math.max(8, Math.min(x, vw - el.offsetWidth - 8)), y: Math.max(8, Math.min(y, vh - Math.min(el.offsetHeight, 120) - 8)) };
    };
    const place = () => { el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; };
    const fit = () => { if (!pos) return; pos = clamp(pos.x, pos.y); place(); };
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    new ResizeObserver(fit).observe(el);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(WIN_KEY) || 'null'); } catch {}
    pos = saved ?? { x: Math.max(16, document.documentElement.clientWidth - 560), y: 80 };
    el.style.zIndex = z; fit();
    const front = () => (el.style.zIndex = ++topZ);
    el.addEventListener('pointerdown', (e) => {
      front();
      const t = e.target;
      if (!t.closest('[data-drag]') || t.closest('button, input, textarea, a')) return;
      e.preventDefault();
      const dx = e.clientX - pos.x, dy = e.clientY - pos.y;
      const move = (ev) => { pos = clamp(ev.clientX - dx, ev.clientY - dy); place(); };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        try { localStorage.setItem(WIN_KEY, JSON.stringify(pos)); } catch {}
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });

    paintState();
    win = { el, front, close };
    try { localStorage.setItem(OPEN_KEY, '1'); } catch {}
    editor.focus();
  }

  window.PlannerNote = {
    toggle: (state) => (win ? win.close() : open(state)),
    isOpen: () => !!win,
    wasOpen: () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } },
    open,
  };
})();
