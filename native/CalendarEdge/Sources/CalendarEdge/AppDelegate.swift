import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let calendarStore = CalendarStore()
    private var panelController: SlidePanelController!
    private var hotspotWindow: EdgeHotspotWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        panelController = SlidePanelController(calendarStore: calendarStore)
        installHotspot()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScreenChange),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
    }

    @objc private func handleScreenChange() {
        installHotspot()
    }

    private func installHotspot() {
        hotspotWindow?.close()

        guard let screen = NSScreen.main ?? NSScreen.screens.first else {
            return
        }

        hotspotWindow = EdgeHotspotWindow(screen: screen) { [weak self] in
            self?.panelController.toggle(for: screen)
        }
        hotspotWindow?.orderFrontRegardless()
    }
}
