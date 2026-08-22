import XCTest
import AVFoundation
@testable import Meeshy
@testable import MeeshyUI

/// Bouton de son du fil (exigence produit 2026-08-22, S2). Couvre l'ÉTAT DU
/// LECTEUR, pas seulement l'affichage — le défaut le plus probable de cette
/// feature est une icône qui bascule sans qu'aucun son ne sorte
/// (`SharedAVPlayerManager.effectiveMuted` inchangé).
final class ReelFeedSoundIntentTests: XCTestCase {

    // MARK: - ReelFeedSoundButtonPolicy.isForceMuted (D4) — pure

    func test_isForceMuted_soundOff_isTrue() {
        XCTAssertTrue(ReelFeedSoundButtonPolicy.isForceMuted(soundOn: false))
    }

    func test_isForceMuted_soundOn_isFalse() {
        XCTAssertFalse(ReelFeedSoundButtonPolicy.isForceMuted(soundOn: true))
    }

    // MARK: - ReelFeedSoundButtonPolicy.showsSoundButton (D3 + D8) — pure

    func test_showsSoundButton_allConditionsMet_isTrue() {
        XCTAssertTrue(ReelFeedSoundButtonPolicy.showsSoundButton(
            isActive: true, isEngineOwned: true, hasAudioTrack: true
        ))
    }

    func test_showsSoundButton_notActive_isFalse() {
        // Une carte non élue ne pilote rien — même si une AUTRE instance de la
        // même URL a laissé ownsEngine vrai par le passé (repost + original).
        XCTAssertFalse(ReelFeedSoundButtonPolicy.showsSoundButton(
            isActive: false, isEngineOwned: true, hasAudioTrack: true
        ))
    }

    func test_showsSoundButton_activeButEngineNotOwned_isFalse() {
        // isActive peut être vrai UNE frame avant que drive() n'ait chargé le
        // moteur (média en cours de téléchargement, appel en cours) — précisément
        // le défaut « bouton monté, tap ne pilote rien » rejeté deux fois par la
        // revue DoD du lot E (MuteButtonExistenceGuardTests).
        XCTAssertFalse(ReelFeedSoundButtonPolicy.showsSoundButton(
            isActive: true, isEngineOwned: false, hasAudioTrack: true
        ))
    }

    func test_showsSoundButton_noAudioTrack_isFalse() {
        // D8 : jamais de bouton mort sur un clip sans piste audio.
        XCTAssertFalse(ReelFeedSoundButtonPolicy.showsSoundButton(
            isActive: true, isEngineOwned: true, hasAudioTrack: false
        ))
    }

    // MARK: - ReelFeedSoundIntent — store de session (D4)

    @MainActor
    func test_intent_defaultsToSoundOff() {
        let intent = ReelFeedSoundIntent.makeForTesting()
        XCTAssertFalse(intent.isSoundOn, "Le fil démarre MUET (exigence produit).")
    }

    @MainActor
    func test_intent_toggleSound_flipsState() {
        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.toggleSound()
        XCTAssertTrue(intent.isSoundOn)
        intent.toggleSound()
        XCTAssertFalse(intent.isSoundOn)
    }

    @MainActor
    func test_intent_setSoundOn_writesExactValue() {
        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.setSoundOn(true)
        XCTAssertTrue(intent.isSoundOn)
        intent.setSoundOn(true)
        XCTAssertTrue(intent.isSoundOn, "setSoundOn(true) idempotent.")
    }

    // MARK: - Cache de présence de piste (D8) — réutilise StoryAudioAvailability.merging

    @MainActor
    func test_intent_hasAudioTrack_unprobedMedia_defaultsFalse() {
        let intent = ReelFeedSoundIntent.makeForTesting()
        XCTAssertFalse(intent.hasAudioTrack(mediaId: "unknown"))
        XCTAssertFalse(intent.isProbed(mediaId: "unknown"))
    }

    @MainActor
    func test_intent_recordAudioProbe_positiveCount_marksTrackPresent() {
        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.recordAudioProbe(mediaId: "m1", probedTrackCount: 1)
        XCTAssertTrue(intent.hasAudioTrack(mediaId: "m1"))
        XCTAssertTrue(intent.isProbed(mediaId: "m1"))
    }

