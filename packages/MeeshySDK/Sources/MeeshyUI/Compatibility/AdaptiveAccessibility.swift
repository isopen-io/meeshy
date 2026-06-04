import SwiftUI
import UIKit

// MARK: - Adaptive accessibility announcements

/// Version-adaptive VoiceOver / assistive-technology announcements.
///
/// Posting an accessibility announcement is the only way to give a non-visual
/// user feedback for an event that isn't tied to a focus change (a new message
/// arriving, an async result, a transient toast). The *recommended* API differs
/// by OS version, so — exactly like the rest of `Compatibility/` — this wrapper
/// holds the real `#available` check and routes each platform to the API Apple
/// ships for it, keeping the modern branch byte-for-byte the documented call:
///
/// - **iOS 17 / 18 / 26+** : `AccessibilityNotification.Announcement` with an
///   announcement *priority*. Priority is what makes the modern API worth using
///   — VoiceOver will no longer silently drop the announcement when it is
///   already mid-utterance, which is the long-standing failure mode of the
///   legacy post on a busy speech channel.
/// - **iOS 16** : the still-supported (non-deprecated) `UIAccessibility.post(
///   notification: .announcement, argument:)`. Priority is unavailable, so it is
///   ignored — behaviour is unchanged from a plain post.
///
/// All entry points are no-ops when no assistive technology is active (the
/// system simply discards the notification), so callers never need to guard.
public enum AdaptiveAccessibility {

    /// Relative urgency of an announcement. Maps to the iOS 17+ announcement
    /// priority; ignored on iOS 16.
    public enum AnnouncementPriority {
        /// Interrupts current speech — use for errors / time-critical results.
        case high
        /// Default queueing behaviour — most success / status messages.
        case normal
        /// Spoken only when the speech channel is idle — ambient updates.
        case low
    }

    /// Speak `message` through VoiceOver (or any active assistive technology).
    ///
    /// - Parameters:
    ///   - message: The user-facing, already-localized text to speak. Empty
    ///     strings are ignored.
    ///   - priority: iOS 17+ delivery priority (default `.normal`).
    public static func announce(
        _ message: String,
        priority: AnnouncementPriority = .normal
    ) {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if #available(iOS 17.0, *) {
            var announcement = AttributedString(trimmed)
            // Documented iOS 17 SwiftUI API (WWDC23 "Build accessible apps with
            // SwiftUI and UIKit"): `.high` interrupts and cannot be interrupted,
            // `.default` interrupts but is interruptible, `.low` is queued.
            switch priority {
            case .high:   announcement.accessibilitySpeechAnnouncementPriority = .high
            case .normal: announcement.accessibilitySpeechAnnouncementPriority = .default
            case .low:    announcement.accessibilitySpeechAnnouncementPriority = .low
            }
            AccessibilityNotification.Announcement(announcement).post()
        } else {
            UIAccessibility.post(notification: .announcement, argument: trimmed)
        }
    }

    /// Tell assistive technology the screen's content changed substantially,
    /// optionally moving focus to `element` (or reading `message`).
    ///
    /// Use when a whole surface swaps (a flow step, a sheet replacing its body)
    /// — VoiceOver re-scans and lands focus appropriately. `.screenChanged` is
    /// supported and non-deprecated on every supported OS, so no version split
    /// is required.
    public static func screenChanged(_ message: String? = nil, focusing element: Any? = nil) {
        UIAccessibility.post(notification: .screenChanged, argument: element ?? message)
    }

    /// Tell assistive technology that part of the layout changed (an element
    /// appeared / disappeared) without a full screen change, optionally moving
    /// focus to `element` (or reading `message`).
    public static func layoutChanged(_ message: String? = nil, focusing element: Any? = nil) {
        UIAccessibility.post(notification: .layoutChanged, argument: element ?? message)
    }

    /// `true` when VoiceOver or Switch Control is active — a cheap heuristic for
    /// "give the user more time / extra cues". Other settings (e.g. Reduce
    /// Motion) have their own dedicated environment values.
    public static var isAssistiveTechRunning: Bool {
        UIAccessibility.isVoiceOverRunning || UIAccessibility.isSwitchControlRunning
    }
}
