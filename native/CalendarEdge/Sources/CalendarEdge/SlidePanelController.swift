import AppKit
import Foundation

final class SlidePanelController: NSObject {
    private let calendarStore: CalendarStore
    private let panel: NSPanel
    private let contentView: PanelContentView
    private var isVisible = false

    init(calendarStore: CalendarStore) {
        self.calendarStore = calendarStore
        self.contentView = PanelContentView(frame: NSRect(x: 0, y: 0, width: 360, height: 620))
        self.panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 620),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        super.init()

        panel.isReleasedWhenClosed = false
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.contentView = contentView

        contentView.onRefresh = { [weak self] in
            self?.refreshEvents()
        }
        contentView.onOpenCalendar = {
            let calendarURL = URL(fileURLWithPath: "/System/Applications/Calendar.app")
            NSWorkspace.shared.openApplication(at: calendarURL, configuration: .init())
        }
        contentView.onClose = { [weak self] in
            self?.hide()
        }
        contentView.onQuit = {
            NSApplication.shared.terminate(nil)
        }
    }

    func toggle(for screen: NSScreen) {
        isVisible ? hide() : show(on: screen)
    }

    func show(on screen: NSScreen) {
        guard !isVisible else {
            return
        }

        let finalFrame = panelFrame(for: screen, offscreen: false)
        let startFrame = panelFrame(for: screen, offscreen: true)

        panel.setFrame(startFrame, display: false)
        panel.orderFrontRegardless()

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            panel.animator().setFrame(finalFrame, display: true)
        }

        isVisible = true
        refreshEvents()
    }

    func hide() {
        guard isVisible else {
            return
        }

        guard let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens.first else {
            panel.orderOut(nil)
            isVisible = false
            return
        }

        let targetFrame = panelFrame(for: screen, offscreen: true)

        NSAnimationContext.runAnimationGroup(
            { context in
                context.duration = 0.18
                panel.animator().setFrame(targetFrame, display: false)
            },
            completionHandler: { [weak self] in
                self?.panel.orderOut(nil)
            }
        )

        isVisible = false
    }

    private func refreshEvents() {
        contentView.renderLoading(message: "Syncing your upcoming events...")

        calendarStore.requestAccess { [weak self] accessState in
            guard let self else {
                return
            }

            switch accessState {
            case .granted:
                let events = self.calendarStore.upcomingEvents()
                self.contentView.render(events: events)
            case .denied(let message):
                self.contentView.renderAccessDenied(message: message)
            }
        }
    }

    private func panelFrame(for screen: NSScreen, offscreen: Bool) -> NSRect {
        let visibleFrame = screen.visibleFrame
        let width: CGFloat = 360
        let height: CGFloat = min(620, visibleFrame.height - 40)
        let y = visibleFrame.midY - (height / 2)
        let x = offscreen ? visibleFrame.maxX + 8 : visibleFrame.maxX - width - 16

        return NSRect(x: x, y: y, width: width, height: height)
    }
}
