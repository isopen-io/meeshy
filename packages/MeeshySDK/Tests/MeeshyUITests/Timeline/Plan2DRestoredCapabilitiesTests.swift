import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Quatre capacités que le passage au plan 2D (D3) avait laissées sans
/// surface, et que la revue DoD réclame de rendre de nouveau atteignables :
/// le mute PAR CLIP, les échos d'un fond qui boucle, l'accessibilité PAR
/// PISTE, et le déplacement temporel d'une piste au doigt.
///
/// Chacune est testée par son CALCUL (pur, hors vue) ; le câblage est ancré
/// par les gardes de source de `Plan2DIntegrationGuardTests`.

// MARK: - Mute par clip

@MainActor
final class ClipInspectorMuteTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func videoProject() -> TimelineProject {
        var video = StoryMediaObject(id: "v1", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        video.startTime = 0
        video.duration = 5
        return TimelineProject(slideId: "s1", slideDuration: 10,
                               mediaObjects: [video], audioPlayerObjects: [],
                               textObjects: [], clipTransitions: [])
    }

    private func inspector(for vm: TimelineViewModel, clipId: String) -> ClipInspector {
        ClipInspector(
            presentation: .sheet,
            clip: ClipInspector.ClipSnapshot(
                id: clipId, displayName: clipId, kind: .video,
                startTime: 0, duration: 5, volume: 1,
                fadeInDuration: 0, fadeOutDuration: 0,
                isLooping: false, isBackground: false
            ),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {},
            onToggleMute: { [vm] in vm.toggleClipMute(id: clipId) }
        )
    }

    func test_muteAction_silencesTheClip() {
        let vm = makeViewModel(project: videoProject())

        inspector(for: vm, clipId: "v1").simulateMuteToggle()

        XCTAssertEqual(vm.project.mediaObjects.first(where: { $0.id == "v1" })?.volume, 0,
                       "Le mute par clip doit redevenir atteignable depuis la fiche d'édition")
    }

    func test_muteAction_isUndoable_andRestoresTheAuthorLevel() {
        let vm = makeViewModel(project: videoProject())
        vm.setClipVolume(id: "v1", volume: 0.4)

        inspector(for: vm, clipId: "v1").simulateMuteToggle()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0)

        vm.undo()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0.4,
                       "Annuler un mute doit rendre le niveau QUITTÉ, jamais 1.0 forcé")
    }

    /// Le son se coupe et se rétablit : deux appels ramènent le niveau de départ.
    func test_muteAction_toggles() {
        let vm = makeViewModel(project: videoProject())
        vm.setClipVolume(id: "v1", volume: 0.8)

        inspector(for: vm, clipId: "v1").simulateMuteToggle()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0)

        inspector(for: vm, clipId: "v1").simulateMuteToggle()
        XCTAssertEqual(vm.project.mediaObjects.first?.volume, 0.8)
    }
}

// MARK: - Échos d'un fond qui boucle

@MainActor
final class StoryTimelineHostLoopEchoTests: XCTestCase {

    private static func tracks(_ ids: [String]) -> [Plan2DTrack] {
        ids.map { Plan2DTrack(id: $0, label: $0, plane: .bg, z: 0, bar: .ghost) }
    }

    private func project(media: [StoryMediaObject] = [],
                         audio: [StoryAudioPlayerObject] = []) -> TimelineProject {
        TimelineProject(slideId: "s1", slideDuration: 10,
                        mediaObjects: media, audioPlayerObjects: audio,
                        textObjects: [], clipTransitions: [])
    }

    func test_loopingBackgroundVideo_getsEchoesOnItsOwnRow() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = true
        bg.startTime = 0
        bg.duration = 3

