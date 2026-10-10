// ---------------------------------------------------------------- theme
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  const r = document.documentElement.style;
  r.setProperty('--accent', S.accent);
  $('brand').textContent = S.name;
  $('userName').textContent = P.name || 'Your account';
  $('userEmail').textContent = P.email || 'Personal planner';
  $('initials').textContent = (P.name || S.name || 'C').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  $('initials').hidden = !!P.photo; $('avatarImg').hidden = !P.photo; if (P.photo) $('avatarImg').src = P.photo;
}
