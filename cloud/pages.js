// The sign-in and sign-up pages, drawn like Pursecast's: a dark hero, one white card, one button per provider that is set up.
const auth = require('./auth');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ERRORS = {
  missing: 'Enter your email address, and your password to sign in with one.',
  invalid: 'That email and password do not match.',
  throttled: 'Too many attempts. Wait a few minutes, or continue with Google.',
  google: 'Google sign-in did not finish. Try again.',
  apple: 'Apple sign-in did not finish. Try again.',
  short: `Use at least ${auth.MIN_PASSWORD} characters for your password.`,
  taken: 'There is already an account with that email. Log in instead.',
  reset: 'That reset link has expired. Ask for a new one.',
};

const GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z"/></svg>';
const APPLE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.67Zm-2.27-6.75c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.67-1.09 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27Z"/></svg>';
const EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ChronKeep</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" href="/favicon-32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#0b1020"><link rel="stylesheet" href="/site/site.css"></head>`;

function shell({ title, lede, below, body }) {
  return `${head(title)}<body class="authpage"><div class="auth"><div class="aurora" aria-hidden="true"></div>
<header class="authhead"><a class="logo" href="/"><span class="tile"><img src="/icon-192.png" alt="" width="36" height="36"></span>ChronKeep</a><h1>${esc(title)}</h1>${lede ? `<p>${esc(lede)}</p>` : ''}</header>
<main class="authcard">${body}</main>${below ? `<p class="authswitch">${below}</p>` : ''}</div><script src="/site/auth.js"></script></body></html>`;
}

const providers = () => {
  const out = [];
  if (auth.appleReady()) out.push(`<a class="btn-apple" href="/auth/apple">${APPLE} Continue with Apple</a>`);
  if (auth.googleReady()) out.push(`<a class="btn-google" href="/auth/google">${GOOGLE} Continue with Google</a>`);
  return out.length ? out.join('') + '<div class="divider">or</div>' : '';
};
const password = (label, autocomplete, hint = '') => `<label class="field">${label}<span class="pw"><input class="input" type="password" name="password" autocomplete="${autocomplete}" required><button type="button" class="eye" data-eye aria-label="Show password" aria-pressed="false">${EYE}</button></span>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const error = (code) => (ERRORS[code] ? `<p class="autherror" role="alert">${esc(ERRORS[code])}</p>` : '');

function loginPage(q = {}) {
  return shell({
    title: 'Welcome back', lede: 'Your deadlines are waiting.',
    below: 'New to ChronKeep? <a href="/signup">Create an account</a>',
    body: `${error(q.error)}${providers()}<form class="authform" method="post" action="/auth/login"><label class="field">Email<input class="input" type="email" name="email" autocomplete="username" inputmode="email" value="${esc(q.email)}" required></label>${password('Password', 'current-password')}<button class="authbtn" type="submit">Log in</button></form><p class="forgot"><a href="/forgot">Forgot your password?</a></p>`,
  });
}
function signupPage(q = {}) {
  return shell({
    title: 'Create your account', lede: 'Free. Your calendar and tasks on every device.',
    below: 'Already have an account? <a href="/login">Log in</a>',
    body: `${error(q.error)}${providers()}<form class="authform" method="post" action="/auth/signup"><input class="trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><label class="field">Name<input class="input" name="name" autocomplete="name" value="${esc(q.name)}" required></label><label class="field">Email<input class="input" type="email" name="email" autocomplete="email" inputmode="email" value="${esc(q.email)}" required></label>${password('Password', 'new-password', `At least ${auth.MIN_PASSWORD} characters.`)}<button class="authbtn" type="submit">Create account</button><p class="fine">By continuing you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.</p></form>`,
  });
}
function forgotPage(q = {}) {
  return shell({
    title: 'Reset your password', lede: 'We will email you a link that works for 15 minutes.', below: '<a href="/login">Back to log in</a>',
    body: q.sent ? '<p class="authok" role="status">If there is an account with that email, a link is on its way. Check your inbox.</p>' : `${error(q.error)}<form class="authform" method="post" action="/auth/forgot"><label class="field">Email<input class="input" type="email" name="email" autocomplete="username" inputmode="email" required></label><button class="authbtn" type="submit">Email me a link</button></form>`,
  });
}
function resetPage(token, q = {}) {
  return shell({
    title: 'Choose a new password', below: '<a href="/login">Back to log in</a>',
    body: `${error(q.error)}<form class="authform" method="post" action="/auth/reset"><input type="hidden" name="token" value="${esc(token)}">${password('New password', 'new-password', `At least ${auth.MIN_PASSWORD} characters.`)}<button class="authbtn" type="submit">Save password</button></form>`,
  });
}

function legalPage(title, html) {
  return `${head(title)}<body class="legal"><header class="legalnav"><a class="logo dark" href="/"><span class="tile"><img src="/icon-192.png" alt="" width="30" height="30"></span>ChronKeep</a><a href="/login">Log in</a></header><main class="legalbody"><h1>${esc(title)}</h1>${html}</main></body></html>`;
}
const PRIVACY = `<p>ChronKeep keeps your calendar, tasks, notes and the files you attach so they are the same on every device you sign in on.</p>
<h2>What we store</h2><p>Your name and email, a hashed password (or the Google or Apple account id you signed in with), your items, settings, bin, note and attachments, and the calendar links you add. Calendar links can hold private tokens, so they are kept only in your own data and are never shown back in full.</p>
<h2>What we do not do</h2><p>We do not sell your data, show ads or read your items for any purpose other than showing them to you. Reminders are scheduled on your own phone.</p>
<h2>Your control</h2><p>You can export everything as a file, and delete your account in Settings. Deleting removes your data from our database straight away; backups of it are removed with it.</p>
<h2>Contact</h2><p>Questions: <a href="mailto:contact@victorabuchi.com">contact@victorabuchi.com</a>.</p>`;
const TERMS = `<p>ChronKeep is a personal planner offered as is. Use it for your own calendar and tasks.</p>
<h2>Your account</h2><p>Keep your password private. You are responsible for what you store. Do not use ChronKeep to store anything unlawful.</p>
<h2>Reminders</h2><p>Reminders depend on your phone allowing notifications and on the phone being on. ChronKeep does its best, but it cannot promise that a reminder arrives, so do not rely on it alone for things with serious consequences.</p>
<h2>Changes and ending</h2><p>You can delete your account at any time. We may change or stop the service, and will give notice where we reasonably can.</p>
<h2>Contact</h2><p><a href="mailto:contact@victorabuchi.com">contact@victorabuchi.com</a></p>`;

module.exports = { loginPage, signupPage, forgotPage, resetPage, privacyPage: () => legalPage('Privacy policy', PRIVACY), termsPage: () => legalPage('Terms of use', TERMS), esc };
