import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **La bande-son de la PUBLICATION vit au socle (#4071, vues `1a` et `1b`).**
///
/// La maquette la place « parmi ce qui décide de l'envoi » — audience, aperçu,
/// publier — et non dans les outils qui font entrer de la matière sur la scène.
/// C'est cohérent avec ce qu'elle EST : un son de fond appartient à la
/// publication entière, pas à la slide courante. `1a` la montre comme une
/// invitation (« ♫ AJOUTER UN SON ») sur un document vide ; `1b` la montre
/// comme un crédit (« ♫ NUITS BLANCHES · @lume · 0:28 ») dès qu'un son est
/// posé. Une place, deux états.
///
/// **Ce que cette entrée répare.** La porte son existait, sa feuille était
/// complète — enregistreur, rôle de mixage, bibliothèque, fichier — et la
/// vérification du 2026-08-30 au simulateur a montré qu'aucun écran du parcours
/// réel n'y menait depuis le document. Le chemin manquait, pas la surface.
final class ComposerSocleSoundTests: XCTestCase {

    func test_leDocumentEtLaScenePortentLaBandeSon() {
        XCTAssertTrue(ComposerSocleSound.isServed(surface: .document))
        XCTAssertTrue(ComposerSocleSound.isServed(surface: .scene))
    }

    /// **Le Mood n'en porte pas, et ce n'est pas un oubli.** La vue `2k` le dit
    /// en une phrase : « le profil RETIRE, il n'ajoute pas » — texte seul, une
    /// heure. Son socle est d'ailleurs vide de toute zone
    /// (`ComposerChromeOwnership.socleZones(for: .mood) == []`) : y poser une
    /// bande-son contredirait la seule chose que ce profil affirme.
    func test_leMoodNEnPorteAucune() {
        XCTAssertFalse(ComposerSocleSound.isServed(surface: .mood))
    }

    // MARK: - Les deux états de la pastille

    func test_sansSon_laPastilleInvite() {
        let libelle = ComposerSocleSound.label(for: nil)
        XCTAssertEqual(libelle, ComposerSocleSound.emptyLabel)
    }

    /// Un son EMPRUNTÉ porte son crédit — c'est ce qui distingue l'étagère du
    /// micro, et le crédit est dû à son auteur.
    func test_unSonEmprunte_afficheSonCredit() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "NUITS BLANCHES"
        son.soundAuthorUsername = "lume"
        son.duration = 28

        let libelle = ComposerSocleSound.label(for: son)
        XCTAssertTrue(libelle.contains("NUITS BLANCHES"))
        XCTAssertTrue(libelle.contains("@lume"), "le crédit est dû à l'auteur du son")
        XCTAssertTrue(libelle.contains("0:28"), "la durée dit ce qui va jouer")
    }

    /// **Un VOCAL n'a pas de crédit, et lui en inventer un serait mentir.** Le
    /// crédit tient à `soundId`/`soundAuthorUsername`, que seul l'emprunt
    /// renseigne ; un vocal mis en fond porte le bon mixage et aucun auteur.
    func test_unVocalEnFond_neFabriquePasDeCredit() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.duration = 12

        let libelle = ComposerSocleSound.label(for: son)
        XCTAssertFalse(libelle.contains("@"))
        XCTAssertTrue(libelle.contains("0:12"))
    }

    /// Un son sans durée connue ne fabrique pas « 0:00 » — un compteur faux se
    /// lit comme une piste vide.
    func test_unSonSansDuree_neFabriquePasUnCompteur() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "SANS DURÉE"
        XCTAssertFalse(ComposerSocleSound.label(for: son).contains("0:00"))
    }

    // MARK: - Ce qu'on VOIT et ce qu'on ENTEND ne sont pas la même chaîne

    /// **La pastille était LUE comme une horloge.** L'hôte posait
    /// `.accessibilityLabel(Text(label(for:)))` — la chaîne montrée, resservie
    /// telle quelle — et VoiceOver y prononce « 0:28 » en heures et minutes,
    /// pour un extrait de vingt-huit secondes.
    ///
    /// Le témoin n'interroge PAS le formateur : il demande ce qu'un lecteur
    /// d'écran recevrait. Une durée dite porte des MOTS.
    func test_laPastilleSeDIT_enMots_jamaisEnHorloge() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "NUITS BLANCHES"
        son.duration = 28

        let dit = ComposerSocleSound.spokenLabel(for: son, locale: Locale(identifier: "fr_FR"))

        XCTAssertFalse(dit.contains("0:28"), "une horloge ne se dit pas — \(dit)")
        XCTAssertTrue(dit.localizedCaseInsensitiveContains("seconde"),
                      "la durée dite porte son unité — \(dit)")
    }

    /// **Et les deux libellés restent la MÊME pastille.** Le titre et le crédit
    /// y sont identiques ; seule la durée change de forme. Sans ce témoin, la
    /// séparation ci-dessus autoriserait deux pastilles qui divergent — un
    /// utilisateur voyant et un utilisateur de VoiceOver ne parleraient plus du
    /// même objet.
    func test_lesDeuxLibelles_decriventLaMEMEpastille() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "NUITS BLANCHES"
        son.soundAuthorUsername = "lume"
        son.duration = 28

        for libelle in [ComposerSocleSound.label(for: son),
                        ComposerSocleSound.spokenLabel(for: son)] {
            XCTAssertTrue(libelle.contains("NUITS BLANCHES"), libelle)
            XCTAssertTrue(libelle.contains("@lume"), libelle)
        }
    }

    /// **Les chiffres MONTRÉS suivent la locale.** `String(format: "%d:%02d")`
    /// vécut ici et les gravait en latin ; `ar_SA` — jamais `ar` nue, qui
    /// emprunte la région de l'appareil — est la locale où les deux écritures
    /// divergent, donc la seule où un témoin prouve quelque chose. Comparaison
    /// `.literal` : par collation, « ٢ » vaut « 2 ».
    func test_laDureeMontree_suitLaLocale() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "NUITS BLANCHES"
        son.duration = 28

        let arabe = ComposerSocleSound.label(for: son, locale: Locale(identifier: "ar_SA"))
        XCTAssertNil(arabe.range(of: "0:28", options: .literal),
                     "chiffres latins dans une pastille arabe — \(arabe)")
    }
}
