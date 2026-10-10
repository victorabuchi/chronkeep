// Show or hide the password on the sign-in pages.
document.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
  const input = b.parentElement.querySelector('input'), show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}));