        let echoes = StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                  tracks: Self.tracks(["other", "bg"]))

        XCTAssertEqual(echoes.map(\.trackId), ["bg"])
        XCTAssertEqual(echoes.first?.rowIndex, 1, "L'écho se dessine sur la RANGÉE de son clip")
        XCTAssertEqual(echoes.first?.nativeDuration, 3)
        XCTAssertEqual(echoes.first?.clipStartTime, 0)
    }

    func test_aBackgroundThatDoesNotLoop_hasNoEcho() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = false
        bg.startTime = 0
        bg.duration = 3

        XCTAssertTrue(StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                   tracks: Self.tracks(["bg"])).isEmpty)
    }

    func test_aLoopingCarrierClip_hasNoEcho_onlyTheBackgroundFillsTheSlide() {
        var carrier = StoryMediaObject(id: "clip", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        carrier.isBackground = false
        carrier.loop = true
        carrier.startTime = 0
        carrier.duration = 3

        XCTAssertTrue(StoryTimelineHost.loopEchoes(project: project(media: [carrier]),
                                                   tracks: Self.tracks(["clip"])).isEmpty)
    }

    func test_loopingBackgroundAudio_alsoGetsEchoes() {
        let sound = StoryAudioPlayerObject(id: "snd", postMediaId: "m2",
                                           isBackground: true,
                                           startTime: 1, duration: 2, loop: true)

        let echoes = StoryTimelineHost.loopEchoes(project: project(audio: [sound]),
                                                  tracks: Self.tracks(["snd"]))

        XCTAssertEqual(echoes.map(\.trackId), ["snd"])
        XCTAssertEqual(echoes.first?.clipStartTime, 1)
        XCTAssertEqual(echoes.first?.nativeDuration, 2)
    }

    func test_aLoopingClipWithoutARowInThePlan_isSkipped() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = true
        bg.startTime = 0
        bg.duration = 3

        XCTAssertTrue(StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                   tracks: Self.tracks(["autre"])).isEmpty)
    }

    /// Les tuiles réellement dessinées viennent du composant EXISTANT — le
    /// calcul de tuilage n'est pas réinventé ici.
    func test_echoesFeedTheExistingLoopRepeatOverlayTiling() {
        var bg = StoryMediaObject(id: "bg", postMediaId: "m1", kind: .video, aspectRatio: 1.777)
        bg.isBackground = true
        bg.loop = true
        bg.startTime = 0
        bg.duration = 3

        guard let echo = StoryTimelineHost.loopEchoes(project: project(media: [bg]),
                                                      tracks: Self.tracks(["bg"])).first else {
            return XCTFail("Un fond qui boucle doit produire un écho")
        }
        XCTAssertEqual(
            LoopRepeatOverlay.repeatStartTimes(nativeDuration: echo.nativeDuration,
                                               clipStartTime: echo.clipStartTime,
                                               slideDuration: 10),
            [3, 6, 9]
        )
    }
}

// MARK: - Accessibilité par piste

final class Plan2DTrackAccessibilityTests: XCTestCase {

    func test_label_prefixesTheTrackWithItsPlane() {
        let track = Plan2DTrack(id: "t", label: "Aa \"Salut\"", plane: .bg, z: 0,
                                bar: .timed(start: 1, end: 4))
        let label = Plan2DView.accessibilityLabel(for: track)

        XCTAssertTrue(label.hasPrefix(Plan2DView.planeLabel(.bg)),
                      "La section (le plan) doit PRÉCÉDER le nom de la piste — got: \(label)")
        XCTAssertTrue(label.contains("Aa \"Salut\""), "Le nom de la piste doit rester audible — got: \(label)")
    }

    /// Le plan du FOND réutilise la clé de section de l'ancien conteneur
    /// (`story.timeline.track.section.bg.a11y`) — une seule source, pas un
    /// second libellé qui dériverait.
    func test_backgroundPlane_announcesTheSameSectionWordAsTheOldContainer() {
        let label = Plan2DView.planeLabel(.bg).lowercased()
        XCTAssertTrue(label.contains("fond") || label.contains("background"),
                      "Locale fr « Fond » / en « Background » — got: \(Plan2DView.planeLabel(.bg))")
    }

