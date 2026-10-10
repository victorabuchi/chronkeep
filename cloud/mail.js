// Email through Resend. Without RESEND_API_KEY the link is printed in the server log (for development).
async function sendReset(to, link) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`Password reset link for ${to}: ${link}`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'ChronKeep <hello@chronkeep.app>', to, subject: 'Reset your ChronKeep password', html: `<p>Use this link to choose a new password. It works for 15 minutes.</p><p><a href="${link}">Reset my password</a></p><p>If you did not ask for this, you can ignore this email.</p>`, text: `Reset your ChronKeep password (works for 15 minutes): ${link}` }),
  });
  if (!res.ok) console.error('Resend failed', res.status, (await res.text()).slice(0, 200));
}
module.exports = { sendReset };
