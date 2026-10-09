#!/bin/sh
# Builds the little ChronKeep.app that macOS notifications are sent from, so they
# carry the ChronKeep icon instead of Script Editor's scroll. Safe to run again.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/ChronKeep"
APP="$DEST/ChronKeep.app"
mkdir -p "$DEST"
rm -rf "$APP"
osacompile -o "$APP" "$HERE/notifier.applescript"
cp "$HERE/ChronKeep.icns" "$APP/Contents/Resources/applet.icns"
PL="$APP/Contents/Info.plist"
put() { /usr/libexec/PlistBuddy -c "Set :$1 $3" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PL"; }
put CFBundleName string ChronKeep
put CFBundleDisplayName string ChronKeep
put CFBundleIdentifier string com.victorabuchi.chronkeep
put LSUIElement bool true
# osacompile adds a default scroll icon as an asset; drop it so our .icns is the one macOS uses.
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$PL" 2>/dev/null || true
rm -f "$APP/Contents/Resources/Assets.car"
codesign --force --deep -s - "$APP" >/dev/null 2>&1
echo "Built $APP"
