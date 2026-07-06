import XCTest
@testable import Meeshy

// MARK: - Alertes qualité transitoires + glyphe signal (2026-07-04)

/// Retour user : la pill orange « Réseau faible chez votre contact » restait
/// affichée en continu pendant l'appel (et pouvait rendre en capsule géante).
/// Invariants verrouillés ici :
///  1. Les bannières qualité/signaling sont PONCTUELLES — gouvernées par des
///     flags UI auto-expirants, jamais directement par l'état dégradé persistant.
///  2. L'état persistant est porté par des indicateurs discrets : glyphe
///     signal code couleur + status pills.
///  3. Le morph d'émergence de l'île n'interpole plus de frame `nil`
///     (cause racine de la capsule pleine-écran) — il passe par `scaleEffect`.
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

    // MARK: - Transient quality alert pills

    func test_remoteQualityBanner_isGatedOnTransientFlag_notPersistentState() throws {
        let view = try callViewSource()
        XCTAssertTrue(
            view.contains("if showRemoteQualityAlertPill {"),
            "The remote-quality banner must be gated on the transient UI flag — gating it " +
            "directly on callManager.isRemoteQualityDegraded kept it on screen for the " +
            "whole degradation (user bug: the orange pill never disappeared)."
        )
    }

    func test_signalingBanner_isGatedOnTransientFlag() throws {
        let view = try callViewSource()
        XCTAssertTrue(
            view.contains("if showSignalingAlertPill {"),
            "The signaling-degraded banner must be transient like the quality one."
        )
    }

    func test_alertPills_autoDismiss_viaTaskKeyedOnFlag() throws {
        let view = try callViewSource()
        XCTAssertTrue(
            view.contains(".task(id: showRemoteQualityAlertPill)")
                && view.contains(".task(id: showSignalingAlertPill)")
                && view.contains("qualityAlertPillSeconds"),
            "Both alert pills must auto-dismiss after qualityAlertPillSeconds via a " +
            ".task keyed on their visibility flag (cancelled automatically on early hide)."
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

    // MARK: - Island emergence morph safety

    func test_islandBanner_neverMorphsLayoutFrames() throws {
        let banner = try source("Meeshy/Features/Main/Components/IslandEmergingBanner.swift")
        XCTAssertFalse(
            banner.contains(".frame(width: born"),
            "The emergence morph must not interpolate .frame(width: X → nil) — an " +
            "unbounded nil dimension under an .infinity-proposing parent rendered the " +
            "capsule full-screen (user screenshot IMG_0525, 2026-07-04)."
        )
        XCTAssertTrue(
            banner.contains(".scaleEffect("),
            "The morph must use scaleEffect — a render-only, Animatable effect that " +
            "can never participate in layout, so the capsule is physically bounded " +
            "by its settled size."
        )
        XCTAssertTrue(
            banner.contains("ViewModifier, Animatable") && banner.contains("var animatableData"),
            "The emergence modifier must be Animatable on a single scalar progress so " +
            "SwiftUI interpolates the whole geometry deterministically along the curve."
        )
    }
}
