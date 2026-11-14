import XCTest
@testable import Meeshy

/// Loi 17.2 · 17.10 (#18207) — la pilule morphe par une transformation seule, et « Réduire les
/// animations » rend un fondu court, jamais une bascule sèche. Mêmes vecteurs qu'Android
/// (`CallPillMotionTest`, #18411) et que le web (`morphKeyframes`).
final class CallPillMotionTests: XCTestCase {

    private let start = Date(timeIntervalSinceReferenceDate: 1_000)

    // MARK: - La loi, miroir d'Android

    func test_unfold_lasts250ms_reduced200ms() {
        XCTAssertEqual(CallPillMotion.duration(reduceMotion: false), 0.25)
        XCTAssertEqual(CallPillMotion.duration(reduceMotion: true), 0.2)
    }

    func test_loi17_2_growingGlass_startsFromItsOldSizeSeenAsAScaleOfTheNewOne() {
        let morph = CallPillMotion.morph(from: CGSize(width: 200, height: 100), to: CGSize(width: 400, height: 300), reduceMotion: false)
        XCTAssertEqual(morph, CallGlassMorph(fromScaleX: 0.5, fromScaleY: 100.0 / 300.0, crossFades: false))
    }

    func test_loi17_2_closingGlass_startsLargerAndTightens_theSamePathBackwards() {
        let morph = CallPillMotion.morph(from: CGSize(width: 400, height: 300), to: CGSize(width: 200, height: 100), reduceMotion: false)
        XCTAssertEqual(morph, CallGlassMorph(fromScaleX: 2, fromScaleY: 3, crossFades: false))
    }

    func test_loi17_2_aRoundingOfTheMeasure_isNotAMovement() {
        let from = CGSize(width: 200, height: 100)
        let to = CGSize(width: 200.2, height: 100.3)
        XCTAssertNil(CallPillMotion.morph(from: from, to: to, reduceMotion: false))
        XCTAssertNil(CallPillMotion.morph(from: from, to: to, reduceMotion: true))
    }

    func test_loi17_2_anUnmeasuredGlass_neverMorphs() {
        XCTAssertNil(CallPillMotion.morph(from: .zero, to: CGSize(width: 400, height: 300), reduceMotion: false))
        XCTAssertNil(CallPillMotion.morph(from: CGSize(width: 400, height: 300), to: .zero, reduceMotion: false))
        XCTAssertNil(CallPillMotion.morph(from: CGSize(width: 400, height: 300), to: .zero, reduceMotion: true))
    }

    func test_loi17_2_frame_travelsFromTheOldScaleToTheNewSize_anchored_andStaysOpaque() {
        let morph = CallGlassMorph(fromScaleX: 0.5, fromScaleY: 0.25, crossFades: false)
        XCTAssertEqual(morph.frame(progress: 0), CallGlassMorphFrame(scaleX: 0.5, scaleY: 0.25, alpha: 1, ghostScaleX: 0.5, ghostScaleY: 0.25, ghostAlpha: 0))
        XCTAssertEqual(morph.frame(progress: 0.5).scaleX, 0.75, accuracy: 0.0001)
        XCTAssertEqual(morph.frame(progress: 0.5).scaleY, 0.625, accuracy: 0.0001)
        XCTAssertEqual(morph.frame(progress: 1), .rest)
        XCTAssertEqual(morph.frame(progress: 1.4), .rest)
        XCTAssertEqual(morph.frame(progress: -0.3), morph.frame(progress: 0))
    }

    func test_loi17_10_underReduceMotion_theGlassNeverScales_theOldShapeFadesIntoTheNewOne() throws {
        let morph = try XCTUnwrap(CallPillMotion.morph(from: CGSize(width: 200, height: 100), to: CGSize(width: 400, height: 300), reduceMotion: true))
        XCTAssertTrue(morph.crossFades)
        let first = morph.frame(progress: 0)
        let middle = morph.frame(progress: 0.5)
        XCTAssertEqual(first.scaleX, 1)
        XCTAssertEqual(first.scaleY, 1)
        XCTAssertEqual(first.alpha, 0)
        XCTAssertEqual(first.ghostAlpha, 1)
        XCTAssertEqual(middle.scaleX, 1)
        XCTAssertEqual(middle.ghostScaleX, first.ghostScaleX, "la forme quittée ne bouge pas : elle s'efface")
        XCTAssertEqual(middle.alpha, 0.5, accuracy: 0.0001)
        XCTAssertEqual(middle.ghostAlpha, 0.5, accuracy: 0.0001)
        XCTAssertEqual(morph.frame(progress: 1), .rest)
    }

