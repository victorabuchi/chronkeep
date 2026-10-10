// Desktop notifications on Linux and Windows. (On the Mac, ChronKeep.app does this; see mac/.)
// Titles and bodies can come from calendar feeds and imported files, so they are never pasted into a command:
// Linux gets them as plain arguments after "--", Windows gets them through environment variables.

const WINDOWS_SCRIPT = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$text = $xml.GetElementsByTagName('text')
$text.Item(0).AppendChild($xml.CreateTextNode($env:CK_TITLE)) | Out-Null
$text.Item(1).AppendChild($xml.CreateTextNode($env:CK_BODY)) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('ChronKeep').Show($toast)
`;

const clip = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

// notify-send: with an item, add Snooze and Done buttons (libnotify 0.8+ prints the button chosen once closed).
function linux(title, body, meta = {}, icon = '') {
  const args = ['-a', 'ChronKeep', '-u', 'normal'];
  if (icon) args.push('-i', icon);
  if (meta.itemId) args.push('-A', 'snooze=Snooze 10 min', '-A', 'done=Done', '-w');
  args.push('--', clip(title, 200), clip(body, 600));
  return { cmd: 'notify-send', args, waits: !!meta.itemId };
}

function windows(title, body) {
  const encoded = Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64');
  return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], env: { CK_TITLE: clip(title, 200), CK_BODY: clip(body, 600) } };
}

module.exports = { linux, windows, WINDOWS_SCRIPT };
