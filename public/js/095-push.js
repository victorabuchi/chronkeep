// ---------------------------------------------------------------- browser notifications (cloud)
// One button: allow notifications in this browser. The server then sends reminders as system notifications.
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

async function pushCard() {
  const card = document.createElement('div');
  card.className = 'scard'; card.id = 'pushCard';
  card.innerHTML = '<strong>Notifications on this computer</strong><p class="note" id="pushNote"></p><div class="frm"><button type="button" class="btn sm" id="pushOn"></button><button type="button" class="btn ghost sm" id="pushTest" hidden>Send test notification</button></div><p class="note" id="pushHelp" hidden></p>';
  $('notifCard').insertAdjacentElement('afterend', card);
  const note = $('pushNote'), on = $('pushOn'), test = $('pushTest'), help = $('pushHelp');
  if (!pushOk()) { note.textContent = 'This browser cannot show notifications from a web page. Use Chrome, Edge or Firefox, or on a Mac with Safari add ChronKeep to the Dock (File, Add to Dock). Reminders also arrive on your phone through the ChronKeep app.'; on.hidden = true; return; }
  const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
  const refresh = async () => {
    const sub = reg && (await reg.pushManager.getSubscription());
    const registered = sub ? (await api('GET', '/api/push/status?endpoint=' + encodeURIComponent(sub.endpoint))).on : false;
    const blocked = Notification.permission === 'denied';
    on.textContent = registered ? 'Turn off' : 'Turn on notifications';
    on.className = registered ? 'btn ghost sm' : 'btn sm';
    on.disabled = blocked; test.hidden = !registered;
    note.textContent = registered ? 'On. Reminders from your repeating-reminder rules appear here as notifications, even when ChronKeep is closed.' : blocked ? 'Notifications are blocked for this site in the browser.' : 'Get a popup on this computer when something is due, even when ChronKeep is closed.';
    help.hidden = !blocked; help.textContent = blocked ? 'Allow them again from the lock icon next to the address, then reload this page. On a Mac also check System Settings, Notifications, and your browser in the list.' : '';
  };
  on.onclick = async () => {
    on.disabled = true;
    try {
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub && (await api('GET', '/api/push/status?endpoint=' + encodeURIComponent(sub.endpoint))).on) { await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
      else {
        if ((await Notification.requestPermission()) !== 'granted') return;
        const { key } = await api('GET', '/api/push/key');
        const made = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
        await api('POST', '/api/push/subscribe', { sub: made.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
        await api('POST', '/api/push/test');
      }
    } catch (e) { toast(e.message || 'Could not change notifications'); }
    finally { on.disabled = false; refresh(); }
  };
  // The test goes through the server like a real reminder. If the server says it was sent but no popup appears,
  // the browser or the operating system is hiding it: also try one straight from this page to tell which.
  test.onclick = async () => {
    const r = await api('POST', '/api/push/test');
    if (!r.sent) return toast('Nothing was sent. Turn notifications off and on again.');
    toast('Sent. No popup? Check the help below.');
    help.hidden = false;
    help.innerHTML = 'The server sent it. If nothing appeared: on a Mac open <b>System Settings, Notifications</b>, find your browser (Chrome, Edge, Firefox) and set <b>Allow notifications</b> to on; also turn off <b>Focus</b> / Do Not Disturb. <a href="#" id="pushLocal">Show one from this page</a> to see whether the browser itself can display them.';
    $('pushLocal').onclick = (e) => { e.preventDefault(); reg.showNotification('ChronKeep', { body: 'Shown straight from this page.', icon: '/icon-192.png' }); };
  };
  refresh();
}