    func test_loi17_11_anInterruptedMorph_restartsFromTheSizeSeenAtThatInstant() {
        let frame = CallGlassMorph(fromScaleX: 0.5, fromScaleY: 0.5, crossFades: false).frame(progress: 0.5)
        XCTAssertEqual(frame.seen(CGSize(width: 400, height: 200)), CGSize(width: 300, height: 150))
        XCTAssertEqual(CallGlassMorphFrame.rest.seen(CGSize(width: 400, height: 200)), CGSize(width: 400, height: 200))
    }

    func test_loi17_2_whatTheLayoutMovedInsideTheGlass_startsFromWhereItWasSeen() {
        XCTAssertEqual(CallPillMotion.followShift(from: CGPoint(x: -40, y: -96), to: CGPoint(x: -60, y: -112), reduceMotion: false), CGSize(width: 20, height: 16))
        XCTAssertNil(CallPillMotion.followShift(from: CGPoint(x: -40, y: -96), to: CGPoint(x: -40.2, y: -96.3), reduceMotion: false))
    }

    func test_loi17_10_underReduceMotion_nothingSlidesInsideTheGlass() {
        XCTAssertNil(CallPillMotion.followShift(from: CGPoint(x: -40, y: -96), to: CGPoint(x: -60, y: -112), reduceMotion: true))
    }

    /// La courbe d'Android (`FastOutSlowInEasing`, `cubic-bezier(0.4, 0, 0.2, 1)`).
    func test_curve_isFastOutSlowIn() {
        XCTAssertEqual(CallPillMotion.eased(0), 0)
        XCTAssertEqual(CallPillMotion.eased(1), 1)
        XCTAssertEqual(CallPillMotion.eased(-1), 0)
        XCTAssertEqual(CallPillMotion.eased(2), 1)
        XCTAssertEqual(CallPillMotion.eased(0.5), 0.7756, accuracy: 0.001)
        XCTAssertEqual(CallPillMotion.eased(0.75), 0.9594, accuracy: 0.001)
        XCTAssertLessThan(CallPillMotion.eased(0.25), CallPillMotion.eased(0.5))
    }

    // MARK: - L'horloge du verre

    func test_clock_theFirstMeasure_playsNothing() {
        let clock = CallGlassMorphClock().measured(CGSize(width: 390, height: 72), at: start, reduceMotion: false)
        XCTAssertFalse(clock.isRunning)
        XCTAssertEqual(clock.frame(at: start), .rest)
    }

    func test_clock_aNewSize_startsFromTheOldOne_andJoinsTheNewOneWithinTheDuration() {
        let resting = CallGlassMorphClock().measured(CGSize(width: 400, height: 100), at: start, reduceMotion: false)
        let unfolding = resting.measured(CGSize(width: 400, height: 400), at: start, reduceMotion: false)
        XCTAssertTrue(unfolding.isRunning)
        XCTAssertEqual(unfolding.frame(at: start).scaleY, 0.25, accuracy: 0.0001)
        XCTAssertEqual(unfolding.frame(at: start).scaleX, 1, accuracy: 0.0001)
        XCTAssertEqual(unfolding.frame(at: start.addingTimeInterval(0.25)), .rest)
        XCTAssertFalse(unfolding.settled(at: start.addingTimeInterval(0.3)).isRunning)
        XCTAssertTrue(unfolding.settled(at: start.addingTimeInterval(0.1)).isRunning, "un morphisme en cours ne se pose pas avant sa fin")
    }

    func test_clock_theFirstFrameIsRight_beforeTheNewSizeIsRecorded() {
        let resting = CallGlassMorphClock().measured(CGSize(width: 400, height: 100), at: start, reduceMotion: false)
        let pending = resting.frame(laidOut: CGSize(width: 400, height: 400), at: start, reduceMotion: false)
        XCTAssertEqual(pending.scaleY, 0.25, accuracy: 0.0001, "la mise en page a changé : le verre montre encore son ancienne taille")
        XCTAssertEqual(resting.frame(laidOut: CGSize(width: 400, height: 100), at: start, reduceMotion: false), .rest)
    }

