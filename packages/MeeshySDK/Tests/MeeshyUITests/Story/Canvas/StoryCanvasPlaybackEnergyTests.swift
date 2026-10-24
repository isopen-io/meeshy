import XCTest
import CoreGraphics
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// #9864 — le lecteur de story ne reconstruit plus sa scène à chaque image.
///
/// Trois lois pures, témoignées hors lecteur : la capture du verre (une fois
/// pour un dessous immobile, bornée pour un dessous qui bouge), le palier de
/// cadence du lien de lecture, et l'armement du lien d'édition d'un canvas
/// préchargé.
final class StoryCanvasPlaybackEnergyTests: XCTestCase {

    // MARK: - Fabriques

    private static func glassText(id: String = "glass") -> StoryTextObject {
        StoryTextObject(id: id, text: "VERRE", backgroundStyle: .glass(radius: 24))
    }

    private static func plainText(id: String = "plain") -> StoryTextObject {
        StoryTextObject(id: id, text: "TEXTE", backgroundStyle: .solid(hex: "FFFFFF"))
    }

    private static func keyframed(_ text: StoryTextObject) -> StoryTextObject {
        var moving = text
        moving.keyframes = [StoryKeyframe(time: 0, x: 0.2), StoryKeyframe(time: 2, x: 0.8)]
        return moving
    }

    private static func slide(texts: [StoryTextObject],
                              media: [StoryMediaObject]? = nil,
                              opening: StoryTransitionEffect? = nil,
                              closing: StoryTransitionEffect? = nil) -> StorySlide {
        StorySlide(id: "s1",
                   effects: StoryEffects(opening: opening,
                                         closing: closing,
                                         textObjects: texts,
                                         mediaObjects: media))
    }

    private static func key(revision: UInt64 = 1,
                            size: CGSize = CGSize(width: 390, height: 693),
                            visible: Set<String> = ["plain"]) -> StoryGlassCaptureKey {
        StoryGlassCaptureKey(slideId: "s1",
                             contentRevision: revision,
                             renderSize: size,
                             languages: ["fr"],
                             visibleItemIds: visible)
    }

    /// Rejoue `ticks` images à `hz` contre la loi de capture et compte les
    /// captures, comme le ferait `rebuildLayers` à chaque tick de lecture.
    private static func captures(backdropMoves: Bool, hz: Double, ticks: Int) -> Int {
        var previous: StoryGlassCaptureKey?
        var lastCaptureAt: CFTimeInterval = 0
        var count = 0
        let current = key()
        for index in 0..<ticks {
            let now = 1_000 + Double(index) / hz
            guard StoryGlassBackdropPlayback.shouldRecapture(previous: previous,
                                                             current: current,
                                                             backdropMoves: backdropMoves,
                                                             now: now,
                                                             lastCaptureAt: lastCaptureAt) else { continue }
            previous = current
            lastCaptureAt = now
            count += 1
        }
        return count
    }

    // MARK: - Verre : ce qui bouge sous le verre

    func test_backdropMoves_glassTextOverImage_isStill() {
        let slide = Self.slide(texts: [Self.glassText(), Self.plainText()])
        XCTAssertFalse(StoryGlassBackdropPlayback.backdropMoves(slide: slide, backgroundIsVideo: false))
    }

    func test_backdropMoves_videoBackground_moves() {
        let slide = Self.slide(texts: [Self.glassText()])
        XCTAssertTrue(StoryGlassBackdropPlayback.backdropMoves(slide: slide, backgroundIsVideo: true))
    }

    func test_backdropMoves_keyframedTextUnderTheGlass_moves() {
        let slide = Self.slide(texts: [Self.glassText(), Self.keyframed(Self.plainText())])
        XCTAssertTrue(StoryGlassBackdropPlayback.backdropMoves(slide: slide, backgroundIsVideo: false))
    }

    /// Le verre est retiré de sa propre capture : ses keyframes déplacent la
    /// découpe, jamais l'image capturée.
    func test_backdropMoves_keyframesOnTheGlassItself_isStill() {
        let slide = Self.slide(texts: [Self.keyframed(Self.glassText()), Self.plainText()])
        XCTAssertFalse(StoryGlassBackdropPlayback.backdropMoves(slide: slide, backgroundIsVideo: false))
    }

    func test_backdropMoves_foregroundVideo_moves() {
        let clip = StoryMediaObject(id: "clip", kind: .video, aspectRatio: 1)
        let slide = Self.slide(texts: [Self.glassText()], media: [clip])
        XCTAssertTrue(StoryGlassBackdropPlayback.backdropMoves(slide: slide, backgroundIsVideo: false))
    }

    // MARK: - Verre : combien de captures

