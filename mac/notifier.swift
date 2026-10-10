// ChronKeep notifier: shows one macOS notification with Snooze and Done buttons.
//
//   ChronKeep --title T --body B [--item ID --date YYYY-MM-DD --port 3000]   post a notification
//   ChronKeep --check                                                         exit 0 if notifications are allowed, 3 if blocked
//   ChronKeep --simulate snooze|done --item ID --date D --port N              run a button's action without clicking (for tests)
//   (no arguments)                                                            macOS opened us for a button press; handle it
//
// Exit codes: 0 ok, 3 macOS is blocking notifications, 4 could not post.
import Cocoa
import UserNotifications

func argValue(_ name: String) -> String? {
    let a = CommandLine.arguments
    if let i = a.firstIndex(of: name), i + 1 < a.count { return a[i + 1] }
    return nil
}
let hasFlag = { (n: String) in CommandLine.arguments.contains(n) }

// Tells the ChronKeep server what the button did.
func sendAction(action: String, info: [AnyHashable: Any], then done: @escaping () -> Void) {
    let port = (info["port"] as? String) ?? "3000"
    guard let item = info["item"] as? String, let url = URL(string: "http://127.0.0.1:\(port)/api/act") else { return done() }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.timeoutInterval = 8
    let body: [String: Any] = ["itemId": item, "date": (info["date"] as? String) ?? "", "action": action, "minutes": 10]
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: req) { _, _, _ in done() }.resume()
}

final class App: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    let center = UNUserNotificationCenter.current()

    func applicationDidFinishLaunching(_ n: Notification) {
        center.delegate = self
        let snooze = UNNotificationAction(identifier: "snooze", title: "Snooze 10 min", options: [])
        let done = UNNotificationAction(identifier: "done", title: "Done", options: [])
        center.setNotificationCategories([UNNotificationCategory(identifier: "reminder", actions: [snooze, done], intentIdentifiers: [], options: [])])

        if let act = argValue("--simulate") {
            sendAction(action: act, info: ["item": argValue("--item") ?? "", "date": argValue("--date") ?? "", "port": argValue("--port") ?? "3000"]) { exit(0) }
        } else if hasFlag("--check") {
            center.getNotificationSettings { s in
                switch s.authorizationStatus {
                case .denied: exit(3)
                case .notDetermined:
                    self.center.requestAuthorization(options: [.alert, .sound]) { ok, _ in exit(ok ? 0 : 3) }
                default: exit(0)
                }
            }
        } else if let title = argValue("--title") {
            center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                guard granted else { exit(3) }
                let c = UNMutableNotificationContent()
                c.title = title
                c.body = argValue("--body") ?? ""
                c.sound = .default
                if let item = argValue("--item") {
                    c.categoryIdentifier = "reminder"
                    c.threadIdentifier = item
                    c.userInfo = ["item": item, "date": argValue("--date") ?? "", "port": argValue("--port") ?? "3000"]
                }
                self.center.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil)) { err in
                    // Stay a moment so macOS can take the notification; button presses relaunch us later.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { exit(err == nil ? 0 : 4) }
                }
            }
        } else {
            // Opened by macOS because a button was pressed: the response arrives right away.
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { exit(0) }
        }
    }

    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler h: @escaping (UNNotificationPresentationOptions) -> Void) {
        h([.banner, .sound])
    }

    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler h: @escaping () -> Void) {
        let info = r.notification.request.content.userInfo
        switch r.actionIdentifier {
        case "snooze", "done":
            sendAction(action: r.actionIdentifier, info: info) { h(); exit(0) }
        case UNNotificationDefaultActionIdentifier:
            // Clicking the notification itself opens the item in ChronKeep.
            let port = (info["port"] as? String) ?? "3000", item = (info["item"] as? String) ?? ""
            if let u = URL(string: "http://localhost:\(port)/?open=\(item)") { NSWorkspace.shared.open(u) }
            h(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { exit(0) }
        default:
            h(); exit(0)
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = App()
app.delegate = delegate
app.run()
