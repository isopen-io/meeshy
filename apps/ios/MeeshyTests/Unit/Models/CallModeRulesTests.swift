import XCTest
@testable import Meeshy

/// #8578 — le carrousel unique d'un mode : l'élément choisi au centre, agrandi,
/// ses voisins plus petits et atténués ; et le mode Effets, qui n'active qu'un
/// réglage à la fois.
@MainActor
final class CallModeRulesTests: XCTestCase {

    // MARK: - Le carrousel

    func test_scale_selectedIsFullSize_neighboursAreSmaller() {
        XCTAssertEqual(CallModeCarouselRule.scale(isSelected: true), 1)
        XCTAssertLessThan(CallModeCarouselRule.scale(isSelected: false), 1)
    }

    func test_opacity_neighboursAreDimmed() {
        XCTAssertEqual(CallModeCarouselRule.opacity(isSelected: true), 1)
        XCTAssertLessThan(CallModeCarouselRule.opacity(isSelected: false), 1)
    }

    func test_sideInset_centresTheFirstAndLastItems() {
        XCTAssertEqual(CallModeCarouselRule.sideInset(containerWidth: 390, itemWidth: 70), 160)
    }

    func test_sideInset_narrowerThanAnItem_isZero() {
        XCTAssertEqual(CallModeCarouselRule.sideInset(containerWidth: 40, itemWidth: 70), 0)
    }

    func test_stepping_forward_selectsTheNextItem() {
        XCTAssertEqual(CallModeCarouselRule.stepping("b", in: ["a", "b", "c"], by: 1), "c")
    }

    func test_stepping_pastTheEnds_staysOnTheLastOrFirst() {
        XCTAssertEqual(CallModeCarouselRule.stepping("c", in: ["a", "b", "c"], by: 1), "c")
        XCTAssertEqual(CallModeCarouselRule.stepping("a", in: ["a", "b", "c"], by: -1), "a")
    }

    func test_stepping_unknownSelection_fallsBackToTheFirst() {
        XCTAssertEqual(CallModeCarouselRule.stepping("z", in: ["a", "b"], by: 1), "a")
    }

    // MARK: - Suivre le doigt (#8736)

    func test_commits_whileInteracting_isFalse() {
        XCTAssertFalse(CallModeCarouselRule.commits(isInteracting: true))
    }

    func test_commits_whenIdle_isTrue() {
        XCTAssertTrue(CallModeCarouselRule.commits(isInteracting: false))
    }

    func test_mayFollowSelection_neverUnderTheFinger() {
        XCTAssertFalse(CallModeCarouselRule.mayFollowSelection(isInteracting: true))
        XCTAssertTrue(CallModeCarouselRule.mayFollowSelection(isInteracting: false))
    }

    func test_settled_withoutATarget_isSettled() {
        XCTAssertTrue(CallModeCarouselRule.settled(nearest: "b", target: nil as String?))
        XCTAssertTrue(CallModeCarouselRule.settled(nearest: nil as String?, target: nil))
    }

    func test_settled_onlyWhenTheTargetReachesTheCentre() {
        XCTAssertFalse(CallModeCarouselRule.settled(nearest: "c", target: "e"))
        XCTAssertFalse(CallModeCarouselRule.settled(nearest: nil, target: "e"))
        XCTAssertTrue(CallModeCarouselRule.settled(nearest: "e", target: "e"))
    }

    func test_trackHeight_neverBelowAThumbsReach() {
        XCTAssertEqual(CallModeCarouselRule.trackHeight(itemHeight: 60), 88)
        XCTAssertEqual(CallModeCarouselRule.trackHeight(itemHeight: 85), 88)
        XCTAssertEqual(CallModeCarouselRule.trackHeight(itemHeight: 120), 120)
        XCTAssertGreaterThanOrEqual(CallModeCarouselRule.trackHeight(itemHeight: 0), 88)
    }

    func test_verticalMargin_centresTheItemsInTheBand() {
        XCTAssertEqual(CallModeCarouselRule.verticalMargin(itemHeight: 60), 14)
        XCTAssertEqual(CallModeCarouselRule.verticalMargin(itemHeight: 120), 0)
    }

