import AppKit

let application = NSApplication.shared
let appDelegate = AppDelegate()

application.setActivationPolicy(.accessory)
application.delegate = appDelegate
application.run()
