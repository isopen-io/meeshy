import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// User-reported 2026-05-28 « les médias d'un slide ne doivent JOUER que dans
/// le cadre où ce slide est à l'écran ; dès que le slide quitte l'écran, tout
/// média du slide doit cesser de manière synchrone ».
///
/// `StoryCardView` instancie un second `StoryReaderRepresentable` pour
/// `outgoingStory` pendant le cross-fade (~350-400 ms). Sans gate, ce canvas
/// fraîchement mounté entre en mode `.play`, démarre son AVPlayer bg + son
/// audio mixer + ses AVPlayer FG — et joue en parallèle du nouveau canvas
/// visible jusqu'à la fin de l'animation. C'est l'une des trois sources de
/// double-lecture.
///
/// `isOutgoing: true` cocher au constructeur force le canvas en `.edit` mode
/// dès `makeUIView` :
///   - `backgroundLayer.isPlaybackActive = false` → vidéo bg figée frame 0
///   - pas de displayLink playback, pas de `startAudioPlayback`
///   - les `AVPlayer` FG attachés ne se mettent pas à play
/// Le visuel reste un still du slide (image bg + textes), suffisant pour un
/// cross-fade 350 ms sans bleed audio.
@MainActor
final class StoryReaderRepresentableOutgoingTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStory(id: String = "s-test") -> StoryItem {
        StoryItem(
            id: id,
            content: "hello",
            media: [],
            storyEffects: StoryEffects(),
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        )
    }

    private func mountRepresentable(_ rep: StoryReaderRepresentable) -> StoryCanvasUIView? {
        let host = UIHostingController(rootView: rep.frame(width: 412, height: 732))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 412, height: 732))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return findCanvas(in: host.view)
    }

    private func findCanvas(in view: UIView) -> StoryCanvasUIView? {
        if let canvas = view as? StoryCanvasUIView { return canvas }
        for sub in view.subviews {
            if let canvas = findCanvas(in: sub) { return canvas }
        }
        return nil
    }

    // MARK: - Tests

    /// Quand `isOutgoing: true`, le canvas mounté DOIT être en `.edit` mode
    /// pour que ses médias soient gelés pendant le cross-fade.
    func test_isOutgoingTrue_canvasMountedInEditMode() {
        let rep = StoryReaderRepresentable(
            story: makeStory(),
            preferredLanguages: ["fr"],
            mute: false,
            isOutgoing: true
        )
        let canvas = mountRepresentable(rep)
        XCTAssertNotNil(canvas, "Canvas must be mounted by makeUIView")
        XCTAssertEqual(canvas?.mode, .edit,
                       "isOutgoing must instantiate canvas in .edit so its bg video / audio mixer / FG players don't play during cross-fade")
    }

    /// Par défaut (`isOutgoing: false`), le canvas reste en `.play` —
    /// ne pas régresser le chemin visible.
    func test_isOutgoingDefault_canvasMountedInPlayMode() {
        let rep = StoryReaderRepresentable(
            story: makeStory(),
            preferredLanguages: ["fr"],
            mute: false
        )
        let canvas = mountRepresentable(rep)
        XCTAssertNotNil(canvas)
        XCTAssertEqual(canvas?.mode, .play,
                       "Default visible canvas must instantiate in .play for normal reader playback")
    }

    /// Quand `isOutgoing: true`, la vidéo de fond est désactivée immédiatement.
    /// Le drapeau `backgroundLayer.isPlaybackActive` est l'unique gate pour
    /// que le bg video AVPlayer démarre — `false` garantit zéro bleed.
    func test_isOutgoingTrue_backgroundPlaybackInactive() {
        let rep = StoryReaderRepresentable(
            story: makeStory(),
            preferredLanguages: ["fr"],
            mute: false,
            isOutgoing: true
        )
        let canvas = mountRepresentable(rep)
        XCTAssertNotNil(canvas)
        XCTAssertFalse(canvas?.backgroundLayer.isPlaybackActive ?? true,
                       "Outgoing canvas must NOT activate its background video playback")
    }

    /// User report 2026-05-28 (suite Fix A) : « quand je reviens à une story
    /// arrière avec vidéo de fond, puis je repars à la story suivante avec
    /// les mêmes types de media, j'ai les deux medias qui jouent en même
    /// temps ».
    ///
    /// Cause : SwiftUI peut maintenir transitoirement deux `StoryCanvasUIView`
    /// en `.play` dans la window pendant la fenêtre de diff (~1-2 frames =
    /// 16-33 ms). Le `PlaybackCoordinator.willStartPlaying(external:)` mutex
    /// les **audio mixers** mais NE COORDONNE PAS les `AVPlayer` bg/FG. Sur
    /// une slide avec vidéo bg portant une piste audio + audio mixer
    /// foreground, le bleed est audible.
    ///
    /// Fix : la création d'un canvas en `.play` doit préempter tous les
    /// autres canvases déjà en `.play` (pause bg AVPlayer + FG AVPlayer +
    /// audio mixer).
    func test_newCanvasInPlay_preemptsOtherActiveCanvases() {
        let slideA = StoryItem(
            id: "slide-a",
            content: "A",
            media: [],
            storyEffects: StoryEffects(),
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        ).toRenderableSlide(preferredLanguages: ["fr"])
        let slideB = StoryItem(
            id: "slide-b",
            content: "B",
            media: [],
            storyEffects: StoryEffects(),
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        ).toRenderableSlide(preferredLanguages: ["fr"])

        let canvasA = StoryCanvasUIView(slide: slideA, mode: .play)
        // Simulate post-contentReady state : en production
        // `fireContentReadyIfNeeded` met `isPlaybackActive = true` quand
        // l'image bg / vidéo bg sont chargées. Ici on force l'état pour
        // tester la préemption pure sans dépendre du flux async.
        canvasA.backgroundLayer.isPlaybackActive = true
        XCTAssertTrue(canvasA.backgroundLayer.isPlaybackActive,
                      "Test setup : canvas A simule l'état post-content-ready")

        // Création d'un second canvas en `.play` — simule le swap visible
        // pendant que l'ancien canvas n'est pas encore détruit par SwiftUI.
        let canvasB = StoryCanvasUIView(slide: slideB, mode: .play)

        XCTAssertFalse(canvasA.backgroundLayer.isPlaybackActive,
                       "Creating a second .play canvas must preempt the first canvas's bg playback — sinon les deux vidéos bg jouent en parallèle quand SwiftUI tarde à détruire l'ancien (window de teardown 16-33 ms entre body re-render et removeFromSuperview)")
        _ = canvasB  // Keep canvasB alive until end of test (prevents premature dealloc).
    }

    /// Tous les canvases bootstrapés par le prefetcher restent en `.edit` —
    /// ils servent uniquement de cache chaud (image bg pré-décodée, AVPlayer
    /// asset chargé), pas de lecture. Le canvas visible (`StoryCardView`)
    /// est l'unique surface qui joue.
    ///
    /// Garantit que la double-lecture média (canvas visible + canvas
    /// prefetcher du même slide tous deux en `.play`) n'est plus possible.
    func test_prefetcher_allCanvasesRemainInEditMode() {
        let items = (0..<4).map { i -> StoryItem in
            StoryItem(
                id: "s\(i)",
                content: "slide \(i)",
                media: [],
                storyEffects: StoryEffects(),
                createdAt: Date(),
                expiresAt: nil,
                isViewed: false
            )
        }
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 2,
                                context: .empty,
                                preferredLanguages: ["fr"])

        // Sanity : la fenêtre a bootstrapé des canvases.
        XCTAssertFalse(prefetcher.bootstrapped.isEmpty,
                       "Prefetcher must bootstrap at least one canvas")
        // INVARIANT : aucun canvas bootstrapé n'est en `.play`.
        for (id, canvas) in prefetcher.bootstrapped {
            XCTAssertEqual(canvas.mode, .edit,
                           "Prefetcher canvas '\(id)' must stay in .edit mode — promoting to .play causes double-playback with the visible StoryReaderRepresentable")
        }
    }
}