    func test_nearestIndex_roundsToTheClosestItem() {
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 0, itemWidth: 60, spacing: 14, count: 6), 0)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 36, itemWidth: 60, spacing: 14, count: 6), 0)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 38, itemWidth: 60, spacing: 14, count: 6), 1)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 148, itemWidth: 60, spacing: 14, count: 6), 2)
    }

    func test_nearestIndex_bouncePastTheEnds_staysOnTheFirstOrLast() {
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: -80, itemWidth: 60, spacing: 14, count: 6), 0)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 10_000, itemWidth: 60, spacing: 14, count: 6), 5)
    }

    func test_nearestIndex_emptyTrack_isNil() {
        XCTAssertNil(CallModeCarouselRule.nearestIndex(offset: 0, itemWidth: 60, spacing: 14, count: 0))
        XCTAssertNil(CallModeCarouselRule.nearestIndex(offset: 0, itemWidth: 0, spacing: 0, count: 3))
    }

    // MARK: - Parcourir à la voix (#18192)

    private let looks = ["a", "b", "c", "d"]

    func test_browse_atRest_announcesTheAppliedEffect_andActivationOnlyConfirms() {
        let browse = CallModeCarouselBrowse<String>()
        XCTAssertFalse(browse.isBrowsing)
        XCTAssertEqual(browse.position(applied: "b"), "b")
        XCTAssertEqual(browse.activation(applied: "b"), .confirm, "Rien de parcouru : l'activation ne réapplique rien, elle rend le menu de base")
    }

    func test_browse_adjusting_movesTheAnnouncedPosition_withoutApplyingAnything() {
        var browse = CallModeCarouselBrowse<String>()
        XCTAssertTrue(browse.step(by: 1, in: looks, applied: "a"))
        XCTAssertTrue(browse.step(by: 1, in: looks, applied: "a"))
        XCTAssertTrue(browse.isBrowsing)
        XCTAssertEqual(browse.position(applied: "a"), "c", "Chaque balayage avance d'un look depuis la position PARCOURUE")
        XCTAssertEqual(browse.activation(applied: "a"), .apply("c"), "Seule l'activation applique, et elle applique ce qui est annoncé")
    }

    func test_browse_atTheEdge_doesNotMove() {
        var browse = CallModeCarouselBrowse<String>()
        XCTAssertFalse(browse.step(by: -1, in: looks, applied: "a"))
        XCTAssertFalse(browse.step(by: 1, in: looks, applied: "d"))
        XCTAssertEqual(browse.position(applied: "d"), "d")
    }

    func test_browse_backOnTheAppliedLook_activationOnlyConfirms() {
        var browse = CallModeCarouselBrowse<String>()
        browse.step(by: 1, in: looks, applied: "b")
        browse.step(by: -1, in: looks, applied: "b")
        XCTAssertEqual(browse.position(applied: "b"), "b")
        XCTAssertEqual(browse.activation(applied: "b"), .confirm)
    }

    func test_browse_leaving_forgetsThePosition() {
        var browse = CallModeCarouselBrowse<String>()
        browse.step(by: 2, in: looks, applied: "a")
        browse.leave()
        XCTAssertFalse(browse.isBrowsing, "Quitter l'élément, ou un effet appliqué ailleurs, rend l'annonce à l'effet appliqué")
        XCTAssertEqual(browse.position(applied: "a"), "a")
    }

    func test_ordinal_isOneBased_andNilOutsideTheList() {
        XCTAssertEqual(CallModeCarouselRule.ordinal(of: "c", in: looks), CallModeCarouselOrdinal(rank: 3, count: 4))
        XCTAssertEqual(CallModeCarouselRule.ordinal(of: "a", in: looks), CallModeCarouselOrdinal(rank: 1, count: 4))
        XCTAssertNil(CallModeCarouselRule.ordinal(of: "z", in: looks))
    }

    // MARK: - Les déclinaisons se parcourent aussi (#18192)

    private func declinations(_ item: String) -> [String] {
        item == "b" ? ["b", "b.1", "b.2"] : []
    }

    private func posedB1(_ item: String) -> String {
        item == "b" ? "b.1" : item
    }

    func test_browse_variant_startsFromThePosedDeclination_andIsNotApplied() {
        var browse = CallModeCarouselBrowse<String>()
        XCTAssertTrue(browse.stepVariant(by: 1, applied: "b", variants: declinations, current: posedB1))
        XCTAssertEqual(browse.variant, "b.2", "La déclinaison suivante part de celle qui est posée")
        XCTAssertTrue(browse.isBrowsing)
        XCTAssertEqual(browse.activation(applied: "b", current: posedB1), .apply("b.2"))
    }

    func test_browse_variant_backToThePlainFrame_appliesIt_whenADeclinationIsPosed() {
        var browse = CallModeCarouselBrowse<String>()
        XCTAssertTrue(browse.stepVariant(by: -1, applied: "b", variants: declinations, current: posedB1))
        XCTAssertEqual(browse.variant, "b")
        XCTAssertEqual(browse.activation(applied: "b", current: posedB1), .apply("b"), "Le cadre nu n'est pas la déclinaison posée : il s'applique")
    }

    func test_browse_variant_onThePosedDeclination_onlyConfirms() {
        var browse = CallModeCarouselBrowse<String>()
        browse.stepVariant(by: 1, applied: "b", variants: declinations, current: posedB1)
        browse.stepVariant(by: -1, applied: "b", variants: declinations, current: posedB1)
        XCTAssertEqual(browse.activation(applied: "b", current: posedB1), .confirm)
    }

    func test_browse_variant_followsTheBrowsedFrame_notTheAppliedOne() {
        var browse = CallModeCarouselBrowse<String>()
        browse.step(by: 1, in: looks, applied: "a")
        XCTAssertTrue(browse.stepVariant(by: 1, applied: "a", variants: declinations, current: { $0 }))
        XCTAssertEqual(browse.variant, "b.1", "Les déclinaisons sont celles du cadre annoncé")
        XCTAssertTrue(browse.stepVariant(by: 5, applied: "a", variants: declinations, current: { $0 }))
        XCTAssertEqual(browse.variant, "b.2", "Sans boucler : la dernière déclinaison arrête le pas")
        XCTAssertFalse(browse.stepVariant(by: 1, applied: "a", variants: declinations, current: { $0 }))
    }

    func test_browse_variant_withoutDeclinations_doesNotMove() {
        var browse = CallModeCarouselBrowse<String>()
        XCTAssertFalse(browse.stepVariant(by: 1, applied: "a", variants: declinations, current: { $0 }))
        XCTAssertNil(browse.variant)
        XCTAssertFalse(browse.isBrowsing)
    }

    func test_browse_movingToAnotherFrame_forgetsTheVariant() {
        var browse = CallModeCarouselBrowse<String>()
        browse.stepVariant(by: 1, applied: "b", variants: declinations, current: { $0 })
        browse.step(by: 1, in: looks, applied: "b")
        XCTAssertNil(browse.variant)
        XCTAssertEqual(browse.activation(applied: "b"), .apply("c"))
    }

    func test_motion_swipe_choosesOnlyWhereItRests() {
        var motion = CallModeCarouselMotion<String>()
        motion.moved(to: "b", infersInteraction: true)
        motion.moved(to: "c", infersInteraction: true)
        XCTAssertTrue(motion.isInteracting, "Sans phase lisible, un centre qui bouge sans cible, c'est le doigt")
        motion.userScrolling(false)
        XCTAssertEqual(motion.rests(on: "c", selection: "a"), "c")
    }

    func test_motion_underTheFinger_selectionIsNotFollowed() {
        var motion = CallModeCarouselMotion<String>()
        motion.userScrolling(true)
        XCTAssertFalse(motion.follows("e", from: "b"), "Un défilement programmé ne se bat jamais contre le doigt")
        XCTAssertNil(motion.settling)
    }

    func test_motion_restWhileInteracting_commitsNothing() {
        var motion = CallModeCarouselMotion<String>()
        motion.userScrolling(true)
        XCTAssertNil(motion.rests(on: "c", selection: "a"))
    }

    func test_motion_tapOnAFarItem_itemsCrossedInTransitAreNeverChosen() {
        var motion = CallModeCarouselMotion<String>()
        motion.tapped()
        XCTAssertTrue(motion.follows("e", from: "a"))
        motion.moved(to: "b", infersInteraction: true)
        motion.moved(to: "c", infersInteraction: true)
        XCTAssertFalse(motion.isInteracting, "Le trajet programmé n'est pas un doigt")
        XCTAssertEqual(motion.settling, "e")
        motion.moved(to: "e", infersInteraction: true)
        XCTAssertNil(motion.settling)
        XCTAssertNil(motion.rests(on: "e", selection: "e"))
    }

    func test_motion_restMidTransit_choosesNobody_andTheTargetIsFollowedAgain() {
        var motion = CallModeCarouselMotion<String>()
        XCTAssertTrue(motion.follows("e", from: "a"))
        motion.moved(to: "c", infersInteraction: true)
        XCTAssertNil(motion.rests(on: "c", selection: "e"))
        XCTAssertTrue(motion.follows("e", from: "c"))
    }

    func test_motion_fingerTakesOverATransit_choosesWhereItRests() {
        var motion = CallModeCarouselMotion<String>()
        XCTAssertTrue(motion.follows("e", from: "a"))
        motion.userScrolling(true)
        XCTAssertNil(motion.settling)
        motion.userScrolling(false)
        XCTAssertEqual(motion.rests(on: "c", selection: "e"), "c")
    }

    func test_motion_tap_endsTheInferredInteraction_soTheTappedItemIsCentred() {
        var motion = CallModeCarouselMotion<String>()
        motion.moved(to: "b", infersInteraction: true)
        motion.tapped()
        XCTAssertTrue(motion.follows("d", from: "b"))
    }

    func test_motion_alreadyCentred_followsNothing() {
        var motion = CallModeCarouselMotion<String>()
        XCTAssertFalse(motion.follows("b", from: "b"))
        XCTAssertNil(motion.rests(on: "b", selection: "b"))
    }

    // MARK: - Le mode Effets

    func test_categories_faceThenColor() {
        XCTAssertEqual(CallEffectsCategory.allCases, [.face, .color])
    }

    func test_faces_followTheSharedDesignOrder() {
        XCTAssertEqual(CallEffectsModeRule.faces, [.none, .smoothing, .toad, .angel, .demon, .volcano])
    }

    func test_colors_naturalFirst() {
        XCTAssertEqual(CallEffectsModeRule.colors, [.natural, .golden, .film, .softNight, .bright, .velvet, .sky, .monochrome])
    }

    func test_colorSelection_noPreset_readsAsNatural() {
        XCTAssertEqual(CallEffectsModeRule.colorSelection(of: VideoFilterConfig()), .natural)
    }

    func test_applyingNatural_removesTheColorimetry() {
        let warm = VideoFilterConfig().applyingPreset(.warm)
        let natural = CallEffectsModeRule.applying(color: .natural, to: warm)
        XCTAssertNil(natural.activePreset)
        XCTAssertEqual(CallEffectsModeRule.colorSelection(of: natural), .natural)
    }

    func test_applyingAColor_keepsTheFaceEffect() {
        let toad = VideoFilterConfig().selectingFaceEffect(.toad)
        let cool = CallEffectsModeRule.applying(color: .cool, to: toad)
        XCTAssertEqual(cool.activePreset, .cool)
        XCTAssertEqual(cool.activeFaceEffect, .toad)
    }

    /// P8b · loi 14 — « (+) Ajouter un autre look » : la règle généralisée à la pile de trois couches
    /// se lit dans `CallEffectLayersTests` ; ici, ce que le cumul garde.
    func test_addingALook_keepsTheLookAlreadyChosen() {
        let toad = VideoFilterConfig().selectingFaceEffect(.toad)
        let cumulated = CallEffectsModeRule.applying(color: .golden, to: toad)
        XCTAssertEqual(cumulated.activeFaceEffect, .toad)
        XCTAssertEqual(cumulated.activePreset, .golden)
    }

    /// P8b.6 — le panneau de Réglages monte depuis la barre en ≈ 200 ms et y redescend ;
    /// « Réduire les animations » garde un fondu court, sans montée, et ne supprime
    /// jamais le mouvement d'un coup.
    func test_settingsPanel_risesFromTheBar_andOnlyFadesUnderReduceMotion() {
        XCTAssertGreaterThan(CallEffectsSettingsMotion.panelRise(reduceMotion: false), 0)
        XCTAssertEqual(CallEffectsSettingsMotion.panelRise(reduceMotion: true), 0)
    }

    /// P8b.6 — la bande et le panneau se croisent en ≈ 200 ms ; « Réduire les
    /// animations » garde un fondu court, elle ne supprime jamais le mouvement d'un coup.
    func test_settingsMotion_isAShortCrossfade_neverInstant() {
        XCTAssertEqual(CallEffectsSettingsMotion.duration(reduceMotion: false), 0.2)
        XCTAssertGreaterThan(CallEffectsSettingsMotion.duration(reduceMotion: true), 0)
        XCTAssertLessThan(CallEffectsSettingsMotion.duration(reduceMotion: true),
                          CallEffectsSettingsMotion.duration(reduceMotion: false))
    }

    // MARK: - Les gestes sur le style choisi (#8625)

    func test_outcome_doubleTapOnTheSelectedStyle_capturesAPhoto() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .doubleTap, isSelected: true, isRecording: false), .capturePhoto)
    }

    func test_outcome_longPressOnTheSelectedStyle_startsRecording() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .longPress, isSelected: true, isRecording: false), .startRecording)
    }

    func test_outcome_singleTapOnTheSelectedStyle_doesNothing() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .tap, isSelected: true, isRecording: false), .none)
    }

    func test_outcome_anyGestureOnAnotherStyle_selectsIt() {
        for gesture in CallModeGesture.allCases {
            XCTAssertEqual(CallModeGestureRule.outcome(of: gesture, isSelected: false, isRecording: false), .select, "\(gesture)")
        }
    }

    func test_outcome_whileRecording_theSelectedStyleNeitherShootsNorRestarts() {
        for gesture in CallModeGesture.allCases {
            XCTAssertEqual(CallModeGestureRule.outcome(of: gesture, isSelected: true, isRecording: true), .none, "\(gesture)")
        }
    }

    func test_outcome_whileRecording_anotherStyleIsStillSelectable() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .tap, isSelected: false, isRecording: true), .select)
    }

    func test_listensForShots_onlyTheSelectedStyleWhenIdle_listens() {
        XCTAssertTrue(CallModeGestureRule.listensForShots(isSelected: true, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.listensForShots(isSelected: false, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.listensForShots(isSelected: true, isRecording: true))
    }

    func test_showsHint_onlyUntilItHasBeenSeen() {
        XCTAssertTrue(CallModeGestureRule.showsHint(hasSeenHint: false, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.showsHint(hasSeenHint: true, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.showsHint(hasSeenHint: false, isRecording: true))
    }

    func test_clock_readsMinutesAndSeconds() {
        let latin = Locale(identifier: "en_US_POSIX")
        XCTAssertEqual(CallModeGestureRule.clock(0, locale: latin), "0:00")
        XCTAssertEqual(CallModeGestureRule.clock(9.7, locale: latin), "0:09")
        XCTAssertEqual(CallModeGestureRule.clock(75, locale: latin), "1:15")
        XCTAssertEqual(CallModeGestureRule.clock(-3, locale: latin), "0:00")
    }

    func test_clock_readsTheDigitsOfTheReadersLocale() {
        let arabic = CallModeGestureRule.clock(75, locale: Locale(identifier: "ar-EG"))
        XCTAssertNotEqual(arabic, "1:15")
        XCTAssertTrue(arabic.contains("١"), arabic)
    }

    // MARK: - OPUS-4 : Effets avant la connexion

    func test_preConnect_effectsModeShowsWhileAnOutgoingVideoCallWaits() {
        for state: CallState in [.ringing(isOutgoing: true), .offering, .connecting, .reconnecting(attempt: 1)] {
            XCTAssertTrue(
                CallPreConnectEffectsRule.showsMode(.effects, state: state, isVideoEnabled: true, showsConnectedLayout: false),
                "\(state)"
            )
        }
    }

    func test_preConnect_effectsModeNeverShowsOnTheIncomingRing() {
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.effects, state: .ringing(isOutgoing: false), isVideoEnabled: true, showsConnectedLayout: false))
    }

    func test_preConnect_effectsModeLeavesToTheConnectedCall() {
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.effects, state: .connected, isVideoEnabled: true, showsConnectedLayout: true))
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.effects, state: .reconnecting(attempt: 1), isVideoEnabled: true, showsConnectedLayout: true))
    }

    func test_preConnect_nothingShowsWithoutVideoOrOnceTheCallIsOver() {
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.effects, state: .connecting, isVideoEnabled: false, showsConnectedLayout: false))
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.effects, state: .ended(reason: .local), isVideoEnabled: true, showsConnectedLayout: false))
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.effects, state: .idle, isVideoEnabled: true, showsConnectedLayout: false))
    }

    func test_preConnect_onlyTheEffectsModeOpensBeforeTheConnection() {
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(.montage, state: .connecting, isVideoEnabled: true, showsConnectedLayout: false))
        XCTAssertFalse(CallPreConnectEffectsRule.showsMode(nil, state: .connecting, isVideoEnabled: true, showsConnectedLayout: false))
    }

    func test_preConnect_noCaptureAndNoCompanionsUntilTheCallIsEstablished() {
        XCTAssertFalse(CallPreConnectEffectsRule.capturesMyImage(showsConnectedLayout: false))
        XCTAssertTrue(CallPreConnectEffectsRule.capturesMyImage(showsConnectedLayout: true))
        XCTAssertFalse(CallPreConnectEffectsRule.showsCompanions(showsConnectedLayout: false))
        XCTAssertTrue(CallPreConnectEffectsRule.showsCompanions(showsConnectedLayout: true))
    }

    /// Un mode Effets ouvert pendant la sonnerie reste ouvert au décroché tant
    /// que l'appel établi offre Effets ; un repli audio le referme.
    func test_preConnect_openModeSurvivesTheConnectionOnlyIfEffectsStayOffered() {
        let open = CallScreenLayer.idle.entering(.effects)
        XCTAssertEqual(open.reconciled(with: CallActionSet.resolve(.init(isOnMac: false, isVideoEnabled: true, hasSelectableCameras: false, isConnected: true, mayRecord: false, showsVideo: true))), open)
        XCTAssertEqual(open.reconciled(with: CallActionSet.resolve(.init(isOnMac: false, isVideoEnabled: false, hasSelectableCameras: false, isConnected: true, mayRecord: false, showsVideo: false))), .idle)
    }

    // MARK: - Réduire les animations, part du carrousel (loi 17.10)

    func test_animation_underReduceMotion_isTheShortChromeFade_whateverTheFullOneIs() {
        let fade = Animation.easeInOut(duration: CallChromeStow.reducedFadeDuration)
        XCTAssertEqual(CallModeCarouselRule.animation(reduceMotion: true, full: .spring(response: 0.25, dampingFraction: 0.8)), fade)
        XCTAssertEqual(CallModeCarouselRule.animation(reduceMotion: true, full: .easeInOut(duration: 0.25)), fade)
    }

    func test_animation_withMotion_keepsTheFullOne() {
        let full = Animation.easeInOut(duration: 0.25)
        XCTAssertEqual(CallModeCarouselRule.animation(reduceMotion: false, full: full), full)
    }

    func test_scaleAnimation_underReduceMotion_neverMoves_andElseSprings() {
        XCTAssertNil(CallModeCarouselRule.scaleAnimation(reduceMotion: true), "Le fondu seul : la taille ne glisse pas d'une case à l'autre")
        XCTAssertNotNil(CallModeCarouselRule.scaleAnimation(reduceMotion: false))
    }
}
