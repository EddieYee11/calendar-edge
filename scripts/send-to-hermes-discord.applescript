property hermesQuickSwitcherQuery : "@Hermes"
property appLaunchDelay : 0.8
property searchSettleDelay : 0.45
property conversationSettleDelay : 0.7
property sendSettleDelay : 0.12

on run argv
    set messageText to my joinArgs(argv)
    set messageText to my trimText(messageText)

    if messageText is "" then error "No message received for Hermes."

    set previousClipboard to missing value
    try
        set previousClipboard to the clipboard
    end try

    try
        set the clipboard to messageText
        tell application "Discord" to activate
        delay appLaunchDelay

        tell application "System Events"
            if not (exists process "Discord") then error "Discord is not running."

            tell process "Discord"
                keystroke "k" using command down
                delay searchSettleDelay
                keystroke hermesQuickSwitcherQuery
                delay searchSettleDelay
                key code 36
                delay conversationSettleDelay
                keystroke "v" using command down
                delay sendSettleDelay
                key code 36
            end tell
        end tell

        delay sendSettleDelay
    on error errMsg number errNum
        if previousClipboard is not missing value then
            set the clipboard to previousClipboard
        end if
        error errMsg number errNum
    end try

    if previousClipboard is not missing value then
        set the clipboard to previousClipboard
    end if

    return "Sent to Hermes in Discord."
end run

on joinArgs(argv)
    if (count of argv) is 0 then return ""
    if (count of argv) is 1 then return item 1 of argv

    set AppleScript's text item delimiters to space
    set joinedText to argv as text
    set AppleScript's text item delimiters to ""
    return joinedText
end joinArgs

on trimText(rawText)
    set whiteSpace to {space, tab, return, linefeed}
    set trimmedText to rawText as text

    repeat while trimmedText is not "" and whiteSpace contains character 1 of trimmedText
        set trimmedText to text 2 thru -1 of trimmedText
    end repeat

    repeat while trimmedText is not "" and whiteSpace contains character -1 of trimmedText
        set trimmedText to text 1 thru -2 of trimmedText
    end repeat

    return trimmedText
end trimText