    func test_clock_interrupted_restartsFromTheSizeSeen_neverFromTheLaidOutOne() {
        let resting = CallGlassMorphClock().measured(CGSize(width: 400, height: 100), at: start, reduceMotion: false)
        let unfolding = resting.measured(CGSize(width: 400, height: 400), at: start, reduceMotion: false)
        let midway = start.addingTimeInterval(0.125)
        let seenHeight = 400 * unfolding.frame(at: midway).scaleY
        let folding = unfolding.measured(CGSize(width: 400, height: 100), at: midway, reduceMotion: false)
        XCTAssertEqual(100 * folding.frame(at: midway).scaleY, seenHeight, accuracy: 0.001, "aucun saut : il repart de ce qu'on voyait")
    }

    func test_clock_underReduceMotion_crossFades_in200ms() {
        let resting = CallGlassMorphClock().measured(CGSize(width: 400, height: 100), at: start, reduceMotion: true)
        let unfolding = resting.measured(CGSize(width: 400, height: 400), at: start, reduceMotion: true)
        let first = unfolding.frame(at: start)
        XCTAssertEqual(first.scaleY, 1)
        XCTAssertEqual(first.alpha, 0)
        XCTAssertEqual(first.ghostAlpha, 1)
        XCTAssertEqual(unfolding.frame(at: start.addingTimeInterval(0.2)), .rest)
    }

    // MARK: - Ce qui suit le verre

    func test_follow_theFirstPlace_playsNothing() {
        let clock = CallGlassFollowClock().placed(CGPoint(x: -60, y: -112), at: start, reduceMotion: false)
        XCTAssertFalse(clock.isRunning)
        XCTAssertEqual(clock.shift(at: start), .zero)
        XCTAssertEqual(clock.opacity(at: start), 1)
    }

    func test_follow_aNewPlace_startsFromTheOldOne_byATranslation() {
        let placed = CallGlassFollowClock().placed(CGPoint(x: -40, y: -96), at: start, reduceMotion: false)
        let moved = placed.placed(CGPoint(x: -60, y: -112), at: start, reduceMotion: false)
        XCTAssertEqual(moved.shift(at: start), CGSize(width: 20, height: 16))
        XCTAssertEqual(moved.opacity(at: start), 1, "un glissement ne s'efface pas")
        XCTAssertEqual(moved.shift(at: start.addingTimeInterval(0.25)), .zero)
        XCTAssertFalse(moved.settled(at: start.addingTimeInterval(0.3)).isRunning)
    }

    func test_follow_fromAKnownPlace_isWhatTheTileUses() {
        let moved = CallGlassFollowClock().following(from: CGPoint(x: 100, y: 200), to: CGPoint(x: 100, y: 260), at: start, reduceMotion: false)
        XCTAssertEqual(moved.shift(at: start), CGSize(width: 0, height: -60))
        let again = moved.following(from: CGPoint(x: 100, y: 260), to: CGPoint(x: 100, y: 200), at: start.addingTimeInterval(0.1), reduceMotion: false)
        XCTAssertEqual(again.shift(at: start.addingTimeInterval(0.1)).height, 60 + moved.shift(at: start.addingTimeInterval(0.1)).height, accuracy: 0.001,
                       "interrompu, il repart de là où on le voyait")
    }

    func test_follow_underReduceMotion_nothingSlides_itAppearsInPlaceByAShortFade() {
        let placed = CallGlassFollowClock().placed(CGPoint(x: -40, y: -96), at: start, reduceMotion: true)
        let moved = placed.placed(CGPoint(x: -60, y: -112), at: start, reduceMotion: true)
        XCTAssertEqual(moved.shift(at: start), .zero)
        XCTAssertEqual(moved.opacity(at: start), 0)
        XCTAssertEqual(moved.opacity(at: start.addingTimeInterval(0.1)), 0.5, accuracy: 0.0001)
        XCTAssertEqual(moved.opacity(at: start.addingTimeInterval(0.2)), 1)
        XCTAssertEqual(placed.placed(CGPoint(x: -40.2, y: -96.3), at: start, reduceMotion: true), placed, "un arrondi ne fait rien clignoter")
    }

