import AppKit
import Foundation

final class PanelContentView: NSVisualEffectView {
    var onRefresh: (() -> Void)?
    var onOpenCalendar: (() -> Void)?
    var onClose: (() -> Void)?
    var onQuit: (() -> Void)?

    private let titleLabel = NSTextField(labelWithString: "Calendar Edge")
    private let subtitleLabel = NSTextField(labelWithString: "Upcoming events from your Apple Calendar")
    private let statusLabel = NSTextField(labelWithString: "Waiting for Calendar access...")
    private let textView = NSTextView()

    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    private let allDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)

        material = .hudWindow
        blendingMode = .withinWindow
        state = .active
        wantsLayer = true
        layer?.cornerRadius = 22

        setupLayout()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func renderLoading(message: String) {
        statusLabel.stringValue = message
        textView.string = ""
    }

    func renderAccessDenied(message: String) {
        statusLabel.stringValue = "Calendar permission is required"
        textView.string = """
        \(message)

        Open System Settings > Privacy & Security > Calendars and allow access for CalendarEdge.
        """
    }

    func render(events: [CalendarEventSummary]) {
        if events.isEmpty {
            statusLabel.stringValue = "No upcoming events in the next 14 days."
            textView.string = "Nothing scheduled."
            return
        }

        statusLabel.stringValue = "Showing \(events.count) upcoming events"
        textView.string = events.map(formatEvent).joined(separator: "\n\n")
    }

    private func setupLayout() {
        titleLabel.font = .systemFont(ofSize: 26, weight: .semibold)
        subtitleLabel.font = .systemFont(ofSize: 13, weight: .regular)
        subtitleLabel.textColor = .secondaryLabelColor
        statusLabel.font = .systemFont(ofSize: 12, weight: .medium)
        statusLabel.textColor = .tertiaryLabelColor

        let refreshButton = makeButton(title: "Refresh", action: #selector(refreshTapped))
        let openButton = makeButton(title: "Open Calendar", action: #selector(openCalendarTapped))
        let closeButton = makeButton(title: "Close", action: #selector(closeTapped))
        let quitButton = makeButton(title: "Quit", action: #selector(quitTapped))

        let buttonRow = NSStackView(views: [refreshButton, openButton, closeButton, quitButton])
        buttonRow.orientation = .horizontal
        buttonRow.spacing = 8
        buttonRow.alignment = .centerY
        buttonRow.translatesAutoresizingMaskIntoConstraints = false

        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.textColor = .labelColor
        textView.string = ""

        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.documentView = textView
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        addSubview(titleLabel)
        addSubview(subtitleLabel)
        addSubview(buttonRow)
        addSubview(statusLabel)
        addSubview(scrollView)

        [titleLabel, subtitleLabel, statusLabel].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            subtitleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            subtitleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),

            buttonRow.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 14),
            buttonRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            buttonRow.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -20),

            statusLabel.topAnchor.constraint(equalTo: buttonRow.bottomAnchor, constant: 14),
            statusLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            statusLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),

            scrollView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 12),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -20)
        ])
    }

    private func formatEvent(_ event: CalendarEventSummary) -> String {
        let schedule: String
        if event.isAllDay {
            schedule = "All day on \(allDayFormatter.string(from: event.startDate))"
        } else {
            let start = dateFormatter.string(from: event.startDate)
            let end = dateFormatter.string(from: event.endDate)
            schedule = "\(start) -> \(end)"
        }

        if let location = event.location, !location.isEmpty {
            return """
            \(event.title)
            \(event.calendarTitle)
            \(schedule)
            \(location)
            """
        }

        return """
        \(event.title)
        \(event.calendarTitle)
        \(schedule)
        """
    }

    private func makeButton(title: String, action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        return button
    }

    @objc private func refreshTapped() {
        onRefresh?()
    }

    @objc private func openCalendarTapped() {
        onOpenCalendar?()
    }

    @objc private func closeTapped() {
        onClose?()
    }

    @objc private func quitTapped() {
        onQuit?()
    }
}