    func test_eachPlaneHasItsOwnSectionWord() {
        let words = [Plan2DView.planeLabel(.fg),
                     Plan2DView.planeLabel(.content),
                     Plan2DView.planeLabel(.bg)]
        XCTAssertEqual(Set(words).count, 3, "Trois plans, trois annonces distinctes — got: \(words)")
        XCTAssertFalse(words.contains(where: \.isEmpty))
    }

    func test_timedTrack_announcesWhatItOccupiesInTime() {
        let track = Plan2DTrack(id: "t", label: "Voix", plane: .content, z: 0,
                                bar: .timed(start: 1, end: 4))
        XCTAssertTrue(Plan2DView.accessibilityLabel(for: track)
            .contains(TrackBarView<AnyView>.formatTrackDuration(3)),
                      "Une durée choisie doit s'entendre — got: \(Plan2DView.accessibilityLabel(for: track))")
    }

    func test_ghostTrack_announcesThatItFollowsTheSlide() {
        let track = Plan2DTrack(id: "t", label: "☺", plane: .fg, z: 0, bar: .ghost)
        let label = Plan2DView.accessibilityLabel(for: track).lowercased()
        XCTAssertTrue(label.contains("suit") || label.contains("follow"),
                      "Un fantôme n'a pas de durée : il SUIT la slide, et le dit — got: \(label)")
    }

    /// Suffixe de verrou en queue de libellé (revue Opus, constat 3) —
    /// LOCALISÉ (`story.timeline.plan.track.locked.a11y`, revue Opus DoD sur
    /// D6b : la première version le codait en dur en français dans le
    /// chemin de production ; contrairement à `TrackBarView
    /// .accessibilityComposedLabel`, mort en production — cf. axe G de la
    /// revue —, cette annonce EST rendue en vrai, donc catalogue 7 langues
    /// obligatoire). Même technique locale-agnostique que
    /// `test_ghostTrack_announcesThatItFollowsTheSlide` ci-dessus.
    func test_lockedTrack_announcesALockedSuffix() {
        let locked = Plan2DTrack(id: "t", label: "Fond", plane: .bg, z: 0, bar: .ghost, isLocked: true)
        let unlocked = Plan2DTrack(id: "t", label: "Fond", plane: .bg, z: 0, bar: .ghost, isLocked: false)
        XCTAssertNotEqual(Plan2DView.accessibilityLabel(for: locked),
                          Plan2DView.accessibilityLabel(for: unlocked))
    }
}

// MARK: - Sélection RENDUE (revue Opus, constat 4)

/// L'ancien conteneur surlignait la piste sélectionnée à quatre endroits
/// (`StoryTimelineView.swift:498/649/727/786`) ; `Plan2DView` n'exposait ni
/// ne recevait aucun état de sélection — `.equatable()` (`StoryTimelineHost
/// .swift:304`) garantissait donc qu'un `selectedClipId` changé ne
/// redessinait JAMAIS le Canvas. `selectedTrackId` doit désormais entrer
/// dans `==`, sans quoi la propriété existerait sans jamais influer le
/// redessin qui la rendrait visible.
@MainActor
final class Plan2DSelectionEqualityTests: XCTestCase {

    private static let track = Plan2DTrack(id: "a", label: "a", plane: .fg, z: 0,
                                           bar: .timed(start: 0, end: 4))

    private func makeView(selectedTrackId: String?) -> Plan2DView {
        Plan2DView(
            tracks: [Self.track], zoom: .fit, laneWidth: 300, slideDuration: 10, isDark: false,
            selectedTrackId: selectedTrackId,
            onSelectTrack: { _ in }, onSelectKeyframe: { _ in }, onReorder: { _, _ in },
            onTrimStart: { _, _ in }, onTrimEnd: { _, _ in }, onMove: { _, _ in },
            onMoveEnded: { _ in }, onScrollLockChanged: { _ in }
        )
    }

