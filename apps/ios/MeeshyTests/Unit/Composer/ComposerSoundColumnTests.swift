import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **La place à côté de l'avatar dit le FOND, et rien d'autre** (#4670).
///
/// > Directive porteur 2026-09-01 : « Un son mis sur le contenu ne doit pas
/// > apparaître à côté de l'avatar ! »
///
/// Le témoin s'écrit sur le cas que la STRUCTURE rate. Les deux colonnes ne se
/// croisent pas tant que personne ne pose le même fichier des deux côtés : un
/// témoin qui n'éprouverait que le cas nominal — un fond ici, un contenu là —
/// passerait au vert sans que la loi existe.
final class ComposerSoundColumnTests: XCTestCase {

    private func fond(id: String = "bg-1") -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.id = id
        son.isBackground = true
        son.duration = 7
        return son
    }

    private let piste = URL(fileURLWithPath: "/tmp/composer_sound_A.m4a")
    private let autrePiste = URL(fileURLWithPath: "/tmp/composer_sound_B.m4a")

    // MARK: - Le cas nominal, qui ne prouve pas la loi mais garde le service

    func test_sansSonDeFond_laLigneNAffichRien() {
        XCTAssertNil(ComposerSoundColumn.avatarBadge(background: nil,
                                                     backgroundLocalURL: nil,
                                                     contentMediaURLs: []))
    }

    func test_unSonDeFond_seLitACoteDeLAvatar() {
        let servi = ComposerSoundColumn.avatarBadge(background: fond(),
                                                    backgroundLocalURL: piste,
                                                    contentMediaURLs: [])
        XCTAssertEqual(servi?.id, "bg-1")
    }

    /// Un son de fond EMPRUNTÉ n'a pas de fichier local — et se lit quand même.
    /// L'absence d'URL est une preuve qu'il ne peut pas être un média du
    /// document (lequel n'accepte que des fichiers), jamais une lacune qui
    /// justifierait de le masquer.
    func test_unSonEmprunte_sansFichierLocal_seLitQuandMeme() {
        let servi = ComposerSoundColumn.avatarBadge(background: fond(),
                                                    backgroundLocalURL: nil,
                                                    contentMediaURLs: [piste])
        XCTAssertNotNil(servi)
    }

    // MARK: - LE cas que la structure rate

    /// **Le même fichier des deux côtés ⇒ la pastille se tait.**
    ///
    /// C'est l'état que la capture du porteur montrait : une piste de 7 s lue
    /// à la fois près de l'avatar et sous le texte. Un doublon de cette forme
    /// ne se lit pas comme un doublon — il se lit comme deux pistes.
    func test_unSonDejaServiEnCONTENU_nApparaitPasACoteDeLAvatar() {
        let servi = ComposerSoundColumn.avatarBadge(background: fond(),
                                                    backgroundLocalURL: piste,
                                                    contentMediaURLs: [piste])
        XCTAssertNil(servi, "la place à côté de l'avatar dit le FOND, jamais le contenu")
    }

    /// Un VOISIN dans la liste média ne suffit pas : c'est l'identité du
    /// fichier qui décide, pas la présence d'un audio quelconque au document.
    func test_unAutreSonAuContenu_neMasquePasLeFond() {
        let servi = ComposerSoundColumn.avatarBadge(background: fond(),
                                                    backgroundLocalURL: piste,
                                                    contentMediaURLs: [autrePiste])
        XCTAssertNotNil(servi, "deux sons DIFFÉRENTS occupent leurs deux places")
    }

    // MARK: - Ce que la pastille OUVRE (#4668)

    func test_unVocalEnFond_sOuvrePourEtreEdite() {
        XCTAssertTrue(ComposerSoundColumn.opensEditor(fond()))
    }

    /// **Un son EMPRUNTÉ ne s'ouvre pas, et le motif est le crédit.** Rouvrir
    /// passe par « Création audio », qui rend un FICHIER : republier une piste
    /// de l'étagère par ce chemin la détacherait de son `soundId`, donc de
    /// l'attribution de son auteur.
    func test_unSonEmprunte_neSOuvrePas_pourNePasVolerSonCredit() {
        var emprunte = fond()
        emprunte.soundId = "snd_42"
        emprunte.soundAuthorUsername = "lume"
        XCTAssertFalse(ComposerSoundColumn.opensEditor(emprunte))
    }

    /// Un `soundId` VIDE n'est pas un emprunt — `addBorrowedSound` est le seul
    /// producteur d'un identifiant renseigné, et l'existant écrit `""` sur les
    /// sons qui n'en ont pas.
    func test_unSoundIdVide_neCompteJamaisCommeUnEmprunt() {
        var son = fond()
        son.soundId = ""
        XCTAssertTrue(ComposerSoundColumn.opensEditor(son))
    }
}
