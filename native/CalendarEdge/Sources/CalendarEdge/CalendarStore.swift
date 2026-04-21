import EventKit
import Foundation

struct CalendarEventSummary {
    let title: String
    let location: String?
    let startDate: Date
    let endDate: Date
    let isAllDay: Bool
    let calendarTitle: String
}

enum CalendarAccessState {
    case granted
    case denied(String)
}

final class CalendarStore {
    private let eventStore = EKEventStore()
    private let calendar = Calendar.current

    func requestAccess(completion: @escaping (CalendarAccessState) -> Void) {
        let status = EKEventStore.authorizationStatus(for: .event)

        switch status {
        case .authorized:
            completion(.granted)
        case .fullAccess:
            completion(.granted)
        case .writeOnly:
            completion(.denied("App only has write-only access to Calendar events."))
        case .restricted:
            completion(.denied("Calendar access is restricted by system policy."))
        case .denied:
            completion(.denied("Calendar access was denied. Enable it in System Settings > Privacy & Security > Calendars."))
        case .notDetermined:
            requestSystemAccess(completion: completion)
        @unknown default:
            completion(.denied("Calendar permission state is unknown."))
        }
    }

    func upcomingEvents(limit: Int = 16, daysAhead: Int = 14) -> [CalendarEventSummary] {
        let start = Date()
        guard let end = calendar.date(byAdding: .day, value: daysAhead, to: start) else {
            return []
        }

        let predicate = eventStore.predicateForEvents(
            withStart: start,
            end: end,
            calendars: eventStore.calendars(for: .event)
        )

        return eventStore.events(matching: predicate)
            .sorted { lhs, rhs in
                lhs.startDate < rhs.startDate
            }
            .prefix(limit)
            .map { event in
                CalendarEventSummary(
                    title: event.title?.isEmpty == false ? event.title! : "Untitled Event",
                    location: event.location,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    isAllDay: event.isAllDay,
                    calendarTitle: event.calendar.title
                )
            }
    }

    private func requestSystemAccess(completion: @escaping (CalendarAccessState) -> Void) {
        if #available(macOS 14.0, *) {
            eventStore.requestFullAccessToEvents { granted, error in
                DispatchQueue.main.async {
                    if granted {
                        completion(.granted)
                    } else {
                        let fallback = "Calendar access was not granted."
                        completion(.denied(error?.localizedDescription ?? fallback))
                    }
                }
            }
        } else {
            eventStore.requestAccess(to: .event) { granted, error in
                DispatchQueue.main.async {
                    if granted {
                        completion(.granted)
                    } else {
                        let fallback = "Calendar access was not granted."
                        completion(.denied(error?.localizedDescription ?? fallback))
                    }
                }
            }
        }
    }
}
