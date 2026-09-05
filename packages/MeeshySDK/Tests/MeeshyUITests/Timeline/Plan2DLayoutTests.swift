import Testing
import Foundation
import CoreGraphics
@testable import MeeshySDK
@testable import MeeshyUI

/// Le plan 2D lit le RUNTIME du composer (`StoryEffects`) — c'est lui qui
/// s'édite — et n'en tire QUE deux règles : l'ORDRE des pistes (les trois plans
/// bornent le geste vertical, puis z décroissant dans le plan) et la NATURE de
/// la barre (durée choisie contre piste fantôme, O4 : `timing == nil` dit
/// « suit la slide », jamais un défaut déguisé en choix).
///
/// La vue (D2) ne fait que dessiner ce que ce banc épingle à sec.
@Suite("Plan 2D — pistes et échelle")
struct Plan2DLayoutTests {

    private static let slideDuration: Double = 10

    // MARK: - Fixtures

    private func composedSlide() -> StoryEffects {
        StoryEffects(
            background: "#101010",
            stickerObjects: [StorySticker(id: "stk", emoji: "☺", zIndex: 2)],
            textObjects: [
                StoryTextObject(id: "txt", text: "Salut", zIndex: 5,
                                startTime: 1, duration: 3,
                                keyframes: [StoryKeyframe(time: 2), StoryKeyframe(time: 1)])
            ],
            audioPlayerObjects: [
                StoryAudioPlayerObject(id: "aud", postMediaId: "pm-1", name: "Voix")
            ],
            timelineDuration: Self.slideDuration
        )
    }

    private func tracks(_ effects: StoryEffects) -> [Plan2DTrack] {
        Plan2DLayout.tracks(from: effects, slideDuration: Self.slideDuration)
    }

    // MARK: - L'ordre des pistes EST l'ordre à l'écran

    @Test("fg d'abord (au plus près du spectateur), puis content, puis bg")
    func tracks_areOrderedForegroundThenContentThenBackground() {
        let plan = tracks(composedSlide())
        #expect(plan.map(\.plane) == [.fg, .fg, .content, .bg])
        #expect(plan.map(\.id) == ["txt", "stk", "aud", Plan2DLayout.backgroundTrackID])
    }

    @Test("Dans un plan, z décroissant — monter une piste la rapproche du spectateur")
    func tracks_withinAPlane_areSortedByDescendingZ() {
        let effects = StoryEffects(
            stickerObjects: [StorySticker(id: "bas", emoji: "☺", zIndex: 1),
                             StorySticker(id: "haut", emoji: "★", zIndex: 9)],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(effects).map(\.id) == ["haut", "bas"])
    }

    // MARK: - Durée choisie

    @Test("Un texte à start 1 / durée 3 occupe [1, 4] et pose ses losanges en temps ABSOLU")
    func text_barSpansStartPlusDuration_andCarriesItsKeyframeTimes() {
        let text = tracks(composedSlide()).first { $0.id == "txt" }
        #expect(text?.bar == .timed(start: 1, end: 4))
        #expect(text?.keyframeTimes == [2, 3])
        #expect(text?.label == "Aa \"Salut\"")
    }

    @Test("Un losange AFFICHÉ porte l'IDENTITÉ de son keyframe, pas seulement son temps — sans elle, un tap ne peut jamais router vers le bon KeyframeInspector (S4)")
    func text_keyframes_carryTheirOwnIdentity_sortedByTime() {
        let effects = StoryEffects(
            textObjects: [
                StoryTextObject(id: "txt", text: "Salut", startTime: 1, duration: 3,
                                keyframes: [StoryKeyframe(id: "kf-late", time: 2),
                                            StoryKeyframe(id: "kf-early", time: 1)])
            ],
            timelineDuration: Self.slideDuration
        )
        let text = tracks(effects).first
        #expect(text?.keyframes.map(\.id) == ["kf-early", "kf-late"])
        #expect(text?.keyframes.map(\.time) == [2, 3])
        #expect(text?.keyframeTimes == [2, 3])
    }

    // MARK: - Position temporelle des losanges — l'axe du plan est ABSOLU

    @Test("Le temps d'un keyframe est RELATIF au clip au modèle ; sur le plan il se pose en ABSOLU (début du clip + temps relatif) — même repère que KeyframeMarkerResolver et que l'en-tête du KeyframeInspector")
    func keyframes_areProjectedOntoTheAbsoluteAxis_notTheClipRelativeOne() {
        let effects = StoryEffects(
            textObjects: [
                StoryTextObject(id: "txt", text: "A", startTime: 1, duration: 3,
                                keyframes: [StoryKeyframe(id: "kf-1", time: 1),
                                            StoryKeyframe(id: "kf-2", time: 2)])
            ],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(effects).first?.keyframeTimes == [2, 3])
    }

