@preconcurrency import AppIntents
import Foundation
import MeeshySDK
import os

nonisolated private let logger = Logger(subsystem: "me.meeshy.app", category: "focus-filter")

/// User-facing knobs exposed when configuring a Focus mode to include Meeshy.
///
/// Example: the user goes Settings → Focus → Work → Add Filter → Meeshy, picks
/// "Direct messages only" and "Mute reactions". While Work is active iOS passes
/// the saved selection to the app via the filter, and the app stores it in the
/// App Group so `NotificationManager.handleNewNotification` can consult it
/// before surfacing a toast.
@available(iOS 16.0, *)
struct MeeshyFocusFilter: SetFocusFilterIntent {
    nonisolated static let title: LocalizedStringResource = "Meeshy Focus Filter"
    nonisolated static let description = IntentDescription("Choose which Meeshy notifications surface while this Focus is active.")

    nonisolated var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: Self.title)
    }

    @Parameter(
        title: "Allow direct messages",
        default: true
    )
    var allowDirectMessages: Bool

    @Parameter(
        title: "Allow group messages",
        default: false
    )
    var allowGroupMessages: Bool

    @Parameter(
        title: "Allow mentions",
        default: true
    )
    var allowMentions: Bool

    @Parameter(
        title: "Allow reactions",
        default: false
    )
    var allowReactions: Bool

    @Parameter(
        title: "Allow social feed",
        default: false
    )
    var allowSocial: Bool

    @Parameter(
        title: "Allow calls",
        default: true
    )
    var allowCalls: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("Allow Meeshy notifications") {
            \.$allowDirectMessages
            \.$allowGroupMessages
            \.$allowMentions
            \.$allowReactions
            \.$allowSocial
            \.$allowCalls
        }
    }

    func perform() async throws -> some IntentResult {
        let snapshot = MeeshyFocusSnapshot(
            allowDirectMessages: allowDirectMessages,
            allowGroupMessages: allowGroupMessages,
            allowMentions: allowMentions,
            allowReactions: allowReactions,
            allowSocial: allowSocial,
            allowCalls: allowCalls,
            isActive: true
        )
        await MeeshyFocusStore.shared.save(snapshot)
        logger.info("Focus filter applied: \(String(describing: snapshot))")
        return .result()
    }
}

// MARK: - Storage

/// Serialised state of the active Meeshy focus filter (if any). Persisted in the
/// App Group so the widget extension / notification service extension can read
/// it too — they also need to respect Focus gating.
public struct MeeshyFocusSnapshot: Codable, Sendable, Equatable {
    public var allowDirectMessages: Bool
    public var allowGroupMessages: Bool
    public var allowMentions: Bool
    public var allowReactions: Bool
    public var allowSocial: Bool
    public var allowCalls: Bool
    public var isActive: Bool

    public static let permissive = MeeshyFocusSnapshot(
        allowDirectMessages: true,
        allowGroupMessages: true,
        allowMentions: true,
        allowReactions: true,
        allowSocial: true,
        allowCalls: true,
        isActive: false
    )

    /// Convert to the SDK-visible shape that `NotificationManager` consumes.
    public func toSDKSnapshot() -> FocusFilterSnapshot {
        FocusFilterSnapshot(
            allowDirectMessages: allowDirectMessages,
            allowGroupMessages: allowGroupMessages,
            allowMentions: allowMentions,
            allowReactions: allowReactions,
            allowSocial: allowSocial,
            allowCalls: allowCalls,
            isActive: isActive
        )
    }
}

/// App-Group-backed store for the current Focus filter. Single file so the
/// widget / notification extension can read without depending on the app.
@MainActor
public final class MeeshyFocusStore {
    public static let shared = MeeshyFocusStore()

    private let suiteName = "group.me.meeshy.app"
    private let key = "meeshy_focus_filter"

    private lazy var defaults: UserDefaults? = {
        UserDefaults(suiteName: suiteName)
    }()

    private init() {}

    public var current: MeeshyFocusSnapshot {
        guard let defaults,
              let data = defaults.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(MeeshyFocusSnapshot.self, from: data) else {
            return .permissive
        }
        return snapshot
    }

    public func save(_ snapshot: MeeshyFocusSnapshot) {
        guard let defaults,
              let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
    }

    public func clear() {
        defaults?.removeObject(forKey: key)
    }
}
