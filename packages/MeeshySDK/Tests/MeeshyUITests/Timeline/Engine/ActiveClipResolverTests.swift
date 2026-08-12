import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// `TimelineViewModel` s'abonne depuis toujours à
/// `engine.onElementBecameActive` pour que l'inspecteur suive le clip
/// franchi pendant la lecture — mais l'engine n'a JAMAIS appelé ce callback :
/// zéro `onElementBecameActive?(…)` dans tout le moteur. Le consommateur
/// était câblé, le producteur n'existait pas. La sélection restait figée sur
/// le clip que l'utilisateur avait touché en dernier, quel que soit ce qui
/// jouait réellement.
final class ActiveClipResolverTests: XCTestCase {

    // MARK: - Fixtures

    private func media(_ id: String, start: Double, duration: Double,
                       isBackground: Bool = false) -> StoryMediaObject {
        var m = StoryMediaObject(id: id, postMediaId: id, kind: .video, aspectRatio: 1.0)
        m.startTime = start
        m.duration = duration
        m.isBackground = isBackground
        return m
    }

    private func project(media: [StoryMediaObject] = [],
                         audio: [StoryAudioPlayerObject] = [],
                         texts: [StoryTextObject] = [],
                         stickers: [StorySticker] = [],
                         duration: Float = 20) -> TimelineProject {
        var p = TimelineProject(slideId: "s", slideDuration: duration,
                                mediaObjects: media, audioPlayerObjects: audio,
                                textObjects: texts, clipTransitions: [])
        p.stickerObjects = stickers
        return p
    }

    // MARK: - Fenêtre temporelle

    func test_picksTheClipWhoseWindowContainsThePlayhead() {
        let p = project(media: [media("a", start: 0, duration: 5),
                                media("b", start: 5, duration: 5)])
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 2, in: p), "a")
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 7, in: p), "b")
    }

    /// La borne de début appartient au clip, la borne de fin au SUIVANT —
    /// sans quoi deux clips adjacents se disputeraient l'instant pivot.
    func test_startBoundIsInclusive_endBoundIsExclusive() {
        let p = project(media: [media("a", start: 0, duration: 5),
                                media("b", start: 5, duration: 5)])
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 5, in: p), "b")
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 4.999, in: p), "a")
    }

    func test_returnsNil_inAGapBetweenClips() {
        let p = project(media: [media("a", start: 0, duration: 2),
                                media("b", start: 8, duration: 2)])
        XCTAssertNil(ActiveClipResolver.activeClipId(at: 5, in: p),
                     "Un trou n'a pas de clip actif — mieux vaut ne rien sélectionner qu'inventer.")
    }

    func test_returnsNil_onAnEmptyProject() {
        XCTAssertNil(ActiveClipResolver.activeClipId(at: 3, in: project()))
    }

    // MARK: - Chevauchements

    /// Deux clips qui se recouvrent : celui qui a démarré le PLUS RÉCEMMENT
    /// gagne — c'est celui que l'utilisateur voit arriver par-dessus.
    func test_onOverlap_theMostRecentlyStartedClipWins() {
        let p = project(media: [media("under", start: 0, duration: 10),
                                media("over", start: 4, duration: 3)])
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 5, in: p), "over")
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 8, in: p), "under",
                       "Une fois le clip du dessus terminé, celui du dessous redevient actif.")
    }

    /// Un FOND couvre toute la slide : le retenir le rendrait actif en
    /// permanence et la sélection ne bougerait jamais.
    func test_backgroundClipsAreNeverTheActiveClip() {
        let p = project(media: [media("bg", start: 0, duration: 20, isBackground: true),
                                media("fg", start: 4, duration: 3)])
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 5, in: p), "fg")
        XCTAssertNil(ActiveClipResolver.activeClipId(at: 12, in: p),
                     "Hors du clip foreground, le fond ne prend pas la main.")
    }

    // MARK: - Toutes les catégories de clip

    func test_textAndStickerAndAudioClipsCanAlsoBecomeActive() {
        let text = StoryTextObject(id: "t1", text: "Salut", startTime: 0, duration: 3)
        let sticker = StorySticker(id: "st1", emoji: "🔥", startTime: 3, duration: 3)
        let audio = StoryAudioPlayerObject(id: "au1", postMediaId: "au1", volume: 1,
                                           startTime: 6, duration: 3)
        let p = project(audio: [audio], texts: [text], stickers: [sticker])
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 1, in: p), "t1")
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 4, in: p), "st1")
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 7, in: p), "au1")
    }

    /// Un clip « permanent » (durée nil — tout texte fraîchement posé) couvre
    /// la slide entière, comme un fond : même exclusion.
    func test_permanentClipsWithoutADurationAreNotTheActiveClip() {
        let text = StoryTextObject(id: "t1", text: "Permanent", startTime: 0, duration: nil)
        let p = project(media: [media("fg", start: 2, duration: 2)], texts: [text])
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 3, in: p), "fg")
        XCTAssertNil(ActiveClipResolver.activeClipId(at: 9, in: p))
    }

    // MARK: - Stabilité

    /// Le résolveur est appelé à chaque frame : deux appels au même instant
    /// doivent rendre le même clip, sinon l'inspecteur clignoterait.
    func test_isStableAcrossRepeatedCallsAtTheSameTime() {
        let p = project(media: [media("a", start: 0, duration: 5),
                                media("b", start: 2, duration: 5)])
        let first = ActiveClipResolver.activeClipId(at: 3, in: p)
        for _ in 0..<10 {
            XCTAssertEqual(ActiveClipResolver.activeClipId(at: 3, in: p), first)
        }
    }

    func test_negativeAndOutOfRangeTimesResolveToNothing() {
        let p = project(media: [media("a", start: 0, duration: 5)])
        XCTAssertNil(ActiveClipResolver.activeClipId(at: -1, in: p))
        XCTAssertNil(ActiveClipResolver.activeClipId(at: 99, in: p))
    }
}