    func test_fade_isAShortFade_neverASnap() {
        let fade = CallMotionFade().started(at: start)
        XCTAssertTrue(fade.isRunning)
        XCTAssertEqual(fade.opacity(at: start), 0)
        XCTAssertEqual(fade.opacity(at: start.addingTimeInterval(0.1)), 0.5, accuracy: 0.0001)
        XCTAssertEqual(fade.opacity(at: start.addingTimeInterval(0.2)), 1)
        XCTAssertEqual(CallMotionFade().opacity(at: start), 1)
        XCTAssertFalse(fade.settled(at: start.addingTimeInterval(0.25)).isRunning)
    }

    // MARK: - Les vues

    private func unit(_ name: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/\(name)"))
    }

    private func block(_ start: String, until end: String, in source: String) throws -> String {
        let head = try XCTUnwrap(source.range(of: start), "introuvable : \(start)")
        let tail = try XCTUnwrap(source.range(of: end, range: head.upperBound ..< source.endIndex), "introuvable : \(end)")
        return String(source[head.lowerBound ..< tail.lowerBound])
    }

    /// Loi 17.2 — la mise en page de la pilule prend sa forme d'un coup ; seul le verre, à lui,
    /// morphe par une échelle ; les rangées entrent et sortent par leur propre transition.
    func test_pill_layoutTakesItsShapeAtOnce_andOnlyTheGlassMorphs() throws {
        let source = try unit("CallView+Pill.swift")
        let pill = try block("var callControlsPill: some View {", until: "var pillHairline: some View", in: source)
        XCTAssertFalse(pill.contains(".animation(disclosureAnimation, value: layer)"), "la largeur et la hauteur ne s'animent plus à la mise en page")
        XCTAssertFalse(pill.contains(".animation(disclosureAnimation, value: text)"))
        XCTAssertTrue(pill.contains(".animation(nil, value: layer)"))
        XCTAssertTrue(pill.contains(".animation(nil, value: text)"))
        XCTAssertTrue(pill.contains(".modifier(CallMorphingGlass(shape: Self.pillShape, reduceMotion: reduceMotion)"), "le verre est une couche à lui, qui morphe")
        XCTAssertFalse(pill.contains(".clipShape(Self.pillShape)"), "la découpe suit le verre qui morphe, pas la mise en page")
        let glass = try XCTUnwrap(pill.range(of: ".callControlsGlass(in:"))
        let morph = try XCTUnwrap(pill.range(of: "CallMorphingGlass("))
        XCTAssertLessThan(morph.lowerBound, glass.lowerBound, "le verre de la pilule est celui que dessine le morphisme")
        XCTAssertTrue(pill.contains(".modifier(CallGlassSpace())"), "ce qui suit le verre se mesure depuis son bord du bas")
        XCTAssertTrue(pill.contains(".transition(AnyTransition.opacity.animation(disclosureAnimation))"), "les sous-titres entrent en fondu, sans attendre la mise en page")
        let transitions = try block("private var unfoldTransition: AnyTransition {", until: "/// UN bloc de verre", in: source)
        XCTAssertTrue(transitions.contains(".animation(disclosureAnimation)"), "la transition porte son mouvement : la mise en page ne s'anime plus")
    }

    /// Loi 17.2 — les boutons de la rangée de base et les sous-titres repartent de là où on les
    /// voyait par une translation quand la pilule change de forme.
    func test_pill_whatTheLayoutMoves_followsTheGlass_byATranslation() throws {
        let source = try unit("CallView+Pill.swift")
        let base = try block("private var baseRow: some View {", until: "private func moreButton(", in: source)
        XCTAssertEqual(base.components(separatedBy: ".modifier(CallGlassFollow(reduceMotion: reduceMotion))").count - 1, 4, "(…) · Micro · Sortie · Fin")
        let pill = try block("var callControlsPill: some View {", until: "var pillHairline: some View", in: source)
        XCTAssertTrue(pill.contains("captionsBand(hasOwnGlass: false)\n                        .modifier(CallGlassFollow(reduceMotion: reduceMotion))"))
        let label = try block("struct CallPillButtonLabel: View {", until: "struct CallPillButton: View {", in: try unit("CallDeviceControls.swift"))
        XCTAssertTrue(label.contains(".transition(AnyTransition.opacity.animation(.easeInOut(duration: CallPillMotion.reducedDuration)))"), "la légende d'un bouton se fond sur place")
    }

