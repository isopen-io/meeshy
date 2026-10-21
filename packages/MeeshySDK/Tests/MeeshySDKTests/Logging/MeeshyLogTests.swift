import XCTest
import os
@testable import MeeshySDK

final class MeeshyLogTests: XCTestCase {

    private static let historicalConsoleCategories: Set<String> = [
        "AttachmentStatus",
        "affiliate",
        "analytics",
        "anon-session",
        "attachment-prep",
        "audio-coordinator",
        "audio-editor",
        "audio-playback",
        "audio-recorder",
        "audio-session",
        "auth",
        "background",
        "background-transition",
        "cache",
        "cache-accounts",
        "cache-bg-flush",
        "cache-coordinator",
        "cache-policy",
        "cache-purge",
        "call-controls",
        "call-decline",
        "call-live-frame",
        "call-montage-recording",
        "call-recording",
        "call-sounds",
        "calls",
        "capture-shield",
        "comment-ingest",
        "community",
        "composer",
        "composer-autosave",
        "composer-drop",
        "composer-paste",
        "composer-scene-export",
        "contact-sync",
        "content-capture",
        "content-open",
        "conv-options",
        "conversation-card",
        "conversation-commands",
        "conversation-encryption",
        "conversation-info",
        "conversation-state-outbox",
        "crash",
        "db-encryption",
        "db-maintenance",
        "dependency-container",
        "device-translation",
        "disk-cache",
        "draft-store",
        "drafts",
        "e2ee",
        "edit-history",
        "engagement",
        "engagement-outbox",
        "feed-persistence",
        "focus-filter",
        "friendship-cache",
        "game",
        "grdb",
        "grdb-cache-store",
        "grdb-suspension",
        "impressions",
        "keychain",
        "launch",
        "link-preview",
        "live-activity",
        "location",
        "location-thumbnail",
        "magic-link",
        "media",
        "media-autosave",
        "media-branding",
        "media-compressor",
        "media-file-download",
        "media-hub",
        "media-index",
        "media-save",
        "message-store-router",
        "message-store-session",
        "messages",
        "metrics-subscriber",
        "mood-spotlight",
        "navigation",
        "nearby",
        "nearby-cache",
        "nearby-decode",
        "network",
        "notif-resync",
        "notification-coordinator",
        "notifications",
        "now-playing",
        "nse-consumer",
        "nse-datasync",
        "nse-post-consumer",
        "nse-posts",
        "nse-prefs-gate",
        "offlinequeue",
        "onboarding",
        "outbox-dispatcher",
        "outbox-flusher",
        "packs",
        "participant-service",
        "participants",
        "pending-status",
        "phonebook",
        "photo-library",
        "pip",
        "player",
        "presence",
        "profile",
        "publication-cancel",
        "push",
        "push-receipt",
        "reels-perf",
        "requests",
        "retention",
        "router",
        "screen-share",
        "searchindex",
        "session-snapshot",
        "settings",
        "settingsactionqueue",
        "share-compose",
        "share-consumer",
        "share-extension",
        "sign-in-link",
        "social-events-v2",
        "social-events-v2-outbox",
        "socket",
        "starred-store",
        "stats",
        "status-bubble",
        "sticker-library",
        "sticker-nearby",
        "stories",
        "story-audio",
        "story-export-share",
        "story-media",
        "story-offline-queue",
        "story-publish-queue",
        "story-publish-sanitizer",
        "story-publish-service",
        "story-queue-migrator",
        "story-timeline-export",
        "story.interaction",
        "stuck-publication-retry",
        "sync",
        "test-network-seal",
        "tls-pinning",
        "tus-checkpoint",
        "tus-upload",
        "ui",
        "visitor-reach",
        "voice-note-transcriber",
        "voip-push",
        "voip-token",
        "webrtc",
        "widget-data",
        "widget-flusher",
    ]

    private static let recipeCategories: Set<String> = [
        "comment-send", "comment-sheet-fit", "first-render-warmup", "lottie-film",
    ]

    func test_subsystem_isTheHistoricalAppSubsystem() {
        XCTAssertEqual(MeeshyLog.subsystem, "me.meeshy.app")
    }

    func test_subsystemRawValues_matchHistoricalSubsystems() {
        let raw = MeeshyLog.Subsystem.allCases.map(\.rawValue)

        XCTAssertEqual(raw, [
            "me.meeshy.app",
            "me.meeshy.sdk",
            "com.meeshy.sdk",
            "com.meeshy.app",
            "com.meeshy.ios",
            "me.meeshy.app.notification-content",
        ])
    }

    func test_address_withoutSubsystem_isTheAppSubsystem() {
        XCTAssertEqual(
            MeeshyLog.address(.calls),
            LogAddress(subsystem: "me.meeshy.app", category: "calls")
        )
    }

    func test_address_keepsTheLegacySubsystemOfACollidingCategory() {
        XCTAssertEqual(
            MeeshyLog.address(.network, subsystem: .legacySDK),
            LogAddress(subsystem: "com.meeshy.sdk", category: "network")
        )
        XCTAssertEqual(
            MeeshyLog.address(.network),
            LogAddress(subsystem: "me.meeshy.app", category: "network")
        )
        XCTAssertEqual(
            MeeshyLog.address(.keychain, subsystem: .legacySDK),
            LogAddress(subsystem: "com.meeshy.sdk", category: "keychain")
        )
        XCTAssertEqual(
            MeeshyLog.address(.keychain),
            LogAddress(subsystem: "me.meeshy.app", category: "keychain")
        )
        XCTAssertEqual(
            MeeshyLog.address(.linkPreview, subsystem: .legacySDK),
            LogAddress(subsystem: "com.meeshy.sdk", category: "link-preview")
        )
        XCTAssertEqual(
            MeeshyLog.address(.linkPreview),
            LogAddress(subsystem: "me.meeshy.app", category: "link-preview")
        )
    }

    func test_categoryRawValues_coverEveryHistoricalConsoleCategory() {
        let raw = MeeshyLog.Category.allCases.map(\.rawValue)

        XCTAssertEqual(Set(raw).count, raw.count)
        XCTAssertEqual(
            Set(raw),
            Self.historicalConsoleCategories.union(Self.recipeCategories)
        )
    }

    func test_categoryRawValues_keepTheHistoricalOrderOfTheFirstNine() {
        let raw = Array(MeeshyLog.Category.allCases.prefix(9).map(\.rawValue))

        XCTAssertEqual(raw, ["network", "auth", "messages", "media", "socket", "cache", "ui", "pip", "grdb"])
    }

    func test_categoryRawValue_isTheVerbatimConsoleString() {
        XCTAssertEqual(MeeshyLog.Category.storyInteraction.rawValue, "story.interaction")
        XCTAssertEqual(MeeshyLog.Category.attachmentStatus.rawValue, "AttachmentStatus")
        XCTAssertEqual(MeeshyLog.Category.socialEventsV2Outbox.rawValue, "social-events-v2-outbox")
        XCTAssertEqual(MeeshyLog.Category.offlinequeue.rawValue, "offlinequeue")
    }

    func test_loggerShortcuts_stillExist() {
        let shortcuts: [Logger] = [
            .network, .auth, .messages, .media, .socket, .cache, .ui, .pip,
        ]

        XCTAssertEqual(shortcuts.count, 8)
    }
}
