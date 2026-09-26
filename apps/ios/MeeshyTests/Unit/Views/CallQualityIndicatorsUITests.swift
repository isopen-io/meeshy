import XCTest
@testable import Meeshy

// MARK: - Indicateurs réseau discrets, sans bannière pop-up (2026-07-13)

/// Retour user (2026-07-13) : la pill « Réseau faible chez votre contact » était
/// du bruit inutile en plein appel. Les bannières pop-up transitoires (qualité
/// ET signaling) ont été retirées. Invariants verrouillés ici :
///  1. Aucune bannière pop-up de faiblesse réseau ne subsiste dans CallView —
///     ni la machinerie de flags/auto-retrait qui la pilotait.
///  2. L'état de faiblesse réseau vit UNIQUEMENT dans des indicateurs discrets :
///     glyphe signal code couleur + status pills inline.
///  3. VoiceOver reste notifié à la bascule en dégradé (annonce a11y conservée).
@MainActor
final class CallQualityIndicatorsUITests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func callViewSource() throws -> String {
        try source("Meeshy/Features/Main/Views/CallView.swift")
    }

    // MARK: - No transient pop-up banners

    func test_remoteQualityPopupBanner_isRemoved() throws {
        let view = try callViewSource()
        XCTAssertFalse(
            view.contains("remoteQualityDegradedBanner") || view.contains("showRemoteQualityAlertPill"),
            "The transient remote-quality pop-up banner must be gone — the degraded peer " +
            "link is surfaced only by discreet inline indicators, never a pop-up (user " +
            "feedback 2026-07-13: the orange pill was useless noise)."
        )
    }

    func test_signalingPopupBanner_isRemoved() throws {
        let view = try callViewSource()
        XCTAssertFalse(
            view.contains("signalingDegradedBanner") || view.contains("showSignalingAlertPill"),
            "The transient signaling-degraded pop-up banner must be gone too — same doctrine."
        )
    }

    func test_noAutoDismissMachineryForAlertPills() throws {
        let view = try callViewSource()
        XCTAssertFalse(
            view.contains("qualityAlertPillSeconds"),
            "With no transient banner left, the auto-dismiss task/timer machinery must be removed."
        )
    }

    func test_networkDegradation_stillAnnouncedToVoiceOver() throws {
        let view = try callViewSource()
        XCTAssertTrue(
            view.contains("call.a11y.remote.quality.poor") && view.contains("call.a11y.signaling.degraded"),
            "Even without a visible banner, VoiceOver must still be notified when the peer's " +
            "link or the signaling degrades — the a11y announcements survive the banner removal."
        )
    }

    // MARK: - Persistent, discreet state indicators

    func test_persistentDegradedState_isCarriedByStatusPills() throws {
        let view = try callViewSource()
        XCTAssertTrue(
            view.contains("call.status.peer.network"),
            "While the peer's network stays degraded (after the transient banner left), " +
            "a discreet status pill must carry the state in the audio layout."
        )
        XCTAssertTrue(
            view.contains("call.status.signaling"),
            "Same for the signaling-degraded state."
        )
    }

    func test_signalGlyph_isMountedInDurationBadges() throws {
        let view = try callViewSource()
        let glyphCount = view.components(separatedBy: "TransientCallSignalGlyph(strength: signalStrength)").count - 1
        XCTAssertGreaterThanOrEqual(
            glyphCount, 2,
            "The color-coded signal glyph must live in BOTH duration badges " +
            "(audio capsule + video overlay badge)."
        )
    }
}