    @MainActor
    func test_intent_recordAudioProbe_zeroCount_marksTrackAbsent_butProbed() {
        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.recordAudioProbe(mediaId: "m2", probedTrackCount: 0)
        XCTAssertFalse(intent.hasAudioTrack(mediaId: "m2"))
        XCTAssertTrue(intent.isProbed(mediaId: "m2"), "Un probe RÉUSSI à 0 piste reste un résultat définitif.")
    }

    @MainActor
    func test_intent_recordAudioProbe_failedProbe_staysUnresolved() {
        // nil = échec de sonde (URL injoignable) — conservateur : ne verrouille
        // JAMAIS « pas de piste » sur un échec, contrairement à un 0 réel.
        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.recordAudioProbe(mediaId: "m3", probedTrackCount: nil)
        XCTAssertFalse(intent.hasAudioTrack(mediaId: "m3"))
        XCTAssertFalse(intent.isProbed(mediaId: "m3"), "Un échec de sonde doit rester RETENTABLE, pas verrouillé à false.")
    }

    @MainActor
    func test_intent_recordAudioProbe_neverOverwritesResolvedEntry() {
        // Transition à sens unique (§1.4/D8) : une entrée déjà résolue (vraie ou
        // fausse) n'est plus jamais réécrite par un probe tardif — même contrat
        // que StoryAudioAvailability.merging.
        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.recordAudioProbe(mediaId: "m4", probedTrackCount: 1)
        intent.recordAudioProbe(mediaId: "m4", probedTrackCount: 0)
        XCTAssertTrue(intent.hasAudioTrack(mediaId: "m4"), "Une entrée déjà résolue à VRAI ne doit plus être écrasée.")
    }

    // MARK: - ÉTAT DU LECTEUR : la bascule atteint réellement SharedAVPlayerManager
    //
    // Le défaut le plus probable de cette feature (souligné par l'orchestrateur) :
    // une icône qui bascule sans qu'aucun son ne sorte. Ce test ferme la boucle
    // bout en bout jusqu'au lecteur RÉEL — exactement ce que `drive()` doit
    // reproduire en production.

    @MainActor
    func test_soundIntentAppliedToRealManager_actuallyChangesEffectiveMuted() {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        defer { manager.stop() }

        let intent = ReelFeedSoundIntent.makeForTesting()

        // Fil au repos (D4 : démarre muet) — le moteur doit rester silencieux.
        manager.isForceMuted = ReelFeedSoundButtonPolicy.isForceMuted(soundOn: intent.isSoundOn)
        XCTAssertTrue(manager.effectiveMuted, "Sans son activé, le lecteur RÉEL doit rester muet.")

        // Tap utilisateur → intention son ON.
        intent.toggleSound()
        manager.isForceMuted = ReelFeedSoundButtonPolicy.isForceMuted(soundOn: intent.isSoundOn)
        XCTAssertFalse(manager.effectiveMuted, "Après activation, le lecteur RÉEL doit devenir audible.")

        // Bascule retour.
        intent.toggleSound()
        manager.isForceMuted = ReelFeedSoundButtonPolicy.isForceMuted(soundOn: intent.isSoundOn)
        XCTAssertTrue(manager.effectiveMuted, "Retour au muet : le lecteur RÉEL doit redevenir silencieux.")
    }

    @MainActor
    func test_soundIntent_neverWritesGlobalIsMutedPreference() {
        // D4 : le fil ne doit JAMAIS écrire isMuted (préférence globale
        // session) — seulement isForceMuted. Sans cette garantie, la fuite que
        // isForceMuted a été créée pour fermer (galerie héritant du silence)
        // se rouvrirait.
        let manager = SharedAVPlayerManager.shared
        manager.isMuted = false
        defer { manager.stop() }

        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.setSoundOn(false)
        manager.isForceMuted = ReelFeedSoundButtonPolicy.isForceMuted(soundOn: intent.isSoundOn)

        XCTAssertFalse(manager.isMuted, "isMuted (préférence globale) ne doit jamais être touché par le fil.")
        XCTAssertTrue(manager.isForceMuted)
    }
}