    func test_glassViews_animateOnlyTransformAndOpacity() throws {
        let views = try unit("CallGlassMorphViews.swift")
        XCTAssertTrue(views.contains("struct CallMorphingGlass<S: Shape, Glass: View>: ViewModifier {"))
        XCTAssertTrue(views.contains("struct CallGlassFollow: ViewModifier {"))
        XCTAssertTrue(views.contains(".scaleEffect(x: frame.scaleX, y: frame.scaleY, anchor: .bottom)"), "le verre morphe par une échelle ancrée à son bord du bas")
        XCTAssertTrue(views.contains(".offset(x: shift.width, y: shift.height)"), "ce qui suit glisse par une translation")
        XCTAssertTrue(views.contains(".transaction { $0.animation = nil }"), "la taille posée du verre ne s'anime jamais")
        XCTAssertTrue(views.contains("TimelineView(CallGlassMotionTimer.schedule(running: clock.isRunning))"), "rien ne tourne au repos")
        XCTAssertFalse(views.contains(".frame(width: shown"), "aucune taille animée")
        XCTAssertFalse(views.contains("reduceMotion ? nil"))
    }

    /// Loi 17.2 — ma vignette suit la pile des bandeaux et la forme de la fenêtre par une translation,
    /// sa place de mise en page se pose d'un coup. Loi 17.10 — Réduire les animations : un fondu court.
    func test_selfTile_followsItsPlaceByATranslation_andFadesUnderReduceMotion() throws {
        let glass = try unit("CallControlGlass.swift")
        XCTAssertFalse(glass.contains("reduceMotion ? nil"), "une bascule sèche n'est pas un fondu court")
        let placement = try block("struct CallSelfTilePlacement: ViewModifier {", until: "\n}\n", in: glass)
        XCTAssertTrue(placement.contains(".position(position)"))
        XCTAssertTrue(placement.contains(".animation(nil, value: clearance)"), "la place de mise en page ne s'anime plus")
        XCTAssertTrue(placement.contains(".animation(nil, value: isLandscape)"))
        XCTAssertTrue(placement.contains("clock.following(from: old.position, to: new.position, at: Date(), reduceMotion: reduceMotion)"))
        XCTAssertTrue(placement.contains(".offset(x: shift.width, y: shift.height)"))
        XCTAssertTrue(placement.contains(".opacity(clock.opacity(at: context.date))"))
        let stow = try block("struct CallSelfTileStow: ViewModifier {", until: "\n}\n", in: glass)
        XCTAssertTrue(stow.contains(".scaleEffect(factor, anchor: anchor)"))
        XCTAssertTrue(stow.contains(".animation(CallChromeStow.transform(reduceMotion: reduceMotion), value: isChromeVisible)"))
        XCTAssertTrue(stow.contains(".opacity(fade.opacity(at: context.date))"), "Réduire les animations : elle prend sa taille par un fondu court")
    }

    /// Loi 17.10 — partout ailleurs, « Réduire les animations » donne un fondu court, sans déplacement.
    func test_reduceMotion_isAShortFade_neverASnap_norASlide() throws {
        let feedback = try unit("CallFeedbackCard.swift")
        XCTAssertFalse(feedback.contains("reduceMotion ? nil"))
        XCTAssertTrue(feedback.contains(".transition(AnyTransition.opacity.animation(.easeInOut(duration: CallPillMotion.reducedDuration)))"), "les motifs entrent en fondu")
        let liveFrame = try unit("CallView+LiveFrame.swift")
        XCTAssertTrue(liveFrame.contains(".transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))"), "la carte du cadre ne glisse plus sous réduction")
        let cameraRail = try unit("CallView+CameraRail.swift")
        XCTAssertFalse(cameraRail.contains("reduceMotion ? nil"))
        XCTAssertTrue(cameraRail.contains("meeshyWithAnimation(.spring(response: 0.3, dampingFraction: 0.85), reduced: MeeshyMotion.reducedFade, reduceMotion: reduceMotion)"), "le fondu court réduit traverse la racine")
    }
}