    /// Le témoin du lot : 30 s de lecture à 120 Hz d'un verre sur fond image —
    /// une capture, pas 3 600.
    func test_stillBackdrop_isCapturedOnceOverThirtySecondsAt120Hz() {
        XCTAssertEqual(Self.captures(backdropMoves: false, hz: 120, ticks: 120 * 30), 1)
    }

    func test_movingBackdrop_isRecapturedAtTenToFifteenHz() {
        let perSecond = Self.captures(backdropMoves: true, hz: 120, ticks: 120)
        XCTAssertGreaterThanOrEqual(perSecond, 10)
        XCTAssertLessThanOrEqual(perSecond, 15)
    }

    func test_neverCaptured_captures() {
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldRecapture(previous: nil,
                                                                 current: Self.key(),
                                                                 backdropMoves: false,
                                                                 now: 5,
                                                                 lastCaptureAt: 0))
    }

    func test_geometryChange_recapturesAStillBackdrop() {
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldRecapture(
            previous: Self.key(),
            current: Self.key(size: CGSize(width: 693, height: 390)),
            backdropMoves: false, now: 5, lastCaptureAt: 4.99))
    }

    func test_slideChange_recapturesAStillBackdrop() {
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldRecapture(
            previous: Self.key(revision: 1),
            current: Self.key(revision: 2),
            backdropMoves: false, now: 5, lastCaptureAt: 4.99))
    }

    /// Une fenêtre d'apparition franchie change ce qui est sous le verre sans
    /// rendre le dessous « mobile » : la clé la suit.
    func test_itemAppearing_recapturesAStillBackdrop() {
        var late = Self.plainText(id: "late")
        late.startTime = 2
        let slide = Self.slide(texts: [Self.glassText(), Self.plainText(), late])
        let before = StoryGlassBackdropPlayback.visibleBackdropItemIds(slide: slide, at: 1)
        let after = StoryGlassBackdropPlayback.visibleBackdropItemIds(slide: slide, at: 2.5)
        XCTAssertEqual(before, ["plain"])
        XCTAssertEqual(after, ["plain", "late"])
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldRecapture(
            previous: Self.key(visible: before),
            current: Self.key(visible: after),
            backdropMoves: false, now: 5, lastCaptureAt: 4.99))
    }

    func test_slideHasGlass() {
        XCTAssertTrue(StoryGlassBackdropPlayback.slideHasGlass(Self.slide(texts: [Self.glassText()])))
        XCTAssertFalse(StoryGlassBackdropPlayback.slideHasGlass(Self.slide(texts: [Self.plainText()])))
    }

    // MARK: - Verre : quelle couche re-nourrir

    func test_shouldFeed_neverFed_feeds() {
        let stamp = StoryGlassFeedStamp(generation: 1, frame: CGRect(x: 10, y: 10, width: 100, height: 40))
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldFeed(lastFed: nil, current: stamp))
    }

    func test_shouldFeed_sameCaptureSameFrame_skips() {
        let stamp = StoryGlassFeedStamp(generation: 1, frame: CGRect(x: 10, y: 10, width: 100, height: 40))
        XCTAssertFalse(StoryGlassBackdropPlayback.shouldFeed(lastFed: stamp, current: stamp))
    }

    func test_shouldFeed_newCapture_feeds() {
        let frame = CGRect(x: 10, y: 10, width: 100, height: 40)
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldFeed(
            lastFed: StoryGlassFeedStamp(generation: 1, frame: frame),
            current: StoryGlassFeedStamp(generation: 2, frame: frame)))
    }

    func test_shouldFeed_movedGlass_feeds() {
        XCTAssertTrue(StoryGlassBackdropPlayback.shouldFeed(
            lastFed: StoryGlassFeedStamp(generation: 1, frame: CGRect(x: 10, y: 10, width: 100, height: 40)),
            current: StoryGlassFeedStamp(generation: 1, frame: CGRect(x: 30, y: 10, width: 100, height: 40))))
    }

    // MARK: - Cadence du lien de lecture

    private static func tier(_ slide: StorySlide,
                             elapsed: Double = 3,
                             total: Double = 6,
                             backgroundIsVideo: Bool = false,
                             audio: Bool = false,
                             relays: Bool = false) -> StoryPlaybackCadenceTier {
        StoryPlaybackCadence.tier(slide: slide,
                                  elapsed: elapsed,
                                  totalDuration: total,
                                  backgroundIsVideo: backgroundIsVideo,
                                  hasSchedulableAudio: audio,
                                  relaysPlaybackClock: relays)
    }

    func test_cadence_slideWithoutTimedContent_isLow() {
        XCTAssertEqual(Self.tier(Self.slide(texts: [Self.glassText(), Self.plainText()])), .low)
    }

    func test_cadence_keyframedSlide_isHigh() {
        XCTAssertEqual(Self.tier(Self.slide(texts: [Self.keyframed(Self.plainText())])), .high)
    }

    func test_cadence_keyframedGlass_isHigh() {
        XCTAssertEqual(Self.tier(Self.slide(texts: [Self.keyframed(Self.glassText())])), .high)
    }

    func test_cadence_videoBackground_isHigh() {
        XCTAssertEqual(Self.tier(Self.slide(texts: [Self.plainText()]), backgroundIsVideo: true), .high)
    }

    func test_cadence_slideAudio_isHigh() {
        XCTAssertEqual(Self.tier(Self.slide(texts: [Self.plainText()]), audio: true), .high)
    }

    /// Une barre de réel ou de galerie avance depuis `onPlaybackTime` : le
    /// palier bas la saccaderait.
    func test_cadence_hostDrawingItsBarFromTheTick_isHigh() {
        XCTAssertEqual(Self.tier(Self.slide(texts: [Self.plainText()]), relays: true), .high)
    }

    func test_cadence_openingWindow_isHighThenLow() {
        let slide = Self.slide(texts: [Self.plainText()], opening: .fade)
        XCTAssertEqual(Self.tier(slide, elapsed: 0.1), .high)
        XCTAssertEqual(Self.tier(slide, elapsed: 3), .low)
    }

    func test_cadence_closingWindow_isHighJustBeforeAndDuring() {
        let slide = Self.slide(texts: [Self.plainText()], closing: .fade)
        XCTAssertEqual(Self.tier(slide, elapsed: 2, total: 6), .low)
        XCTAssertEqual(Self.tier(slide, elapsed: 6 - StoryRenderer.slideTransitionDuration - 0.1, total: 6), .high)
        XCTAssertEqual(Self.tier(slide, elapsed: 5.5, total: 6), .high)
    }

    func test_lowRange_staysBelowSixtyHertz_highRangeKeepsProMotion() {
        let low = StoryPlaybackCadence.frameRateRange(for: .low, mediaTier: .high)
        let high = StoryPlaybackCadence.frameRateRange(for: .high, mediaTier: .high)
        XCTAssertLessThanOrEqual(low.maximum, 30)
        XCTAssertGreaterThanOrEqual(low.minimum, 10)
        XCTAssertEqual(high.maximum, 120)
        XCTAssertEqual(high.minimum, 60)
    }

    // MARK: - Le tier média de l'appareil (#11281)

    func test_highCadence_followsTheDeviceMediaTier() {
        let low = StoryPlaybackCadence.frameRateRange(for: .high, mediaTier: .low)
        let mid = StoryPlaybackCadence.frameRateRange(for: .high, mediaTier: .mid)
        let high = StoryPlaybackCadence.frameRateRange(for: .high, mediaTier: .high)
        let pro = StoryPlaybackCadence.frameRateRange(for: .high, mediaTier: .pro)
        XCTAssertEqual([low.minimum, low.maximum, low.preferred], [30, 60, 30])
        XCTAssertEqual([mid.minimum, mid.maximum, mid.preferred], [30, 60, 60])
        XCTAssertEqual([high.minimum, high.maximum, high.preferred], [60, 120, 60])
        XCTAssertEqual([pro.minimum, pro.maximum, pro.preferred], [60, 120, 60])
    }

    func test_lowCadence_isTheSameOnEveryTier() {
        let reference = StoryPlaybackCadence.frameRateRange(for: .low, mediaTier: .high)
        for tier in DeviceMediaTier.allCases {
            let range = StoryPlaybackCadence.frameRateRange(for: .low, mediaTier: tier)
            XCTAssertEqual([range.minimum, range.maximum, range.preferred],
                           [reference.minimum, reference.maximum, reference.preferred], "\(tier)")
        }
    }

    func test_highCadence_neverExceedsWhatAStrongerTierGets() {
        let ranges = DeviceMediaTier.allCases.map {
            StoryPlaybackCadence.frameRateRange(for: .high, mediaTier: $0)
        }
        for (weaker, stronger) in zip(ranges, ranges.dropFirst()) {
            XCTAssertLessThanOrEqual(weaker.maximum, stronger.maximum)
            XCTAssertLessThanOrEqual(weaker.preferred ?? 0, stronger.preferred ?? 0)
        }
    }

    // MARK: - Lien d'édition d'un canvas préchargé

    func test_editClockArming_prefetchedCanvas_doesNotArm() {
        XCTAssertFalse(EditClockArming.shouldArm(isEditing: true, isInteractive: false))
    }

    func test_editClockArming_composerCanvas_arms() {
        XCTAssertTrue(EditClockArming.shouldArm(isEditing: true, isInteractive: true))
    }

    func test_editClockArming_readerCanvas_doesNotArm() {
        XCTAssertFalse(EditClockArming.shouldArm(isEditing: false, isInteractive: true))
    }
}
