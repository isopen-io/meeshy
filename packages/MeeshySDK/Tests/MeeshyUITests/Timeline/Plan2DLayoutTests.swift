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

    @Test("Un texte à start 1 / durée 3 occupe [1, 4] et porte ses deux losanges")
    func text_barSpansStartPlusDuration_andCarriesItsKeyframeTimes() {
        let text = tracks(composedSlide()).first { $0.id == "txt" }
        #expect(text?.bar == .timed(start: 1, end: 4))
        #expect(text?.keyframeTimes == [1, 2])
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
        #expect(text?.keyframes.map(\.time) == [1, 2])
        #expect(text?.keyframeTimes == [1, 2])
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

    @Test("Une pastille de lieu est hors timeline : toujours fantôme, au premier plan")
    func place_isAlwaysAGhost() {
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
