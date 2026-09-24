import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class ReelFeedAutoplayCoordinatorTests: XCTestCase {

    private func frame(_ id: String, midY: CGFloat) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: 400, kind: .video)
    }

    /// Une surface de SCÈNE (canvas v3 d'un post, story repartagée) rapportée
    /// au coordinateur. Même forme qu'un réel : c'est le point de la directive
    /// porteur du 2026-09-05 — le fil n'a qu'UNE règle de lecture.
    private func scene(_ id: String, midY: CGFloat) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: 400, kind: .scene)
    }

    /// SUT without the default `CallManager` publisher (deterministic tests must
    /// not touch the singleton). Pass an explicit publisher where needed.
    private func makeSUT(
        isCallActive: @escaping () -> Bool = { false },
        callStatePublisher: AnyPublisher<Bool, Never>? = nil
    ) -> ReelFeedAutoplayCoordinator {
        ReelFeedAutoplayCoordinator(isCallActive: isCallActive, callStatePublisher: callStatePublisher)
    }

    /// `update()` coalesces via a ~100 ms debounce (I2), so settling requires
    /// awaiting past that window before asserting on `activeReelId`. Polls toward
    /// an expected value to stay robust against MainActor contention (app startup
    /// network/decode work can starve the debounce Task well past 100 ms).
    private func waitForActiveReel(
        _ sut: ReelFeedAutoplayCoordinator,
        toEqual expected: String?,
        timeout: TimeInterval = 2.0
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if sut.activeReelId == expected { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    /// Awaits past the debounce window without asserting a target (used when the
    /// expected outcome is "no change" — `nil`).
    private func waitForDebounce() async {
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

    func test_update_setsActiveToMostCenteredReel() async {
        let sut = makeSUT()
        sut.update(frames: [frame("a", midY: 100), frame("b", midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")
    }

    func test_update_whenCallActive_clearsActiveImmediately() async {
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")

        callActive = true
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        // No debounce wait: call-active clears synchronously inside update().
        XCTAssertNil(sut.activeReelId)
    }

    func test_update_noVisibleReel_clearsActive() async {
        let sut = makeSUT()
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")
        sut.update(frames: [], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId)
    }

    // MARK: - I2 — throttle / debounce

    func test_update_rapidCalls_onlyLastWins() async {
        let sut = makeSUT()
        // Rapid churn: only the final frame set should be elected (earlier tasks
        // are cancelled before they fire).
        sut.update(frames: [frame("a", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.update(frames: [frame("c", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        // Before the debounce fires, nothing is elected yet.
        XCTAssertNil(sut.activeReelId)
        await waitForActiveReel(sut, toEqual: "c")
        XCTAssertEqual(sut.activeReelId, "c")
    }

    // MARK: - C1 — live call-awareness (publisher driven, no scroll)

    func test_callBecomesActive_viaPublisher_clearsActiveWithoutScroll() async {
        let subject = PassthroughSubject<Bool, Never>()
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive }, callStatePublisher: subject.eraseToAnyPublisher())
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")

        // A call starts while the feed is immobile: no further update() is called,
        // yet the publisher push must suspend autoplay.
        callActive = true
        subject.send(true)
        // sink hops to main; poll until the suspension lands.
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId)
    }

    func test_clear_cancelsPendingDebounce() async {
        let sut = makeSUT()
        sut.update(frames: [frame("a", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.clear()
        await waitForDebounce()
        // The pending election must not resurrect an active reel after clear().
        XCTAssertNil(sut.activeReelId)
    }

    // MARK: - RF2 — cell-identity election (same reel native + reposted)

    /// MANDATORY review correction: when the SAME reel appears BOTH as a native
    /// reel card AND inside a repost cell, the two cells report DISTINCT election
    /// ids — the native card keys on the reel's own post id, the repost cell on the
    /// reposter's OUTER post id (`ReelRepostEmbedCell.reelCellId`). The coordinator
    /// elects a single id, so exactly ONE surface is ever active and the two never
    /// fight over the single shared `AVPlayerLayer`.
    func test_election_sameReelNativeAndReposted_exactlyOneSurfaceActive() async {
        let nativeCellId = "reelX"   // native reel card: its own post id (== reel id)
        let repostCellId = "outerPostB" // repost cell: the reposter's OUTER post id
        XCTAssertNotEqual(nativeCellId, repostCellId,
                          "Repost cells must key on the outer post id, not the reposted reel id")

        let sut = makeSUT()
        // The repost cell is more centered (viewport mid = 400) → it wins.
        sut.update(frames: [frame(nativeCellId, midY: 150), frame(repostCellId, midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: repostCellId)

        let nativeActive = sut.activeReelId == nativeCellId
        let repostActive = sut.activeReelId == repostCellId
        XCTAssertTrue(repostActive)
        XCTAssertFalse(nativeActive)
        XCTAssertFalse(nativeActive && repostActive,
                       "Two surfaces must never both bind the single shared player")
    }

    // MARK: - Les SCÈNES entrent dans l'élection (directive porteur 2026-09-05)

    /// **« Repartage ou non, les scènes sont comme les vidéos. »** Une scène
    /// (canvas v3 d'un post, ou story repartagée) concourt à l'élection du
    /// viewport au MÊME titre qu'un réel vidéo : `mostCenteredReel` n'a jamais
    /// regardé `kind`, mais aucune surface de scène ne RAPPORTAIT sa frame —
    /// la carte de post restait figée par `isPlaying: .constant(false)` et
    /// l'embed de story jouait en permanence, sans élection ni call-awareness.
    /// Deux politiques opposées pour le MÊME objet dans le MÊME fil.
    func test_election_admitsScenes_likeVideos() async {
        let sut = makeSUT()
        sut.update(frames: [scene("story-repost", midY: 100),
                            frame("reel", midY: 700)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "story-repost")
        XCTAssertEqual(sut.activeReelId, "story-repost",
                       "Une scène plus centrée qu'un réel doit gagner l'élection — le kind " +
                       "ne hiérarchise rien, seule la distance au centre du viewport décide.")
    }

    /// **Une seule surface joue, scènes et réels confondus.** C'est la raison
    /// d'être de l'élection unique : le moteur partagé (`SharedAVPlayerManager`)
    /// n'a qu'un porteur, et deux scènes qui jouent ensemble se disputeraient la
    /// session audio exactement comme deux réels.
    func test_election_scenesAndReels_exactlyOneSurfaceActive() async {
        let sut = makeSUT()
        sut.update(frames: [scene("scene-a", midY: 300),
                            scene("scene-b", midY: 420),
                            frame("reel-c", midY: 900)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "scene-b")
        XCTAssertEqual(sut.activeReelId, "scene-b",
                       "Le centre du viewport est 400 : `scene-b` (420) est la plus proche.")
    }

    /// **Une scène quittée par le viewport se PAUSE.** Le pendant de l'élection :
    /// sans cette libération, une scène élue resterait active en mémoire après
    /// être sortie de l'écran — la rétention que la dimension 3 interdit.
    func test_election_sceneScrolledOut_releasesTheSurface() async {
        let sut = makeSUT()
        sut.update(frames: [scene("s", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "s")
        XCTAssertEqual(sut.activeReelId, "s")

        sut.update(frames: [scene("s", midY: 3_000)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId,
                     "Hors du viewport, la scène n'est plus élue — donc plus jouée.")
    }

    /// **Une scène se tait pendant un appel, comme un réel.** La session audio
    /// appartient à l'appel ; une scène qui continuerait de jouer serait
    /// exactement le défaut que la call-awareness (C1) corrige côté réels.
    func test_election_sceneDuringCall_isSuspended() async {
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive })
        sut.update(frames: [scene("s", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "s")

        callActive = true
        sut.update(frames: [scene("s", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertNil(sut.activeReelId,
                     "Un appel actif vide l'élection sans débounce — une scène n'y échappe pas.")
    }

    // MARK: - #7009 — le voisin est DÉSIGNÉ pendant que N joue

    func test_update_designeLeVoisinSuivantDuReelActif() async {
        let sut = makeSUT()
        sut.update(
            frames: [frame("a", midY: 100), frame("b", midY: 400), frame("c", midY: 800)],
            viewportMinY: 0, viewportMaxY: 800
        )
        await waitForActiveReel(sut, toEqual: "b")

        XCTAssertEqual(sut.activeReelId, "b")
        XCTAssertEqual(sut.prewarmReelId, "c", "N+1 doit être désigné dès que N est élu")
    }

    /// Le DERNIER réel de la fenêtre n'a pas de suivant : désigner quoi que ce
    /// soit y réserverait une place du pool (borné à trois) pour rien.
    func test_update_surLeDernierReel_neDesigneAucunVoisin() async {
        let sut = makeSUT()
        sut.update(
            frames: [frame("a", midY: 100), frame("b", midY: 600)],
            viewportMinY: 0, viewportMaxY: 800
        )
        await waitForActiveReel(sut, toEqual: "b")

        XCTAssertEqual(sut.activeReelId, "b")
        XCTAssertNil(sut.prewarmReelId)
    }

    func test_clear_libereAussiLeVoisinDesigne() async {
        let sut = makeSUT()
        sut.update(
            frames: [frame("a", midY: 100), frame("b", midY: 400), frame("c", midY: 800)],
            viewportMinY: 0, viewportMaxY: 800
        )
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.prewarmReelId, "c")

        sut.clear()

        XCTAssertNil(sut.activeReelId)
        XCTAssertNil(sut.prewarmReelId, "quitter le fil doit relâcher le voisin, pas le garder préparé")
    }

    // MARK: - #7009 — la règle de fenêtre, pure

    func test_prewarmWindow_prendLeMidYImmediatementSuperieur() {
        let frames = [frame("a", midY: 100), frame("b", midY: 400), frame("c", midY: 800)]
        XCTAssertEqual(ReelPrewarmWindow.next(after: "a", in: frames), "b")
        XCTAssertEqual(ReelPrewarmWindow.next(after: "b", in: frames), "c")
        XCTAssertNil(ReelPrewarmWindow.next(after: "c", in: frames))
    }

    /// L'ordre du TABLEAU n'est pas l'ordre du FIL : `onPreferenceChange`
    /// agrège les frames dans l'ordre où les cartes se sont annoncées. La
    /// règle doit donc trancher sur la géométrie, jamais sur l'index.
    func test_prewarmWindow_ignoreLOrdreDuTableau() {
        let frames = [frame("c", midY: 800), frame("a", midY: 100), frame("b", midY: 400)]
        XCTAssertEqual(ReelPrewarmWindow.next(after: "a", in: frames), "b")
    }

    func test_prewarmWindow_sansActif_neDesigneRien() {
        XCTAssertNil(ReelPrewarmWindow.next(after: nil, in: [frame("a", midY: 100)]))
        XCTAssertNil(ReelPrewarmWindow.next(after: "absent", in: [frame("a", midY: 100)]))
    }

    // MARK: - #7625 — le lecteur plein écran garde ses deux voisins chauds

    /// Le pager plein écran (`ReelsPlayerView`) ne préparait RIEN : sa pile est
    /// paresseuse, la page N+1 n'était montée qu'au moment où elle entrait à
    /// l'écran, et c'est seulement là que son téléchargement partait — le swipe
    /// montrait le poster et un indicateur à la place de la vidéo. Le suivant
    /// passe EN PREMIER (geste majoritaire), le précédent ensuite (retour).
    func test_neighbours_auMilieu_rendLeSuivantPuisLePrecedent() {
        XCTAssertEqual(ReelPagerPrewarmWindow.neighbours(of: "b", in: ["a", "b", "c"]), ["c", "a"])
    }

    func test_neighbours_auDernier_rendSeulementLePrecedent() {
        XCTAssertEqual(ReelPagerPrewarmWindow.neighbours(of: "c", in: ["a", "b", "c"]), ["b"])
    }

    func test_neighbours_auPremier_rendSeulementLeSuivant() {
        XCTAssertEqual(ReelPagerPrewarmWindow.neighbours(of: "a", in: ["a", "b", "c"]), ["b"])
    }

    func test_neighbours_sansCourantOuInconnu_neRendRien() {
        XCTAssertEqual(ReelPagerPrewarmWindow.neighbours(of: nil, in: ["a", "b"]), [])
        XCTAssertEqual(ReelPagerPrewarmWindow.neighbours(of: "z", in: ["a", "b"]), [])
    }

    /// **Préchauffer, c'est aussi TÉLÉCHARGER** (#7625). La surface vidéo d'un
    /// réel attend `availability == .ready` — le fichier SUR DISQUE — avant
    /// de charger le moteur : un lecteur préparé en streaming ne suffisait
    /// pas, le swipe montrait le poster et un indicateur le temps du
    /// téléchargement. Le préchauffage pose donc le fichier dans le registre
    /// partagé, là où la surface le rejoindra.
    func test_prepare_reelVideo_startsItsDiskDownloadInTheSharedRegistry() async {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let url = "https://cdn.example.invalid/reel-\(UUID().uuidString).mp4"
        let post = makeVideoReel(url: url)

        await ReelPrewarm.prepare(post, preroll: false, center: center)

        XCTAssertNotNil(center.progress(for: AttachmentDownloadCenter.key(for: url)),
                        "le fichier du voisin doit être en cours de téléchargement avant le swipe")
        center.cancel(key: AttachmentDownloadCenter.key(for: url))
    }

    func test_prepare_reelWithoutVideo_downloadsNothing() async {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let url = "https://cdn.example.invalid/photo-\(UUID().uuidString).jpg"
        let post = makeVideoReel(url: url, mime: "image/jpeg")

        await ReelPrewarm.prepare(post, preroll: false, center: center)

        XCTAssertNil(center.progress(for: AttachmentDownloadCenter.key(for: url)))
    }

    private func makeVideoReel(url: String, mime: String = "video/mp4") -> FeedPost {
        let post: APIPost = JSONStub.decode("""
        {"id":"reel-\(UUID().uuidString)","type":"REEL","content":"","createdAt":"2026-09-23T10:00:00.000Z",
         "author":{"id":"a1","username":"alice"},
         "media":[{"id":"m1","fileUrl":"\(url)","mimeType":"\(mime)","fileSize":1000}]}
        """)
        return post.toFeedPost(preferredLanguages: [])
    }

    // MARK: - #7010 — `FeedView` n'OBSERVE pas le coordinateur

    /// `@StateObject` / `@ObservedObject` abonnent la vue à `objectWillChange`
    /// **que son body lise l'objet ou non**. `FeedView` ne lit aucun champ du
    /// coordinateur — il le PASSE à ses conteneurs — mais l'abonnement suffisait
    /// à re-differ 1 450 lignes de vue à chaque élection, c'est-à-dire en
    /// continu pendant le scroll. `@State` possède sans observer.
    ///
    /// Garde de SOURCE parce que la régression est invisible à tout témoin de
    /// comportement : les deux formes rendent exactement le même écran, l'une
    /// simplement en perdant des images.
    func test_feedViewPossedeLeCoordinateurSansLObserver() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedView.swift")
        let code = AppSourceGuard.stripComments(source)

        XCTAssertTrue(
            code.contains("@State private var reelAutoplay"),
            "FeedView doit POSSÉDER le coordinateur en `@State`"
        )
        for abonnement in ["@StateObject private var reelAutoplay", "@ObservedObject var reelAutoplay"] {
            XCTAssertFalse(
                code.contains(abonnement),
                """
                `FeedView` s'abonne de nouveau au coordinateur (`\(abonnement)`) : \
                chaque élection de réel re-diffe la vue entière pendant le scroll. \
                Les conteneurs (`ReelFeedCardContainer`, `PostSceneCardContainer`) \
                sont les seuls à devoir l'observer.
                """
            )
        }
    }
}

/// WS3.1 — the single open-autostart gate shared by a reel's audio and video
/// paths (`ReelPageView.shouldStartActiveMedia` / `ReelVideoView.drive`): an
/// active reel starts its media only once the liquid reveal has completed and no
/// call owns the audio session.
final class ReelMediaAutostartGateTests: XCTestCase {

    func test_starts_whenActiveAndRevealedAndNoCall() {
        XCTAssertTrue(ReelMediaAutostart.shouldStart(isActive: true, revealCompleted: true, isCallActive: false))
    }

    func test_doesNotStart_whenInactive() {
        XCTAssertFalse(ReelMediaAutostart.shouldStart(isActive: false, revealCompleted: true, isCallActive: false))
    }

    func test_doesNotStart_beforeRevealCompletes() {
        XCTAssertFalse(ReelMediaAutostart.shouldStart(isActive: true, revealCompleted: false, isCallActive: false),
                       "The first reel holds on its poster until the liquid reveal completes")
    }

    func test_doesNotStart_duringCall() {
        XCTAssertFalse(ReelMediaAutostart.shouldStart(isActive: true, revealCompleted: true, isCallActive: true),
                       "An active call owns the audio session — never start reel media over it")
    }

    // MARK: Audio open-autostart idempotency (F4/F6)

    /// `startActiveAudioIfNeeded` guards on `shouldLoadAudio(currentUrl:url:)`:
    /// calling it twice with the SAME (already-loaded) url must NOT restart the
    /// engine — a re-render / reveal flip must leave in-place audio untouched.
    func test_shouldLoadAudio_falseWhenSameUrl() {
        XCTAssertFalse(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: "https://cdn/a.mp3", url: "https://cdn/a.mp3"),
            "Same url already loaded — autostart must be a no-op (no restart)")
    }

    /// A `file://` url already loaded in its NORMALIZED form (what
    /// `AudioPlaybackManager.playLocal` stores) must also be a no-op — the F6 fix
    /// compares against the stored (normalized) value, not the raw string.
    func test_shouldLoadAudio_falseWhenSameNormalizedFileUrl() {
        let normalized = URL(string: "file:///tmp/voice.m4a")!.absoluteString
        XCTAssertFalse(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: normalized, url: normalized),
            "A file:// url already loaded in normalized form must not restart")
    }

    func test_shouldLoadAudio_trueWhenDifferentUrl() {
        XCTAssertTrue(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: "https://cdn/a.mp3", url: "https://cdn/b.mp3"),
            "A different url (e.g. a flag-tapped TTS language) must (re)load")
    }

    func test_shouldLoadAudio_trueWhenNothingLoaded() {
        XCTAssertTrue(
            ReelMediaAutostart.shouldLoadAudio(currentUrl: nil, url: "https://cdn/a.mp3"),
            "A fresh engine (no url) must load on open")
    }

}
