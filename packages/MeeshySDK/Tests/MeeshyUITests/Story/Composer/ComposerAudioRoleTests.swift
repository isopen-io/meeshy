import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **#4483 — l'auteur choisit si un son joue en FOND ou au PREMIER PLAN.**
///
/// La règle automatique (« le premier son d'une scène qui n'en a pas devient le
/// fond ») reste le défaut. Ce qui change est qu'elle devient contredisable.
///
/// La doctrine du composer affirmait qu'« une note vocale n'est JAMAIS un fond
/// audio », au motif qu'un fond allume le crédit de son. Elle confondait deux
/// champs orthogonaux : le CRÉDIT tient à `soundId` (posé par le seul
/// `addBorrowedSound`), le MIXAGE à `isBackground`. Un vocal mis en fond porte
/// donc `isBackground = true` et `soundId = nil` — le bon mixage, sans ligne de
/// crédit mensongère.
@MainActor
final class ComposerAudioRoleTests: XCTestCase {

    // MARK: - Le choix de l'auteur gagne sur la règle automatique

    func test_choisirLeFond_gagneMemeQuandLaSceneEnADejaUn() {
        XCTAssertEqual(
            ComposerAudioPlacement.isBackground(chosen: .background,
                                                sceneAlreadyHasBackgroundAudio: true),
            true,
            "l'auteur a demandé le fond : la règle automatique ne doit pas le lui refuser"
        )
    }

    func test_choisirLePremierPlan_nePoseJamaisUnFond() {
        for dejaUnFond in [true, false] {
            XCTAssertNotEqual(
                ComposerAudioPlacement.isBackground(chosen: .foreground,
                                                    sceneAlreadyHasBackgroundAudio: dejaUnFond),
                true
            )
        }
    }

    /// **Ne rien choisir n'est pas choisir le premier plan.** Sans choix, la
    /// règle d'origine s'applique mot pour mot — c'est ce qui garantit qu'aucun
    /// appelant existant ne change de comportement.
    func test_sansChoix_laRegleAutomatiqueSappliqueMotPourMot() {
        for dejaUnFond in [true, false] {
            XCTAssertEqual(
                ComposerAudioPlacement.isBackground(chosen: nil,
                                                    sceneAlreadyHasBackgroundAudio: dejaUnFond),
                ComposerAudioPlacement.isBackground(sceneAlreadyHasBackgroundAudio: dejaUnFond)
            )
        }
    }

    // MARK: - Un seul fond par slide

    func test_promouvoirUnSon_retrogradeCeluiQuiLetait() {
        let composer = makeComposerWithTwoSounds()
        let ids = composer.currentEffects.audioPlayerObjects!.map(\.id)

        composer.setAudioRole(id: ids[1], role: .background)

        let audios = composer.currentEffects.audioPlayerObjects!
        XCTAssertEqual(audios.filter { $0.isBackground == true }.count, 1,
                       "une slide ne porte qu'UN fond")
        XCTAssertEqual(audios.first(where: { $0.id == ids[1] })?.isBackground, true)
        XCTAssertNotEqual(audios.first(where: { $0.id == ids[0] })?.isBackground, true,
                          "l'ancien fond redevient un objet — il ne disparaît pas")
    }

    /// Le son rétrogradé doit rester DANS la scène : rétrograder n'est pas
    /// supprimer.
    func test_leSonRetrograde_resteSurLaScene() {
        let composer = makeComposerWithTwoSounds()
        let ids = composer.currentEffects.audioPlayerObjects!.map(\.id)

        composer.setAudioRole(id: ids[1], role: .background)

        XCTAssertEqual(composer.currentEffects.audioPlayerObjects?.count, 2)
    }

    // MARK: - `false` n'est pas `nil`, et ici la nuance décide

    /// **Le témoin de la RÉSURRECTION.** `resolvedBackgroundAudio` ne consulte
    /// le fond legacy (`backgroundAudioId`) QUE si tous les objets audio sont à
    /// `nil` — « l'auteur n'a rien dit ». Rétrograder vers `nil` ferait donc
    /// revivre un fond que personne n'a redemandé. Ce témoin tombe si le code
    /// écrit `nil` au lieu de `false`.
    func test_retrograderNeFaitPasRevivreUnAncienFondLegacy() {
        let composer = StoryComposerViewModel()
        var effets = composer.currentEffects
        effets.backgroundAudioId = "legacy-sound-id"
        effets.audioPlayerObjects = [makeAudio(id: "a", isBackground: true)]
        composer.currentEffects = effets

        composer.setAudioRole(id: "a", role: .foreground)

        XCTAssertNil(
            composer.currentEffects.resolvedBackgroundAudio,
            "après un passage au premier plan, la scène n'a plus de fond — l'ancien fond legacy ne doit PAS ressusciter"
        )
    }

