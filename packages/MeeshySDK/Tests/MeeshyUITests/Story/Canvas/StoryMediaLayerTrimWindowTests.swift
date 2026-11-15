import XCTest
import MeeshySDK
@testable import MeeshyUI

/// `StoryMediaLayer.trimmedSeekTarget(bounds:slidePlayheadSeconds:mediaStartTime:)`
/// — la conversion PURE playhead-de-slide → seconde-DANS-LA-SOURCE que
/// `alignToTimelineThenPlay()` (démarrage foreground) et
/// `alignPausedToSlidePlayhead()` (scrub) utilisent pour démarrer un média
/// rogné à `bounds.start` (jamais zéro) sans jamais dépasser `bounds.end`.
/// Éprouvable sans `AVAsset` ni simulateur — même famille que
/// `shouldSeekToAlign` (`StoryMediaLayer_StartAlignedTests`), qui couvre déjà
/// le seuil de dérive UNE FOIS la cible connue ; ce fichier couvre le calcul
/// de la cible elle-même.
///
/// Issue #4082 — `StoryMediaObject.sourceStart`/`.sourceEnd` existaient déjà
/// côté modèle (migration de canvas, `MediaTrimRule.swift`) mais n'étaient
/// consommés par aucun lecteur vidéo.
@MainActor
final class StoryMediaLayerTrimWindowTests: XCTestCase {

    // MARK: - `nil` ⇒ comportement d'aujourd'hui, préservé bit à bit

    func test_trimmedSeekTarget_nilBounds_matchesUntrimmedFormula() {
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: nil, slidePlayheadSeconds: 12, mediaStartTime: 4)
        XCTAssertEqual(target, 8, "Sans fenêtre, la cible reste max(0, playhead − startTime) — comportement existant")
    }

    func test_trimmedSeekTarget_nilBounds_neverNegative() {
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: nil, slidePlayheadSeconds: 1, mediaStartTime: 10)
        XCTAssertEqual(target, 0, "Un playhead avant le début du média ne doit jamais produire une cible négative")
    }

    // MARK: - Fenêtre nominale : l'origine du média glisse à `bounds.start`

    func test_trimmedSeekTarget_nominalWindow_startsAtBoundsStart_notZero() {
        let bounds = MediaTrimBounds(start: 12, end: 18)
        // Playhead == mediaStartTime : le média vient tout juste d'apparaître
        // sur la slide. La cible DOIT être bounds.start, jamais 0 — 0 serait la
        // portion COUPÉE du fichier.
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: bounds, slidePlayheadSeconds: 4, mediaStartTime: 4)
        XCTAssertEqual(target, 12, "Un média rogné démarre à bounds.start, jamais à zéro")
    }

    func test_trimmedSeekTarget_nominalWindow_addsElapsedToBoundsStart() {
        let bounds = MediaTrimBounds(start: 12, end: 18)
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: bounds, slidePlayheadSeconds: 6.5, mediaStartTime: 4)
        XCTAssertEqual(target, 14.5, "2.5s écoulées sur la slide ⇒ bounds.start + 2.5")
    }

    // MARK: - La cible ne dépasse jamais `bounds.end`

    func test_trimmedSeekTarget_lateResume_clampsToBoundsEnd() {
        let bounds = MediaTrimBounds(start: 12, end: 18)
        // Un resume très tardif (dérive réseau, arrivée tardive) ne doit
        // jamais demander une seconde AU-DELÀ de la fenêtre — ce serait relire
        // la portion coupée en fin de fichier, ou faire échouer le seek.
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: bounds, slidePlayheadSeconds: 100, mediaStartTime: 4)
        XCTAssertEqual(target, 18, "La cible est plafonnée à bounds.end")
    }

    // MARK: - Playhead avant l'apparition du média sur la slide

    func test_trimmedSeekTarget_playheadBeforeMediaStart_clampsToBoundsStart() {
        let bounds = MediaTrimBounds(start: 12, end: 18)
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: bounds, slidePlayheadSeconds: 1, mediaStartTime: 4)
        XCTAssertEqual(target, 12, "Élapsé négatif borné à 0 ⇒ la cible reste l'origine de la fenêtre")
    }

    // MARK: - Fenêtre minuscule (mais valide) : pas de dépassement par arrondi

    func test_trimmedSeekTarget_tinyWindow_staysWithinBounds() {
        let bounds = MediaTrimBounds(start: 0.4, end: 0.8)
        let target = StoryMediaLayer.trimmedSeekTarget(bounds: bounds, slidePlayheadSeconds: 10, mediaStartTime: 0)
        XCTAssertEqual(target, 0.8, "Même très en retard, la cible ne dépasse jamais bounds.end")
    }
}
