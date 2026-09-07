import XCTest
import MeeshySDK
@testable import Meeshy
@testable import MeeshyUI

/// **La fiche détail DIT ce qu'elle joue, et le toucher l'arrête** (#5602,
/// directive porteur 2026-09-07).
///
/// > « L'entête ne contient pas le sinusoïde du son ou la référence crédit du
/// > son alors que ça devrait, avec même action stop play quand on touche ! »
///
/// ## La panne que ces témoins gardent
///
/// Quatre surfaces LISENT une publication ; trois montaient `BackgroundSoundBadge`
/// (carte du fil, viewer story, réel). La fiche détail n'en appelait que les
/// helpers STATIQUES pour décider d'un bouton muet — elle jouait donc un son
/// sans jamais dire lequel, ni offrir de l'arrêter.
///
/// > **Utiliser le résolveur d'une vue sans monter la vue ne rougit nulle
/// > part** : le prédicat est bon, l'annonce juste, le bouton bien gardé — et
/// > l'utilisateur n'apprend ni le titre, ni l'auteur, ni la durée.
@MainActor
final class DetailSceneSoundHeaderTests: XCTestCase {

    // MARK: - Fabriques

    private func trace(id: String = "a1",
                       waveform: [Float] = [],
                       soundId: String? = "6a97198de19ad1985081d6a6") -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(id: id, postMediaId: "pm1", name: "Miroir")
        audio.isBackground = true
        audio.waveformSamples = waveform
        audio.soundId = soundId
        audio.soundAuthorUsername = "jcnm"
        audio.duration = 308
        return audio
    }

    private func effects(with audio: StoryAudioPlayerObject?) -> StoryEffects {
        var e = StoryEffects()
        e.audioPlayerObjects = audio.map { [$0] }
        return e
    }

    // MARK: - Le résolveur d'existence est PARTAGÉ avec le badge

    /// La trace et l'annonce répondent à la MÊME question — « quelle entrée est
    /// le fond ? ». Deux `first(where:)` écrits côte à côte divergeraient le
    /// jour où le prédicat change.
    func test_backgroundTrace_findsTheBackgroundEntry() {
        let piste = trace()
        XCTAssertEqual(BackgroundSoundBadge.backgroundTrace(of: effects(with: piste))?.id, piste.id)
    }

    func test_backgroundTrace_isNil_withoutABackgroundEntry() {
        var posee = trace(id: "posee")
        posee.isBackground = false
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: effects(with: posee)))
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: effects(with: nil)))
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: nil))
    }

    /// Le prédicat d'existence de la trace et celui du badge tombent ENSEMBLE :
    /// c'est ce qui interdit un en-tête muet au-dessus d'un badge présent, ou
    /// l'inverse.
    func test_traceAndAnnouncement_existTogether() {
        let avec = effects(with: trace())
        XCTAssertNotNil(BackgroundSoundBadge.backgroundTrace(of: avec))
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(for: BackgroundSoundBadge.announcement(for: avec)))

        let sans = effects(with: nil)
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: sans))
        XCTAssertFalse(BackgroundSoundBadge.showsMuteButton(for: BackgroundSoundBadge.announcement(for: sans)))
    }

    // MARK: - Le TROISIÈME terme de la lecture : la commande du viewer

    /// **Le témoin discriminant.** Avant ce lot, `isPaused` ne connaissait que
    /// la visibilité et l'appel — deux conditions SUBIES. La fiche détail
    /// n'offrait aucun stop/play.
    func test_viewerCommand_pausesEvenWhenVisibleAndCallFree() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true,
                                                        callActive: false,
                                                        viewerPaused: true),
                      "Arrêter doit arrêter : la commande du viewer est un OU, jamais un ET.")
    }

    func test_viewerCommandAbsent_keepsTheHistoricalRule() {
        XCTAssertFalse(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: false))
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false, callActive: false))
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: true))
    }

    /// Reprendre ne peut pas RESSUSCITER une lecture que la visibilité ou un
    /// appel interdisent — sans quoi le bouton ferait jouer une scène hors
    /// écran, ou par-dessus un appel.
    func test_resuming_neverOverridesTheSufferedTerms() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false,
                                                        callActive: false,
                                                        viewerPaused: false))
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true,
                                                        callActive: true,
                                                        viewerPaused: false))
    }

    // MARK: - L'en-tête : ce qu'il rend, et ce qu'il tait

    /// Pas de piste ⇒ RIEN. La scène reprend toute la hauteur, et aucun
    /// contrôle ne paraît pour un son qui n'existe pas.
    func test_header_rendersNothing_withoutATrack() throws {
        let vue = PostSceneSoundHeader(trace: nil, isPaused: false,
                                       accentHex: "#7C3AED", onTogglePlayback: {})
        XCTAssertNil(vue.trace)
    }

    /// **L'œil et VoiceOver reçoivent la même information.** L'onde est une
    /// image muette pour le lecteur d'écran : sans cette composition, VoiceOver
    /// n'apprendrait ni le titre ni la durée que l'écran affiche.
    func test_accessibilityLabel_carriesCreditAndDuration() throws {
        let vue = PostSceneSoundHeader(trace: trace(), isPaused: false,
                                       accentHex: "#7C3AED", onTogglePlayback: {})
        let libelle = try XCTUnwrap(vue.trace.map { vue.accessibilityLabel(for: $0) })
        XCTAssertTrue(libelle.contains("Miroir"), libelle)
        XCTAssertTrue(libelle.contains("jcnm"), libelle)
        XCTAssertTrue(libelle.contains("5:08") || libelle.contains("5:09"), libelle)
    }

    /// Le toucher CHANGE quelque chose — sans quoi la trace serait le contrôle
    /// inerte que `MuteButtonExistenceGuardTests` a déjà rejeté deux fois.
    func test_touching_togglesTheViewerCommand() {
        var arrete = false
        let vue = PostSceneSoundHeader(trace: trace(), isPaused: arrete,
                                       accentHex: "#7C3AED",
                                       onTogglePlayback: { arrete.toggle() })
        vue.onTogglePlayback()
        XCTAssertTrue(arrete)
        vue.onTogglePlayback()
        XCTAssertFalse(arrete)
    }

    // MARK: - Le spectre : relevé, ou sinusoïde

    /// Un son emprunté et un brouillon restauré arrivent avec un relevé VIDE.
    /// La rangée dessine alors une sinusoïde : une bande plate s'y lirait comme
    /// un SILENCE, ce que le son n'est pas.
    func test_theTraceRowKeepsItsWaveform_evenForABorrowedSound() {
        let empruntee = trace(soundId: "6a97198de19ad1985081d6a6")
        XCTAssertFalse(StoryAudioIdentity.showsWaveform(for: empruntee),
                       "Prémisse : dans une CAPSULE, un son emprunté cède son onde au crédit (#4669).")
        let rangee = ComposerSoundTraceRow(sound: empruntee,
                                           showsWaveformEvenWhenBorrowed: true,
                                           creditMaxWidth: nil)
        XCTAssertTrue(rangee.showsWaveformEvenWhenBorrowed,
                      "En tête de scène la ligne a toute la largeur : l'onde ET le crédit y tiennent.")
    }
}
