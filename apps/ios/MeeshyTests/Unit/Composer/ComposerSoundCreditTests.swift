import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Le CRÉDIT d'un son — ce qui joue, et à qui on le doit** (#4669).
///
/// La règle a quitté le socle avec la pastille qui l'y montrait (directive
/// porteur 2026-09-01 : « on n'a plus besoin du bouton ajouter un son en bas »)
/// et suit le son là où il se lit : à côté de l'avatar.
///
/// **Le déménagement était nécessaire, pas cosmétique.** La pastille du socle
/// était le SEUL endroit du composer qui affichait `soundAuthorUsername`. La
/// retirer sans emporter sa composition aurait fait disparaître l'attribution
/// d'un son emprunté partout — une perte qu'aucun témoin n'aurait signalée,
/// puisque aucun n'assertait qu'elle était montrée quelque part.
///
/// Ce qui a changé de forme : la règle n'invite plus. « Ajouter un son » était
/// le mot de la pastille VIDE ; une pastille vide n'existe plus, et le cas
/// « pas de son » se traite chez l'appelant en ne montrant rien.
final class ComposerSoundCreditTests: XCTestCase {


    // MARK: - Les témoins de la pastille du SOCLE ont été retirés avec elle
    //
    // `isServed(surface:)` gardait « quelles surfaces portent la bande-son au
    // socle » — plus aucune ne la porte. `label(for: nil)` gardait le mot de la
    // pastille VIDE — il n'y a plus de pastille vide.
    //
    // **Ils sont SUPPRIMÉS, pas neutralisés.** Un témoin qu'on désarme en
    // gardant sa carcasse passe au vert en ayant perdu ce qu'il protégeait, et
    // sa présence fait croire que la règle vit encore.

    // MARK: - Ce qu'un crédit dit, et ce qu'il ne fabrique pas

    /// Un son EMPRUNTÉ porte son crédit — c'est ce qui distingue l'étagère du
    /// micro, et le crédit est dû à son auteur.
    func test_unSonEmprunte_afficheSonCredit() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "NUITS BLANCHES"
        son.soundAuthorUsername = "lume"
        son.duration = 28

        let libelle = ComposerSoundCredit.label(for: son)
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

        let libelle = ComposerSoundCredit.label(for: son)
        XCTAssertFalse(libelle.contains("@"))
        XCTAssertTrue(libelle.contains("0:12"))
    }

    /// **Un son sans titre n'en reçoit pas un d'emprunt.** La composition
    /// posait « Ajouter un son » comme nom de repli, ce qui avait un sens sur un
    /// BOUTON d'ajout et n'en a plus aucun sur une pastille d'état : un vocal
    /// s'y serait annoncé « Ajouter un son · 0:07 » — une invitation servie
    /// comme un titre.
    func test_unSonSansTitre_neReçoitPasUnTitreDEmprunt() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.duration = 7
        let libelle = ComposerSoundCredit.label(for: son)
        XCTAssertEqual(libelle, LocalizedNumber.duration(seconds: 7),
                       "sans titre, le crédit est sa seule durée — \(libelle)")
    }

    /// Un son sans durée connue ne fabrique pas « 0:00 » — un compteur faux se
    /// lit comme une piste vide.
    func test_unSonSansDuree_neFabriquePasUnCompteur() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.name = "SANS DURÉE"
        XCTAssertFalse(ComposerSoundCredit.label(for: son).contains("0:00"))
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

        let dit = ComposerSoundCredit.spokenLabel(for: son, locale: Locale(identifier: "fr_FR"))

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

        for libelle in [ComposerSoundCredit.label(for: son),
                        ComposerSoundCredit.spokenLabel(for: son)] {
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

        let arabe = ComposerSoundCredit.label(for: son, locale: Locale(identifier: "ar_SA"))
        XCTAssertNil(arabe.range(of: "0:28", options: .literal),
                     "chiffres latins dans une pastille arabe — \(arabe)")
    }
}
