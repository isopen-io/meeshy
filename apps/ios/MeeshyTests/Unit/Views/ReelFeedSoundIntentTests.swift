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

    // MARK: - ReelFeedSoundButtonPolicy.apply(soundOn:to:) — double
    //
    // Correctif DoD S2 rejet, constat majeur #1 : `drive()` recomposait
    // séparément un `let forceMuted = isForceMuted(soundOn:)` puis une
    // affectation `manager.isForceMuted = forceMuted` — la mutation M5
    // (retrait de la seule affectation, prédicat conservé) laissait la
    // fonctionnalité MORTE sans qu'aucun test ne rougisse. `apply` est
    // désormais le SEUL point d'écriture ; ce test verrouille la valeur
    // ÉCRITE sur un double, indépendamment de tout accès au singleton réel.

    private final class SpyFeedPlayer: FeedMutablePlayer {
        var isMuted = false
        var isForceMuted = false
        var effectiveMuted: Bool { isMuted || isForceMuted }
    }

    @MainActor
    func test_apply_soundOff_forceMutesAndLeavesGlobalMuteUntouched() {
        let player = SpyFeedPlayer()
        player.isMuted = false
        ReelFeedSoundButtonPolicy.apply(soundOn: false, to: player)
        XCTAssertTrue(player.isForceMuted)
        XCTAssertFalse(player.isMuted, "soundOn: false ne doit JAMAIS écrire isMuted — seul isForceMuted porte le silence du fil.")
    }

    @MainActor
    func test_apply_soundOn_clearsForceMuteAndGlobalMute_evenWhenGlobalMuteWasTrue() {
        // Correctif DoD S2 rejet, constat majeur #2 : `isMuted` peut avoir été
        // laissé à `true` par une AUTRE surface (bouton mute de la galerie de
        // conversation) — `cleanup()` ne le remet délibérément PAS à zéro.
        // Sans clarifier `isMuted` ici, `effectiveMuted` resterait vrai après
        // activation : le bouton bascule une icône, aucun son ne sort.
        let player = SpyFeedPlayer()
        player.isMuted = true
        player.isForceMuted = true
        ReelFeedSoundButtonPolicy.apply(soundOn: true, to: player)
        XCTAssertFalse(player.isForceMuted)
        XCTAssertFalse(player.isMuted)
        XCTAssertFalse(player.effectiveMuted, "Après activation, le lecteur DOIT devenir audible même si isMuted valait déjà true.")
    }

    // MARK: - ReelFeedSoundButtonPolicy.apply(soundOn:to:) — SharedAVPlayerManager RÉEL
    //
    // Le double ci-dessus prouve que `apply` écrit la bonne valeur ; ce test
    // ferme la boucle jusqu'au singleton de PRODUCTION — le chemin exact que
    // `drive()` emprunte. Isolation (correctif DoD S2 rejet, constat mineur
    // #5) : `isMuted` et `isForceMuted` sont explicitement remis à `false`
    // en ENTRÉE et en `defer`, `cleanup()` (via `stop()`) ne remettant
    // délibérément PAS `isMuted` à zéro — un test antérieur du même process
    // qui le laisserait à `true` ferait échouer celui-ci sans cette garde.

    @MainActor
    func test_apply_appliedToRealManager_actuallyChangesEffectiveMuted() {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        manager.isMuted = false
        manager.isForceMuted = false
        defer {
            manager.stop()
            manager.isMuted = false
            manager.isForceMuted = false
        }

        let intent = ReelFeedSoundIntent.makeForTesting()

        // Fil au repos (D4 : démarre muet) — le moteur doit rester silencieux.
        ReelFeedSoundButtonPolicy.apply(soundOn: intent.isSoundOn, to: manager)
        XCTAssertTrue(manager.effectiveMuted, "Sans son activé, le lecteur RÉEL doit rester muet.")

        // Tap utilisateur → intention son ON.
        intent.toggleSound()
        ReelFeedSoundButtonPolicy.apply(soundOn: intent.isSoundOn, to: manager)
        XCTAssertFalse(manager.effectiveMuted, "Après activation, le lecteur RÉEL doit devenir audible.")

        // Bascule retour.
        intent.toggleSound()
        ReelFeedSoundButtonPolicy.apply(soundOn: intent.isSoundOn, to: manager)
        XCTAssertTrue(manager.effectiveMuted, "Retour au muet : le lecteur RÉEL doit redevenir silencieux.")
    }

    @MainActor
    func test_apply_appliedToRealManager_unmutesEvenWhenGlobalIsMutedWasLeftTrueByAnotherSurface() {
        // Reproduction directe du constat majeur #2 de la revue DoD : couper
        // le son d'une vidéo dans la galerie (VideoTransportControls.muteButton)
        // laisse `isMuted == true` — jamais remis à zéro par `cleanup()`, par
        // conception. Revenir au fil et activer son bouton DOIT rendre le
        // lecteur RÉEL audible malgré cela.
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        manager.isForceMuted = false
        defer {
            manager.stop()
            manager.isMuted = false
            manager.isForceMuted = false
        }
        manager.isMuted = true // laissé par la galerie de conversation

        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.setSoundOn(true)
        ReelFeedSoundButtonPolicy.apply(soundOn: intent.isSoundOn, to: manager)

        XCTAssertFalse(manager.effectiveMuted, "L'icône affiche « son actif » : le lecteur doit vraiment l'être, même si isMuted valait true.")
        XCTAssertTrue(SharedAVPlayerManager.shouldDuckOthersOnPlay(effectiveMuted: manager.effectiveMuted), "play() doit armer .duckOthers pour cette vidéo désormais audible.")
    }

    @MainActor
    func test_apply_soundOff_neverForcesGlobalIsMutedToTrue() {
        // Direction opposée : couper le son du FIL ne doit jamais écrire
        // isMuted (préférence globale) — seulement isForceMuted, sous peine
        // de rouvrir la fuite documentée (galerie héritant du silence du feed).
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        manager.isMuted = false
        manager.isForceMuted = false
        defer {
            manager.stop()
            manager.isMuted = false
            manager.isForceMuted = false
        }

        let intent = ReelFeedSoundIntent.makeForTesting()
        intent.setSoundOn(false)
        ReelFeedSoundButtonPolicy.apply(soundOn: intent.isSoundOn, to: manager)

        XCTAssertFalse(manager.isMuted, "isMuted (préférence globale) ne doit jamais être touché en direction ON par le fil.")
        XCTAssertTrue(manager.isForceMuted)
    }

}
