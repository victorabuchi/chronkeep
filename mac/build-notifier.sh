#!/bin/sh
# Builds ChronKeep.app, the little app macOS notifications are sent from, so they carry the ChronKeep
# icon and have Snooze and Done buttons. Uses Swift when available, otherwise a simpler AppleScript
# version (icon only). Safe to run again.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/ChronKeep"
APP="$DEST/ChronKeep.app"
mkdir -p "$DEST"

build_swift() {
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
  swiftc -O -o "$APP/Contents/MacOS/ChronKeep" "$HERE/notifier.swift" -framework Cocoa -framework UserNotifications
  cp "$HERE/ChronKeep.icns" "$APP/Contents/Resources/ChronKeep.icns"
  cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>ChronKeep</string>
  <key>CFBundleIdentifier</key><string>com.victorabuchi.chronkeep</string>
  <key>CFBundleName</key><string>ChronKeep</string>
  <key>CFBundleDisplayName</key><string>ChronKeep</string>
  <key>CFBundleIconFile</key><string>ChronKeep</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
  codesign --force --deep -s - "$APP" >/dev/null 2>&1
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true
  echo "Built $APP (native, with Snooze and Done buttons)"
}

build_applet() {
  rm -rf "$APP"
  osacompile -o "$APP" "$HERE/notifier.applescript"
  cp "$HERE/ChronKeep.icns" "$APP/Contents/Resources/applet.icns"
  PL="$APP/Contents/Info.plist"
  put() { /usr/libexec/PlistBuddy -c "Set :$1 $3" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PL"; }
  put CFBundleName string ChronKeep
  put CFBundleDisplayName string ChronKeep
  put CFBundleIdentifier string com.victorabuchi.chronkeep
  put LSUIElement bool true
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$PL" 2>/dev/null || true
  rm -f "$APP/Contents/Resources/Assets.car"
  codesign --force --deep -s - "$APP" >/dev/null 2>&1
  echo "Built $APP (simple version, no buttons)"
}

if command -v swiftc >/dev/null 2>&1 && build_swift; then :; else build_applet; fi
