-- ChronKeep notifier: shows one macOS notification under the ChronKeep name and icon.
-- The server writes "title<newline>message" to the cache file, then opens this app.
on run
	set f to (POSIX path of (path to home folder)) & "Library/Caches/ChronKeep/notify.txt"
	try
		set t to read POSIX file f as «class utf8»
		set ti to paragraph 1 of t
		set bo to paragraph 2 of t
		display notification bo with title ti sound name "Glass"
		delay 1
	end try
end run