    func test_aChangedSelection_makesTheViewUnequal() {
        XCTAssertNotEqual(makeView(selectedTrackId: "a"), makeView(selectedTrackId: nil),
                          "Sans selectedTrackId dans ==, sélectionner une piste ne redessinerait jamais le Canvas")
    }

    func test_theSameSelection_keepsTheViewEqual() {
        XCTAssertEqual(makeView(selectedTrackId: "a"), makeView(selectedTrackId: "a"))
    }
}

// MARK: - Déplacement temporel d'une piste au doigt

final class Plan2DClipMoveGestureTests: XCTestCase {

    private static let timed = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                           bar: .timed(start: 0, end: 4))
    private static let ghost = Plan2DTrack(id: "g", label: "g", plane: .fg, z: 0, bar: .ghost)

    /// Simule UNE frame de geste déjà armé : l'axe est celui que la vue
    /// élirait pour cette translation, mesurée DEPUIS l'armement.
    private func delta(_ translationSinceArm: CGSize, edge: Plan2DView.Edge? = nil,
                       armed: Bool = true,
                       axis: Plan2DView.DragAxis? = nil,
                       track: Plan2DTrack = Plan2DClipMoveGestureTests.timed) -> Double? {
        Plan2DView.moveDelta(translationSinceArm: translationSinceArm,
                             axis: axis ?? Plan2DView.dominantAxis(translationSinceArm),
                             gestureEdge: edge, isReorderArmed: armed,
                             track: track, zoom: .fit, laneWidth: 300, slideDuration: 10)
    }

    func test_armedHorizontalDrag_movesTheTrackInTime() {
        // 300 pt pour 10 s ⇒ 30 px/s : 60 pt valent 2 s.
        XCTAssertEqual(delta(CGSize(width: 60, height: 0)) ?? .nan, 2, accuracy: 0.0001)
        XCTAssertEqual(delta(CGSize(width: -30, height: 0)) ?? .nan, -1, accuracy: 0.0001)
    }

    func test_theDeltaIsCumulative_notIncremental() {
        // Deux lectures successives du MÊME geste : la seconde vaut la
        // translation totale, pas son incrément — c'est l'appelant qui
        // reconstruit depuis l'origine capturée (parade anti-dérive).
        XCTAssertEqual(delta(CGSize(width: 30, height: 0)) ?? .nan, 1, accuracy: 0.0001)
        XCTAssertEqual(delta(CGSize(width: 90, height: 0)) ?? .nan, 3, accuracy: 0.0001)
    }

    func test_anUnarmedDrag_neverMoves_itScrolls() {
        XCTAssertNil(delta(CGSize(width: 60, height: 0), armed: false),
                     "Le glissement NU appartient au scroller — déplacer exige l'armement (M11)")
    }

    func test_anEdgeDrag_trimsInsteadOfMoving() {
        XCTAssertNil(delta(CGSize(width: 60, height: 0), edge: .start),
                     "Une poignée de bord rogne : elle ne déplace pas")
    }

    func test_aGhostTrackIsNeverMoved() {
        XCTAssertNil(delta(CGSize(width: 60, height: 0), track: Self.ghost),
                     "Un fantôme n'a pas de fenêtre à déplacer — lui en fabriquer une convertirait un défaut en choix (O4)")
    }

    func test_aPurelyVerticalDrag_producesNoTimeMove() {
        XCTAssertNil(delta(CGSize(width: 0, height: 120)),
                     "Réordonner verticalement ne doit pas décaler la piste dans le temps")
    }

    /// Le cas RÉEL : aucun doigt ne descend sur une verticale mathématique.
    /// Un réordonnancement vertical porte toujours quelques points
    /// d'horizontal — s'ils suffisent à ouvrir une session de déplacement, tout
    /// réordonnancement au doigt empile un `MoveClipCommand` et décale le clip.
    func test_aVerticalDragCarryingTheUsualHorizontalWobble_neverMovesTheTrackInTime() {
        XCTAssertNil(delta(CGSize(width: 9, height: 120)),
                     "9 pt d'horizontal pour 120 pt de vertical : c'est un réordonnancement, pas un déplacement temporel")
    }

    /// L'axe est ÉLU une fois, pas réévalué à chaque frame : un déplacement
    /// temporel qui dérive de deux centimètres vers le bas reste un
    /// déplacement temporel.
    func test_anAxisLockedHorizontally_keepsMoving_evenWhenTheFingerDriftsDown() {
        XCTAssertEqual(delta(CGSize(width: 60, height: 200), axis: .horizontal) ?? .nan,
                       2, accuracy: 0.0001)
    }

    /// Réciproque : une fois l'axe vertical élu, aucune dérive horizontale ne
    /// rouvre la session de déplacement.
    func test_anAxisLockedVertically_neverMoves_evenWhenTheFingerDriftsFarSideways() {
        XCTAssertNil(delta(CGSize(width: 200, height: 40), axis: .vertical),
                     "L'axe élu au premier dépassement de la zone morte tient jusqu'au relâchement")
    }

    /// La zone morte : sous 8 pt, aucun axe n'est élu et rien ne part — c'est
    /// la frontière entre un tap qui tremble et un geste.
    func test_beforeAnyAxisIsElected_nothingMoves() {
        XCTAssertNil(delta(CGSize(width: 5, height: 3), axis: nil))
    }
}

