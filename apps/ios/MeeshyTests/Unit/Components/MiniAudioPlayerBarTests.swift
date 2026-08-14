import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class MiniAudioPlayerBarTests: XCTestCase {

    private func makeCoord(isPlaying: Bool = false,
                           activeAttachment: String? = nil)
        -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        if let id = activeAttachment {
            coord.test_setActiveContext(attachmentId: id)
            engine.isPlaying = isPlaying
        }
        return (coord, engine)
    }

    func test_visibility_hiddenWhenActiveContextNil() {
        let (coord, _) = makeCoord()
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertFalse(bar.shouldDisplayForTesting)
    }

    func test_visibility_visibleWhenContextSet() {
        let (coord, _) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertTrue(bar.shouldDisplayForTesting)
    }

    func test_tapPlayPause_invokesCoordinator() async {
        // Seed via `play()` (not `test_setActiveContext`) so the mock engine has
        // a loaded `currentUrl` — `togglePlayPause()` only forwards to
        // `engine.togglePlayPause()` when a track is actually loaded; otherwise it
        // takes the revive-dead-play-button branch (see the test below). Delta,
        // never absolute — the host app's own background services can tap other
        // coordinators/engines during the run.
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let current = QueuedAudio(
            attachmentId: "a1", messageId: "m1", conversationId: "c1",
            fileUrl: "https://cdn/a1.m4a", durationMs: 0, senderName: "A",
            senderAvatarURL: nil, receivedAt: Date()
        )
        coord.play(current: current, tail: [],
                   conversationName: "Conv", conversationArtworkURL: nil)
        let initialToggleCount = engine.togglePlayPauseCallCount

        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapPlayPauseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.togglePlayPauseCallCount, initialToggleCount + 1)
    }

    func test_tapPlayPause_withStolenEngine_reloadsCurrentHead() async {
        // A transient player (composer preview, status, reel) can steal the
        // engine via `PlaybackCoordinator.willStartPlaying` and `stop()` it while
        // the mini-player stays visible (`activeContext` non-nil) — the engine's
        // `currentUrl` goes nil. `togglePlayPause()` detects this and reloads the
        // queue head instead of forwarding a no-op toggle to a dead player
        // (ConversationAudioCoordinator.togglePlayPause(), the "revive dead play
        // button" branch). Effect on the mock: `startCurrentHead()` calls
        // `engine.play(urlString:)`, so `playCallCount` — not
        // `togglePlayPauseCallCount` — advances.
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let current = QueuedAudio(
            attachmentId: "a1", messageId: "m1", conversationId: "c1",
            fileUrl: "https://cdn/a1.m4a", durationMs: 0, senderName: "A",
            senderAvatarURL: nil, receivedAt: Date()
        )
        coord.play(current: current, tail: [],
                   conversationName: "Conv", conversationArtworkURL: nil)
        engine.stop() // simulates the transient-player steal: currentUrl -> nil
        let initialPlayCount = engine.playCallCount
        let initialToggleCount = engine.togglePlayPauseCallCount

        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapPlayPauseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.playCallCount, initialPlayCount + 1)
        XCTAssertEqual(engine.togglePlayPauseCallCount, initialToggleCount)
    }

    func test_tapNext_invokesCoordinatorPlayNext() async {
        // Seed via `play()` so the internal queue mirrors the active context.
        // `test_setActiveContext` only fakes the published surface — calling
        // playNext() on an unseeded coordinator would drop the upcoming entry
        // because `advanceQueue` removes the head first.
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let current = QueuedAudio(
            attachmentId: "a1", messageId: "m1", conversationId: "c1",
            fileUrl: "https://cdn/a1.m4a", durationMs: 0, senderName: "A",
            senderAvatarURL: nil, receivedAt: Date()
        )
        let upcoming = QueuedAudio(
            attachmentId: "a2", messageId: "m2", conversationId: "c1",
            fileUrl: "https://cdn/a2.m4a", durationMs: 0, senderName: "B",
            senderAvatarURL: nil, receivedAt: Date()
        )
        coord.play(current: current, tail: [upcoming],
                   conversationName: "Conv", conversationArtworkURL: nil)
        let initialPlayCount = engine.playCallCount

        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapNextForTesting()
        await Task.yield()
        XCTAssertEqual(engine.playCallCount, initialPlayCount + 1)
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a2.m4a")
    }

    func test_tapClose_clearsCoordinatorContext() async {
        let (coord, engine) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapCloseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.stopCallCount, 1)
        XCTAssertNil(coord.activeContext)
    }

    func test_tapBody_invokesRouterWithConversationId() {
        let (coord, _) = makeCoord(activeAttachment: "a1")
        var routedConvId: String?
        let bar = MiniAudioPlayerBar(
            coordinatorForTesting: coord,
            onTapBody: {},
            routerForTesting: { convId in routedConvId = convId }
        )
        bar.simulateTapBodyForTesting()
        XCTAssertNotNil(routedConvId)
    }

    func test_displayedContext_returnsActiveContextOrNil() {
        let (coord, _) = makeCoord()
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertNil(bar.displayedContextForTesting)

        coord.test_setActiveContext(attachmentId: "a1")
        XCTAssertEqual(bar.displayedContextForTesting?.attachmentId, "a1")
    }

    // MARK: - Route-aware visibility (2026-05-28 fix)
    //
    // The mini-player must hide whenever the user is already inside the
    // conversation that's driving playback — the in-place audio bubble
    // owns the controls there, the bar would overlap redundantly.

    func test_visibility_hiddenWhenInsidePlayingConversation() {
        let (coord, _) = makeCoord()
        coord.test_setActiveContext(attachmentId: "a1", conversationId: "conv-A")
        let bar = MiniAudioPlayerBar(
            coordinatorForTesting: coord,
            currentConversationId: { "conv-A" }
        )
        XCTAssertFalse(bar.shouldDisplayForTesting,
            "Bar must hide when the user is inside the conversation playing the audio")
        XCTAssertNil(bar.displayedContextForTesting)
    }

    func test_visibility_visibleWhenInsideOtherConversation() {
        let (coord, _) = makeCoord()
        coord.test_setActiveContext(attachmentId: "a1", conversationId: "conv-A")
        let bar = MiniAudioPlayerBar(
            coordinatorForTesting: coord,
            currentConversationId: { "conv-B" }
        )
        XCTAssertTrue(bar.shouldDisplayForTesting,
            "Bar must remain visible when the user is inside a different conversation")
        XCTAssertEqual(bar.displayedContextForTesting?.attachmentId, "a1")
    }

    func test_visibility_visibleWhenOutsideAnyConversation() {
        let (coord, _) = makeCoord()
        coord.test_setActiveContext(attachmentId: "a1", conversationId: "conv-A")
        // closure returns nil → user is on a hub route (settings, profile,
        // list, etc.) — bar must surface playback affordance.
        let bar = MiniAudioPlayerBar(
            coordinatorForTesting: coord,
            currentConversationId: { nil }
        )
        XCTAssertTrue(bar.shouldDisplayForTesting)
        XCTAssertEqual(bar.displayedContextForTesting?.attachmentId, "a1")
    }

    func test_visibility_defaultClosureKeepsBarVisible() {
        // Backward-compat: callers that don't pass `currentConversationId`
        // get the default `{ nil }` closure, preserving the historical
        // "always visible when playback is active" behavior.
        let (coord, _) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertTrue(bar.shouldDisplayForTesting)
    }

    // MARK: - Touch targets (HIG 44×44)

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Components/<this file>`.
    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func barSource() throws -> String {
        try source("Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift")
    }

    /// Apple HIG (and this repo's own iOS rule) put the floor for a tappable
    /// control at 44×44 pt. These three carry `.buttonStyle(.plain)`, which adds
    /// no padding of its own: the hit region is *exactly* the label's frame, so
    /// the frame is the touch target. At 32/28/24 pt they were all under the
    /// floor, the close button — which kills playback — worst of the three, and
    /// they sit shoulder to shoulder, where a miss lands on a neighbour.
    func test_transportControls_meetTheMinimumTouchTarget() throws {
        let code = try barSource()

        XCTAssertEqual(
            code.components(separatedBy: ".frame(width: 44, height: 44)").count - 1, 3,
            "Play/pause, next and close must each carry a 44×44 pt hit area."
        )
        for undersized in [
            ".frame(width: 32, height: 32)",
            ".frame(width: 28, height: 28)",
            ".frame(width: 24, height: 24)"
        ] {
            XCTAssertFalse(
                code.contains(undersized),
                "No transport control may keep a sub-44 pt frame (\(undersized)): with " +
                ".buttonStyle(.plain) that frame *is* the tappable region."
            )
        }
    }

    /// The 44 pt boxes supply their own visual rhythm — a ~14 pt glyph centred in
    /// 44 pt already leaves ~15 pt of breathing room on each side. Keeping the
    /// outer 10 pt spacing on top would push the cluster 48 pt wider and steal
    /// that width from the (single-line, truncating) track title; at spacing 0
    /// the growth is 28 pt and the gap between glyphs is visually unchanged.
    func test_transportCluster_letsTheHitAreasProvideTheSpacing() throws {
        let code = try barSource()

        XCTAssertTrue(
            code.contains("HStack(spacing: 0)"),
            "The three transport controls must sit in a zero-spacing HStack so their " +
            "44 pt hit areas are what separates the glyphs."
        )
    }

    /// `MiniAudioPlayerBar` documents itself as the "same atom + pattern as the
    /// floating call pill". The pill already sizes all three of its controls at
    /// 44×44; this pins the two to the same floor so the claim stays true.
    func test_transportControls_matchTheFloatingCallPillPrecedent() throws {
        let pill = try source("Meeshy/Features/Main/Views/FloatingCallPillView.swift")

        XCTAssertGreaterThanOrEqual(
            pill.components(separatedBy: ".frame(width: 44, height: 44)").count - 1, 3,
            "The precedent this bar mirrors must itself stay at the 44 pt floor."
        )
    }

    // MARK: - Habillage : aplat indigo, angles droits (retour user 2026-08-13)

    func test_bar_isAFlatIndigoBand_notAGlassCapsule() throws {
        let code = try barSource()

        XCTAssertFalse(
            code.contains("adaptiveGlass"),
            "Le mini-lecteur ne flotte pas : il occupe une bande du VStack de " +
            "compression de RootView. Le verre lui faisait emprunter sa couleur " +
            "au contenu qui défilait derrière, et promettait un objet flottant."
        )
        XCTAssertFalse(
            code.contains("clipShape(Capsule())"),
            "Plus d'arrondi : la bande va d'un bord à l'autre."
        )
        XCTAssertTrue(
            code.contains(".background(MiniAudioPlayerBarStyle.background)"),
            "Le fond doit être l'aplat de marque, posé via le token de style."
        )
        XCTAssertTrue(
            code.contains(".frame(maxWidth: .infinity)"),
            "La bande doit occuper toute la largeur — un aplat inséré laisserait " +
            "deviner la capsule qu'il remplace."
        )
    }

    func test_barStyle_paintsAnOpaqueIndigo() {
        XCTAssertEqual(
            MiniAudioPlayerBarStyle.background,
            MeeshyColors.indigo600,
            "« Couleur plate d'indigo » : l'indigo de marque plein, pas un dégradé " +
            "ni une teinte translucide."
        )
    }

    func test_barContents_neverRelyOnSystemPrimaryOrSecondary() throws {
        let code = try barSource()

        // Sur un aplat indigo soutenu, `.primary` vire au NOIR en thème clair —
        // illisible. Les deux tokens de style sont la seule source de couleur
        // de texte et d'icône de la barre.
        XCTAssertFalse(
            code.contains("foregroundColor(.primary)"),
            "Un contenu en .primary devient noir sur l'indigo en thème clair."
        )
        XCTAssertFalse(
            code.contains("foregroundColor(.secondary)"),
            "Un contenu en .secondary devient gris sombre sur l'indigo en thème clair."
        )
        XCTAssertTrue(
            code.contains("MiniAudioPlayerBarStyle.primaryForeground"),
            "Les contenus principaux passent par le token de premier plan."
        )
        XCTAssertTrue(
            code.contains("MiniAudioPlayerBarStyle.secondaryForeground"),
            "Les contenus secondaires passent par le token atténué."
        )
    }
}