    /// **Et le symétrique, qui protège le legacy.** Choisir « premier plan » sur
    /// un son qui l'est DÉJÀ ne doit rien changer : y écrire `false` éteindrait
    /// le fond legacy d'une slide qui s'en sert, alors que l'auteur n'a pas
    /// touché à ce son-là.
    func test_choisirLePremierPlanSurUnSonQuiLestDeja_neTouchePasAuFondLegacy() {
        let composer = StoryComposerViewModel()
        var effets = composer.currentEffects
        effets.backgroundAudioId = "legacy-sound-id"
        effets.audioPlayerObjects = [makeAudio(id: "a", isBackground: nil)]
        composer.currentEffects = effets

        composer.setAudioRole(id: "a", role: .foreground)

        XCTAssertNotNil(
            composer.currentEffects.resolvedBackgroundAudio,
            "le fond legacy doit survivre — l'auteur n'a rien dit sur LUI"
        )
    }

    // MARK: - Ce que le sélecteur montre coché

    func test_leRoleLu_estCeluiQuiEstEcrit() {
        let composer = StoryComposerViewModel()
        var effets = composer.currentEffects
        effets.audioPlayerObjects = [makeAudio(id: "fond", isBackground: true),
                                     makeAudio(id: "objet", isBackground: false)]
        composer.currentEffects = effets

        XCTAssertEqual(composer.audioRole(id: "fond"), .background)
        XCTAssertEqual(composer.audioRole(id: "objet"), .foreground)
    }

    // MARK: - Fabriques

    // MARK: - Le rôle VOYAGE jusqu'au modèle

    /// **La règle juste ne sert à rien si l'argument n'arrive pas.** Les trois
    /// tests ci-dessus interrogent la règle PURE ; celui-ci suit le rôle depuis
    /// le site d'appel jusqu'au champ écrit sur l'objet posé. C'est le maillon
    /// qui a cassé aujourd'hui : `addAudioObject` a gagné un paramètre, et deux
    /// jumelles (l'exigence du protocole, la doublure de test) sont restées en
    /// arrière sans que la règle, elle, ait bougé d'un pouce.
    func test_leRoleVoyageJusquauModele_quandLeSonEstPose() {
        let composer = makeComposerWithTwoSounds()

        let pose = composer.addAudioObject(role: .background)

        XCTAssertNotNil(pose)
        let ecrit = composer.currentEffects.audioPlayerObjects?.first { $0.id == pose?.id }
        XCTAssertEqual(ecrit?.isBackground, true,
                       "la scène avait DÉJÀ un fond : sans le rôle, la règle automatique aurait "
                       + "posé ce son au premier plan. Lire `true` prouve que le choix est arrivé.")
    }

    /// Le témoin est écrit sur un rang AUTRE que le nominal : ici la scène a
    /// déjà un fond, donc « avec rôle » et « sans rôle » rendent des verdicts
    /// OPPOSÉS. Sur une scène vide les deux rendraient `true` et le témoin ne
    /// pourrait pas tomber.
    func test_poserSansRole_laisseLaRegleAutomatiqueDecider() {
        let composer = makeComposerWithTwoSounds()

        let pose = composer.addAudioObject()

        XCTAssertNotNil(pose)
        let ecrit = composer.currentEffects.audioPlayerObjects?.first { $0.id == pose?.id }
        XCTAssertNotEqual(ecrit?.isBackground, true,
                          "sans choix, un second son ne vole pas le fond au premier")
    }

    private func makeAudio(id: String, isBackground: Bool?) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: 0.5,
            y: 0.5,
            volume: 1.0,
            waveformSamples: [],
            isBackground: isBackground
        )
        audio.id = id
        return audio
    }

    private func makeComposerWithTwoSounds() -> StoryComposerViewModel {
        let composer = StoryComposerViewModel()
        var effets = composer.currentEffects
        effets.audioPlayerObjects = [makeAudio(id: "premier", isBackground: true),
                                     makeAudio(id: "second", isBackground: nil)]
        composer.currentEffects = effets
        return composer
    }
}