// MARK: - Armement du geste (M11) : « poser, hésiter, glisser »

/// L'armement décide QUI tient le geste : le plan, ou le scroller qui
/// l'entoure. La note du module (`VideoClipBar:178-183`) nomme le piège
/// résolu ailleurs et réintroduit ici : un appui long qui exige 0,4 s de doigt
/// IMMOBILE ne s'engage jamais sur un glissement lent.
final class Plan2DGestureArmingTests: XCTestCase {

    func test_aStillFingerBeforeTheHold_waits() {
        XCTAssertEqual(Plan2DView.armDecision(translation: CGSize(width: 2, height: 1), elapsed: 0.1),
                       .wait)
    }

    func test_aStillFingerPastTheHold_arms_withNoAxisElectedYet() {
        XCTAssertEqual(Plan2DView.armDecision(translation: CGSize(width: 3, height: 2), elapsed: 0.5),
                       .arm(axis: nil),
                       "Tenir puis glisser : l'axe se décide au glissement, pas à l'armement")
    }

    /// « Poser, hésiter, glisser » : le glissement lent dépasse le slop AVANT
    /// le délai de tenue. L'ancienne garde (`withinSlop` en verrou) le laissait
    /// mort — ni réordonnancement, ni déplacement.
    func test_poserHesiterGlisser_armsImmediatelyInMoveMode() {
        XCTAssertEqual(Plan2DView.armDecision(translation: CGSize(width: 40, height: 6), elapsed: 0.2),
                       .arm(axis: .horizontal),
                       "Un glissement horizontal franc sur une piste appartient à la piste, pas au scroller")
    }

    func test_aVerticalScrollBeforeTheHold_yieldsToTheScroller() {
        XCTAssertEqual(Plan2DView.armDecision(translation: CGSize(width: 6, height: 40), elapsed: 0.2),
                       .yieldToScroller,
                       "Faire défiler la liste des pistes doit rester possible partout")
    }

    /// `DragGesture.onChanged` ne se déclenche PAS sur un doigt strictement
    /// immobile : la première frame après la tenue peut déjà avoir quitté le
    /// slop. Décider sur le slop d'abord condamnerait tout réordonnancement.
    func test_theFirstFrameAfterAStillHold_armsEvenThoughItAlreadyLeftTheSlop() {
        XCTAssertEqual(Plan2DView.armDecision(translation: CGSize(width: 2, height: 60), elapsed: 0.5),
                       .arm(axis: nil))
    }
}

// MARK: - Élection de l'axe

final class Plan2DDragAxisTests: XCTestCase {

    func test_underTheDeadZone_noAxisIsElected() {
        XCTAssertNil(Plan2DView.dominantAxis(CGSize(width: 5, height: 6)))
        XCTAssertNil(Plan2DView.dominantAxis(.zero))
    }

