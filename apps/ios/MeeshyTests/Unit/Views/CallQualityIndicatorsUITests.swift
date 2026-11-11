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

    /// L'unité de l'écran d'appel (#8276) — un découpage n'éteint pas ces gardes.
    private func callViewSource() throws -> String {
        try AppSourceGuard.callViewSource()
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

    /// #17341 — le réseau dégradé d'un appel AUDIO n'est plus sous l'avatar : il vit
    /// dans la capsule de droite de l'en-tête. Seul le serveur de signalisation garde
    /// sa status pill.
    func test_persistentDegradedState_audioNetworkLivesInTheHeaderCapsule() throws {
        let view = try callViewSource()
        XCTAssertFalse(view.contains("call.status.peer.network\", defaultValue"), "plus de pastille « Réseau faible (contact) » sous l'avatar")
        XCTAssertFalse(view.contains("call.status.unstable"), "plus de pastille « Connexion instable » sous l'avatar")
        XCTAssertTrue(view.contains("call.status.signaling"), "Le serveur déconnecté garde sa status pill.")
    }

    func test_signalGlyph_isMountedInTheHeaderCapsuleOnly() throws {
        let view = try callViewSource()
        let glyphCount = view.components(separatedBy: "TransientCallSignalGlyph(strength: signalStrength)").count - 1
        XCTAssertEqual(
            glyphCount, 1,
            "Le glyphe de signal vit dans la capsule de l'en-tête (#17341) : plus sous l'avatar."
        )
    }

    /// #17341 — en audio, la capsule ne porte que le réseau dégradé : la reconnexion a
    /// déjà sa pill sous l'avatar, la capsule ne la répète ni à l'œil ni à VoiceOver.
    func test_audioCapsule_doesNotRepeatTheReconnectingPill() throws {
        let view = AppSourceGuard.stripComments(try callViewSource())
        XCTAssertTrue(view.contains("if capsule.showsDuration && isReconnecting {"))
        XCTAssertTrue(view.contains("reconnecting: reconnecting && capsule?.showsDuration != false"))
    }

    /// #17406 — la capsule n'apparaît ni ne disparaît d'un coup : elle naît de son
    /// bord, en fondu seul sous « Réduire les animations ».
    func test_headerCapsule_arrivesAndLeavesInMotion() throws {
        let view = AppSourceGuard.stripComments(try callViewSource())
        XCTAssertTrue(view.contains(".transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.8, anchor: .trailing)))"))
        XCTAssertTrue(view.contains(".animation(disclosureAnimation, value: headerCapsule != nil)"))
    }
}
