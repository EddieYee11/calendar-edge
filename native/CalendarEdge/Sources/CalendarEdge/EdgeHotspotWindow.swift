import AppKit

final class EdgeHotspotWindow: NSWindow {
    init(screen: NSScreen, onActivate: @escaping () -> Void) {
        let visibleFrame = screen.visibleFrame
        let width: CGFloat = 6

        let frame = NSRect(
            x: visibleFrame.maxX - width,
            y: visibleFrame.minY,
            width: width,
            height: visibleFrame.height
        )

        super.init(
            contentRect: frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        isReleasedWhenClosed = false
        level = .statusBar
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = false

        let contentView = HotspotView(onActivate: onActivate)
        self.contentView = contentView
    }
}

private final class HotspotView: NSView {
    private let onActivate: () -> Void
    private var trackingArea: NSTrackingArea?

    init(onActivate: @escaping () -> Void) {
        self.onActivate = onActivate
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()

        if let trackingArea {
            removeTrackingArea(trackingArea)
        }

        let newTrackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .inVisibleRect, .mouseEnteredAndExited],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(newTrackingArea)
        trackingArea = newTrackingArea
    }

    override func mouseEntered(with event: NSEvent) {
        onActivate()
    }
}