    func test_aVerticalFingerCarryingItsUsualWobble_electsVertical() {
        XCTAssertEqual(Plan2DView.dominantAxis(CGSize(width: 9, height: 120)), .vertical)
    }

    func test_aHorizontalGlide_electsHorizontal() {
        XCTAssertEqual(Plan2DView.dominantAxis(CGSize(width: 40, height: 9)), .horizontal)
    }

    /// Égalité parfaite : l'axe le plus prudent gagne — un doute ne doit jamais
    /// se payer d'un `MoveClipCommand` non voulu.
    func test_aPerfectDiagonal_electsVertical() {
        XCTAssertEqual(Plan2DView.dominantAxis(CGSize(width: 30, height: 30)), .vertical)
    }

    func test_theDeadZoneIsAFingersWidth_notAMathematicalZero() {
        XCTAssertGreaterThanOrEqual(Plan2DView.axisDeadZone, 4)
        XCTAssertLessThan(Plan2DView.axisDeadZone, Plan2DView.reorderSlop)
    }
}

// MARK: - Aimantation : la tolérance suit l'échelle DU PLAN

/// La tolérance d'aimantation vaut « 8 points de doigt », convertis en
/// secondes par une échelle temps→pixels. Le plan 2D en a introduit une
/// nouvelle (`equivalentGeometry` — celle de la règle, de la tête de lecture
/// et du chrome), pendant que le moteur d'aimant continuait de lire le
/// `zoomScale` continu du transport : les deux n'ont plus aucun rapport
/// (revue Opus, constat 6).
///
/// Les deux densités extrêmes du plan le montrent — lane 350 pt, `zoomScale`
/// au défaut 1.0, soit une tolérance figée à 0,16 s.
@MainActor
final class Plan2DSnapScaleTests: XCTestCase {

    private func makeViewModel(slideDuration: Float, neighbourEnd: Float) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        var neighbour = StoryMediaObject(id: "v1", postMediaId: "v1", kind: .video, aspectRatio: 1.0)
        neighbour.startTime = 0
        neighbour.duration = Double(neighbourEnd)
        var moved = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .image, aspectRatio: 1.0)
        moved.startTime = 0
        moved.duration = 0.1
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: slideDuration,
                                              mediaObjects: [neighbour, moved],
                                              audioPlayerObjects: [],
                                              textObjects: [],
                                              clipTransitions: []),
                     mediaURLs: [:], images: [:])
        return vm
    }

    private func droppedStart(vm: TimelineViewModel, rawTime: Float, laneWidth: CGFloat,
                              slideDuration: Double) -> Float {
        vm.beginClipDrag(clipId: "m1")
        vm.dragClipMoved(rawTime: rawTime, snapCandidates: [],
                         geometry: Plan2DView.equivalentGeometry(laneWidth: laneWidth, zoom: .fit,
                                                                 slideDuration: slideDuration))
        vm.endClipDrag()
        return vm.project.mediaObjects.first(where: { $0.id == "m1" })?.startTime.map(Float.init) ?? -1
    }

    /// Plan DENSE — slide d'une seconde sur 350 pt : 350 px/s. Huit points de
    /// doigt valent 0,023 s. La tolérance du transport (0,16 s) y couvre 56 pt
    /// d'écran : l'aimant avale un sixième de la piste.
    func test_onADensePlan_theMagnetDoesNotSwallowASixthOfTheTrack() {
        let vm = makeViewModel(slideDuration: 1, neighbourEnd: 0.2)
        XCTAssertEqual(droppedStart(vm: vm, rawTime: 0.3, laneWidth: 350, slideDuration: 1),
                       0.3, accuracy: 0.005,
                       "0,1 s = 35 pt d'écran sur ce plan : bien au-delà du doigt, l'aimant ne doit pas accrocher")
    }

    /// Plan CLAIRSEMÉ — slide de soixante secondes sur 350 pt : 5,8 px/s. La
    /// tolérance du transport y vaut 1 pt d'écran : l'aimant n'accroche plus
    /// jamais visuellement. Le plafond (0,25 s) devient la règle utile.
    func test_onASparsePlan_theMagnetStillCatchesAVisiblyAdjacentEdge() {
        let vm = makeViewModel(slideDuration: 60, neighbourEnd: 10)
        XCTAssertEqual(droppedStart(vm: vm, rawTime: 10.2, laneWidth: 350, slideDuration: 60),
                       10, accuracy: 0.005,
                       "0,2 s à cette densité, c'est un pixel d'écart : l'aimant doit accrocher")
    }
}

