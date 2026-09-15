import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **#6580 / D2 — `backgroundAudioStart/End` ROGNENT la source.**
///
/// `StoryEffects.resolvedBackgroundAudio` synthétise l'objet audio de fond du
/// corpus LEGACY (aucun `audioPlayerObjects` porteur du flag). Elle posait
/// `backgroundAudioStart → startTime` — un offset sur la TIMELINE — et laissait
/// `sourceStart`/`sourceEnd` à `nil`. Résultat à la lecture : `start` secondes
/// de SILENCE, puis le fichier joué DEPUIS ZÉRO. Ce n'est pas ce que ces bornes
/// veulent dire, et trois sites du dépôt le disent :
///
/// - `Plan2DLayout.legacyBackgroundSoundTrack` l'écrit en toutes lettres —
///   « `backgroundAudioStart/End` ROGNENT la source — ce ne sont pas des bornes
///   sur le plan » — et c'est pourquoi sa piste est fantôme ;
/// - `CanvasV3Migration` les transporte en `BackgroundSoundV3.Bounds`, la
///   fenêtre de rognage du fil v3, et les restaure symétriquement ;
/// - `StoryComposerView+SyncRestore` les lit en `audioTrimStart`.
///
/// Un seul site disait l'inverse : celui qui décide de ce qu'on ENTEND.
@MainActor
final class LegacyBackgroundAudioBoundsTests: XCTestCase {

    private func legacyEffects(start: TimeInterval?, end: TimeInterval?) -> StoryEffects {
        var effects = StoryEffects()
        effects.backgroundAudioId = "media-bg-1"
        effects.backgroundAudioVolume = 0.5
        effects.backgroundAudioStart = start
        effects.backgroundAudioEnd = end
        return effects
    }

    // MARK: - Non-régression : aucune borne déclarée ⇒ identique à l'octet

    func test_resolvedBackgroundAudio_withoutAnyBound_isUnchanged() {
        let resolved = legacyEffects(start: nil, end: nil).resolvedBackgroundAudio
        XCTAssertEqual(resolved?.id, "legacy-bg-audio")
        XCTAssertEqual(resolved?.postMediaId, "media-bg-1")
        XCTAssertEqual(resolved?.volume, 0.5)
        XCTAssertEqual(resolved?.isBackground, true)
        XCTAssertEqual(resolved?.loop, true)
        XCTAssertNil(resolved?.startTime, "Aucune borne ⇒ aucun offset timeline, comme avant")
        XCTAssertNil(resolved?.duration)
        XCTAssertNil(resolved?.sourceStart)
        XCTAssertNil(resolved?.sourceEnd,
                     "Sans intention de rognage déclarée, le clip reste la source entière")
    }

    func test_resolvedBackgroundAudio_withoutBackgroundAudioId_staysNil() {
        var effects = StoryEffects()
        effects.backgroundAudioStart = 2
        XCTAssertNil(effects.resolvedBackgroundAudio,
                     "Pas d'identifiant de fond ⇒ rien à synthétiser, bornes ou pas")
    }

    // MARK: - Le défaut : les bornes rognent la SOURCE

    func test_resolvedBackgroundAudio_declaredBounds_trimTheSourceNotTheTimeline() {
        let resolved = legacyEffects(start: 2, end: 10).resolvedBackgroundAudio
        XCTAssertEqual(resolved?.sourceStart, 2,
                       "backgroundAudioStart est un point d'entrée DANS LA SOURCE")
        XCTAssertEqual(resolved?.sourceEnd, 10,
                       "backgroundAudioEnd est un point de sortie DANS LA SOURCE")
        XCTAssertNil(resolved?.startTime,
                     "Rien ne dit que ce fond commence en retard sur la slide — il jouait "
                     + "2 s de silence avant de repartir du début du fichier")
        XCTAssertEqual(resolved?.duration, 8, "La fenêtre occupe 10 − 2 = 8 s")
    }

    // MARK: - Une seule borne, ou un intervalle inversé

    func test_resolvedBackgroundAudio_startOnly_trimsTheSourceHead() {
        let resolved = legacyEffects(start: 3, end: nil).resolvedBackgroundAudio
        XCTAssertEqual(resolved?.sourceStart, 3)
        XCTAssertNil(resolved?.sourceEnd, "Sans fin déclarée, la fenêtre court jusqu'au bout")
        XCTAssertNil(resolved?.duration, "Une durée ne se fabrique pas sans les deux bornes")
        XCTAssertNil(resolved?.startTime)
    }

    func test_resolvedBackgroundAudio_invertedBounds_keepThemRawAndDeclareNoDuration() {
        // La fenêtre aberrante est rejetée EN AVAL par
        // `MediaTrimRule` / `TimelineAudioWindow.segment`, qui replie sur la
        // source entière — jamais sur un silence. Ici on vérifie seulement
        // qu'aucune durée n'est inventée.
        let resolved = legacyEffects(start: 10, end: 2).resolvedBackgroundAudio
        XCTAssertNil(resolved?.duration)
        XCTAssertNil(resolved?.startTime)
    }
}
