// The ChronKeep app icon: a C drawn as a clock ring, with a check mark inside whose two arms double as clock hands
// (time, kept and ticked). Everything is drawn here as SVG; `node scripts/make-icons.js` renders it to every size.
const R = 270, C = 512, CAP = 55; // ring radius, centre, half the stroke width
const rad = (d) => (d * Math.PI) / 180;
const pt = (deg) => `${(C + R * Math.cos(rad(deg))).toFixed(1)} ${(C + R * Math.sin(rad(deg))).toFixed(1)}`;

// the ring: a C open towards the right
const ring = (stroke) => `<path d="M ${pt(-42)} A ${R} ${R} 0 1 0 ${pt(42)}" fill="none" stroke="${stroke}" stroke-width="${CAP * 2}" stroke-linecap="round"/>`;
// the check mark: its short arm and long arm are the hour and minute hands
const check = (stroke) => `<path d="M 400 520 L 486 606 L 668 392" fill="none" stroke="${stroke}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>`;
// a small amber dot where the ring opens: the reminder that is still to come
const dot = (fill) => `<circle cx="${(C + R * Math.cos(rad(-42)) + 74).toFixed(1)}" cy="${(C + R * Math.sin(rad(-42)) - 50).toFixed(1)}" r="30" fill="${fill}"/>`;

const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27c47f"/><stop offset="1" stop-color="#0a6b4b"/></linearGradient><radialGradient id="h" cx=".25" cy=".15" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
const art = (scale = 1, ringColor = '#ffffff', checkColor = '#ffffff', dotColor = '#ffc247') => `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${ring(ringColor)}${check(checkColor)}${dot(dotColor)}</g>`;

// full-bleed square tile (the app stores round the corners themselves)
const tile = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#h)"/>${art(1)}</svg>`;
// rounded tile with transparent corners (favicons, the in-app mark)
const rounded = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" rx="232" fill="url(#g)"/><rect width="1024" height="1024" rx="232" fill="url(#h)"/>${art(1)}</svg>`;
// Android adaptive icon: just the drawing, inside the safe zone (the background colour is set in app.json)
const foreground = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${art(0.62)}</svg>`;
// one-colour silhouette for notifications (Android tints it)
const mono = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${ring('#fff')}${check('#fff')}</svg>`;

module.exports = { tile, rounded, foreground, mono };