// MARK: - Mineur 19 réconcilié avec l'inspectabilité audio (arbitrage 3, D6c)

/// La préséance du BORD sur un losange qui le recouvre (`Plan2DView.tapTarget`,
/// mineur 19) reste INCONDITIONNELLE — mais depuis que les losanges AUDIO
/// routent vers l'inspecteur de LEUR CLIP (constat 1, `TimelineInspectorHost.
/// resolveAudioKeyframeOwnerSnapshot`), les deux issues possibles d'un tap sur
/// ce chevauchement (`.track` ou `.keyframe`) atterrissent désormais sur la
/// MÊME fiche : celle du clip audio. La préséance de l'arête ne prive donc
/// plus jamais l'utilisateur d'un inspecteur pour une famille dont le losange
/// serait inatteignable ailleurs — elle choisit seulement PAR OÙ il y arrive.
@MainActor
final class Plan2DAudioKeyframeEdgeReconciliationTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func audioProjectWithKeyframeAtItsBarsEdge() -> TimelineProject {
        var audio = StoryAudioPlayerObject(id: "aud-1", postMediaId: "post-aud-1")
        audio.startTime = 0
        audio.duration = 10
        audio.keyframes = [StoryKeyframe(id: "kf-edge", time: 0, volume: 0.5)]
        return TimelineProject(slideId: "s1", slideDuration: 10,
                               mediaObjects: [], audioPlayerObjects: [audio],
                               textObjects: [], clipTransitions: [])
    }

    func test_edgeTapAndKeyframeTap_bothResolveToTheSameAudioClip() {
        let project = audioProjectWithKeyframeAtItsBarsEdge()
        guard let track = Plan2DLayout.tracks(from: Plan2DProjectAdapter.effects(from: project),
                                              slideDuration: Double(project.slideDuration)).first else {
            return XCTFail("Le projet doit produire une piste audio")
        }

        // Le losange se dessine EXACTEMENT sur le bord gauche : tapTarget
        // résout `.track` (préséance du bord, mineur 19) — jamais `.keyframe`.
        XCTAssertEqual(
            Plan2DView.tapTarget(touchX: Plan2DView.labelColumnWidth, track: track,
                                 zoom: .fit, laneWidth: 300, slideDuration: Double(project.slideDuration)),
            .track
        )

        let viaTrack = makeViewModel(project: project)
        viaTrack.inspectClip(id: track.id)
        guard case .clip(let trackSnapshot) = TimelineInspectorHost.presentedSelection(viewModel: viaTrack) else {
            return XCTFail("Le bord doit ouvrir la fiche du clip")
        }

        let viaKeyframe = makeViewModel(project: project)
        viaKeyframe.inspectClip(id: "kf-edge")
        guard case .clip(let keyframeSnapshot) = TimelineInspectorHost.presentedSelection(viewModel: viaKeyframe) else {
            return XCTFail("Le losange doit AUSSI ouvrir la fiche du clip — jamais un cul-de-sac")
        }

        XCTAssertEqual(trackSnapshot.id, keyframeSnapshot.id,
                       "Bord ou losange : même clip, même fiche — la préséance ne choisit plus qu'un chemin, jamais une destination différente")
        XCTAssertEqual(trackSnapshot.id, "aud-1")
    }
}