    @Test("Un losange tombe TOUJOURS dans la barre de son clip — un temps relatif posé sur l'axe absolu le ferait dériver hors de sa propre barre")
    func keyframes_alwaysLandInsideTheirOwnBar() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "clip", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 3, duration: 3,
                                 keyframes: [StoryKeyframe(id: "kf-1", time: 1),
                                             StoryKeyframe(id: "kf-2", time: 2)])
            ],
            timelineDuration: Self.slideDuration
        )
        guard let track = tracks(effects).first,
              case let .timed(start, end) = track.bar else {
            Issue.record("Le clip média doit produire une barre à durée choisie")
            return
        }
        #expect(track.keyframeTimes == [4, 5])
        #expect(track.keyframeTimes.allSatisfy { $0 >= start && $0 <= end })
    }

    @Test("Un clip rogné plus court que son dernier keyframe l'ÉCRÊTE à la fenêtre — le losange ne dérive jamais hors de sa propre barre (revue Opus, mineur 15)")
    func keyframes_beyondATrimmedWindow_areClampedToIt() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "clip", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 2, duration: 2,
                                 keyframes: [StoryKeyframe(id: "kf-in", time: 1),
                                             StoryKeyframe(id: "kf-over", time: 5)])
            ],
            timelineDuration: Self.slideDuration
        )
        let track = tracks(effects).first
        #expect(track?.bar == .timed(start: 2, end: 4))
        #expect(track?.keyframes.map(\.id) == ["kf-in", "kf-over"],
               "L'écrêtage ne doit jamais faire DISPARAÎTRE un losange — seulement le replier dans la fenêtre")
        #expect(track?.keyframeTimes == [3, 4],
               "kf-over (temps absolu 7) doit être écrêté à la FIN de la barre (4), pas dériver hors d'elle")
    }

    /// La collision que l'écrêtage engendre, épinglée telle qu'elle est
    /// ASSUMÉE (revue DoD de D6c, constat 3) : deux keyframes au-delà de la
    /// même borne s'y replient sur la MÊME abscisse. Aucun n'est retiré — le
    /// plan garde leur identité, et c'est ce que le hit-test départage
    /// ensuite.
    @Test("Deux keyframes au-delà de la fin se replient sur la MÊME abscisse — aucun n'est supprimé (collision assumée, revue DoD de D6c, constat 3)")
    func keyframes_twoBeyondATrimmedWindow_collapseOnTheSameEdge() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "clip", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 2, duration: 2,
                                 keyframes: [StoryKeyframe(id: "kf-over-1", time: 5),
                                             StoryKeyframe(id: "kf-over-2", time: 6)])
            ],
            timelineDuration: Self.slideDuration
        )
        let track = tracks(effects).first
        #expect(track?.bar == .timed(start: 2, end: 4))
        #expect(Set(track?.keyframes.map(\.id) ?? []) == ["kf-over-1", "kf-over-2"],
               "L'écrêtage ne retire JAMAIS un losange du plan — il le replie, c'est tout")
        #expect(track?.keyframeTimes == [4, 4],
               "Les deux débordent la même borne : ils s'y replient tous les deux")
    }

    /// Et la collision n'est jamais DÉFINITIVE : le rognage ne touche que
    /// `duration`, jamais `StoryKeyframe.time`. Ré-étendre la fin du clip
    /// re-sépare les deux losanges là où ils ont toujours été — le temps
    /// STOCKÉ fait foi, l'écrêtage n'était qu'un repli d'affichage.
    @Test("Ré-étendre la fin du clip re-sépare les losanges repliés — rien n'avait été perdu, le temps stocké fait foi")
    func keyframes_collapsedByATrim_separateAgainWhenTheBarIsExtended() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "clip", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 2, duration: 5,
                                 keyframes: [StoryKeyframe(id: "kf-over-1", time: 5),
                                             StoryKeyframe(id: "kf-over-2", time: 6)])
            ],
            timelineDuration: Self.slideDuration
        )
        let track = tracks(effects).first
        #expect(track?.bar == .timed(start: 2, end: 7))
        #expect(track?.keyframeTimes == [7, 7],
               "kf-over-2 (absolu 8) reste écrêté à 7 ; kf-over-1 (absolu 7) y tombe de plein droit")

        let extended = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "clip", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 2, duration: 8,
                                 keyframes: [StoryKeyframe(id: "kf-over-1", time: 5),
                                             StoryKeyframe(id: "kf-over-2", time: 6)])
            ],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(extended).first?.keyframeTimes == [7, 8],
               "La collision était réversible : les deux losanges retrouvent leurs abscisses distinctes")
    }

    @Test("Un chip audio décalé projette lui aussi ses losanges en absolu")
    func audioKeyframes_areProjectedOntoTheAbsoluteAxis() {
        let effects = StoryEffects(
            audioPlayerObjects: [
                StoryAudioPlayerObject(id: "aud", postMediaId: "pm-1", startTime: 2, duration: 4,
                                       keyframes: [StoryKeyframe(id: "kf-1", time: 0.5)])
            ],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(effects).first?.keyframeTimes == [2.5])
    }

    @Test("Un clip SANS début explicite pose ses losanges là où son temps relatif les met — l'origine du clip est 0")
    func keyframes_withoutAnExplicitStart_stayAtTheirRelativeTime() {
        let effects = StoryEffects(
            textObjects: [
                StoryTextObject(id: "txt", text: "A", duration: 4,
                                keyframes: [StoryKeyframe(id: "kf-1", time: 1)])
            ],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(effects).first?.keyframeTimes == [1])
    }

    @Test("Un début SANS durée court jusqu'au bout de la slide — c'est un choix, pas un fantôme")
    func timing_withStartButNoDuration_runsToTheEndOfTheSlide() {
        let effects = StoryEffects(
            textObjects: [StoryTextObject(id: "txt", text: "A", startTime: 4)],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(effects).first?.bar == .timed(start: 4, end: Self.slideDuration))
    }

    // MARK: - Pistes fantômes (O4)

    @Test("Un sticker sans timing est FANTÔME — jamais une barre pleine [0, durée]")
    func sticker_withoutTiming_isGhost() {
        let sticker = tracks(composedSlide()).first { $0.id == "stk" }
        #expect(sticker?.bar == .ghost)
        #expect(sticker?.label == "☺")
    }

    @Test("Le fond est une piste du plan bg et, sans timing propre, un fantôme")
    func background_isABackgroundPlaneGhost() {
        let fond = tracks(composedSlide()).first { $0.id == Plan2DLayout.backgroundTrackID }
        #expect(fond?.plane == .bg)
        #expect(fond?.bar == .ghost)
    }

    /// **Une pastille de lieu SANS fenêtre est fantôme — comme un texte sans
    /// fenêtre.** Ce n'était pas la règle écrite : `placeTracks` posait
    /// `bar: .ghost` EN DUR, ce qui rendait le même verdict sur ce cas-ci et un
    /// verdict FAUX sur le suivant.
    @Test("Une pastille de lieu sans fenêtre posée est fantôme, au premier plan")
    func place_withoutAWindow_isAGhost() {
        let effects = StoryEffects(
            locationObjects: [StoryLocationObject(id: "lieu",
                                                  place: SharedPlace(latitude: 48.8, longitude: 2.3,
                                                                     name: "Paris"))],
            timelineDuration: Self.slideDuration
        )
        let lieu = tracks(effects).first
        #expect(lieu?.plane == .fg)
        #expect(lieu?.bar == .ghost)
        #expect(lieu?.label == "◎ Paris")
    }

    /// **Et elle porte une VRAIE barre dès qu'une fenêtre est posée** —
    /// directive porteur 2026-08-31 : « tout `MeeshySceneObject` peut apparaître
    /// et disparaître quand il souhaite, y compris la pastille de lieu ».
    @Test("Une pastille de lieu avec une fenêtre porte une barre, comme un texte")
    func place_withAWindow_carriesATimedBar() {
        var lieu = StoryLocationObject(id: "lieu",
                                       place: SharedPlace(latitude: 48.8, longitude: 2.3,
                                                          name: "Paris"))
        lieu.startTime = 2
        lieu.duration = 3
        let effects = StoryEffects(locationObjects: [lieu], timelineDuration: Self.slideDuration)
        #expect(tracks(effects).first?.bar == .timed(start: 2, end: 5))
    }

    @Test("Le dessin est UNE piste fantôme de premier plan, quel que soit le nombre de traits")
    func drawing_isASingleForegroundGhostTrack() {
        let effects = StoryEffects(
            drawingStrokes: [StoryDrawingStroke(id: "a", colorHex: "FFFFFF", width: 8),
                             StoryDrawingStroke(id: "b", colorHex: "FF0000", width: 4)],
            timelineDuration: Self.slideDuration
        )
        let plan = tracks(effects)
        #expect(plan.count == 1)
        #expect(plan.first?.plane == .fg)
        #expect(plan.first?.bar == .ghost)
    }

    // MARK: - Les deux plans audio (B3.3)

    @Test("Le chip audio tient le plan content ; le son de FOND descend au plan bg")
    func audio_chipIsContent_backgroundSoundIsBg() {
        let effects = StoryEffects(
            audioPlayerObjects: [
                StoryAudioPlayerObject(id: "chip", postMediaId: "pm-1", name: "Voix"),
                StoryAudioPlayerObject(id: "fond", postMediaId: "pm-2", isBackground: true)
            ],
            timelineDuration: Self.slideDuration
        )
        let plan = tracks(effects)
        #expect(plan.map(\.id) == ["chip", "fond"])
        #expect(plan.map(\.plane) == [.content, .bg])
        #expect(plan.first?.label == "♫ Voix")
    }

    @Test("Le fond sonore hérité suit la slide : ses bornes ROGNENT la source, elles ne posent rien sur le plan")
    func legacyBackgroundAudio_isAGhost_neverATimedBar() {
        let effects = StoryEffects(
            backgroundAudioId: "song-1",
            backgroundAudioStart: 2,
            backgroundAudioEnd: 6,
            timelineDuration: Self.slideDuration
        )
        let plan = tracks(effects)
        #expect(plan.count == 1)
        #expect(plan.first?.plane == .bg)
        #expect(plan.first?.bar == .ghost)
    }

    // MARK: - Média porteur contre média de fond

    @Test("Le média porteur tient le plan content, le média de fond le plan bg")
    func media_carrierIsContent_backgroundMediaIsBg() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true),
                StoryMediaObject(id: "porteur", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 0, duration: 4)
            ],
            timelineDuration: Self.slideDuration
        )
        let plan = tracks(effects)
        #expect(plan.map(\.id) == ["porteur", "fond"])
        #expect(plan.map(\.plane) == [.content, .bg])
        #expect(plan.first?.bar == .timed(start: 0, end: 4))
    }

    // MARK: - Le verrou (revue Opus, constat 3 : régression de l'ancien
    // conteneur, `isImmovableBackground` — `StoryTimelineView.swift:631`)

    @Test("Un média de FOND est verrouillé — sa fenêtre est ignorée en lecture, le porteur ne l'est jamais")
    func backgroundMedia_isLocked_carrierIsNot() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true),
                StoryMediaObject(id: "porteur", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 0, duration: 4)
            ],
            timelineDuration: Self.slideDuration
        )
        let plan = tracks(effects)
        #expect(plan.first { $0.id == "fond" }?.isLocked == true)
        #expect(plan.first { $0.id == "porteur" }?.isLocked == false)
    }

    @Test("Un clip SYNTHÉTIQUE (fond image posé par le composer, id préfixé) est verrouillé même sans isBackground")
    func syntheticMedia_isLocked() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "\(StoryComposerViewModel.syntheticTimelineClipIdPrefix)slide-1",
                                 aspectRatio: 1.0, startTime: 0, duration: 4)
            ],
            timelineDuration: Self.slideDuration
        )
        #expect(tracks(effects).first?.isLocked == true)
    }

    @Test("Texte, sticker et audio ne sont jamais verrouillés — seul le média de fond/synthétique l'est")
    func nonMediaTracks_areNeverLocked() {
        #expect(tracks(composedSlide()).allSatisfy { !$0.isLocked })
    }

    // MARK: - L'échelle vient de la durée

    @Test("t=0 ⇒ 0, t=durée ⇒ largeur de piste, et le zoom détaillé double l'échelle")
    func x_mapsTimeOntoTheLane_andDetailDoublesTheScale() {
        #expect(Plan2DLayout.x(forTime: 0, zoom: .fit, laneWidth: 300, slideDuration: 10) == 0)
        #expect(Plan2DLayout.x(forTime: 10, zoom: .fit, laneWidth: 300, slideDuration: 10) == 300)
        #expect(Plan2DLayout.x(forTime: 5, zoom: .fit, laneWidth: 300, slideDuration: 10) == 150)
        #expect(Plan2DLayout.x(forTime: 10, zoom: .detail, laneWidth: 300, slideDuration: 10) == 600)
    }

    @Test("Une slide de durée nulle n'engendre pas de NaN — l'origine tient lieu de repli")
    func x_withoutDuration_staysAtTheOrigin() {
        #expect(Plan2DLayout.x(forTime: 3, zoom: .fit, laneWidth: 300, slideDuration: 0) == 0)
    }

    // MARK: - Rien de structurel

    @Test("Un StoryEffects vide n'a AUCUNE piste — pas de rangée fantôme de structure")
    func emptyEffects_produceNoTrack() {
        #expect(tracks(StoryEffects()).isEmpty)
    }
}
