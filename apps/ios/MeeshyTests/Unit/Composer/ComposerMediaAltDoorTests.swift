import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **Un post part enfin avec ses textes alternatifs** (#4756).
///
/// Le nouveau composer publiait `ComposerMediaAccessibility.empty`, et son
/// doc-comment l'admettait : « la surface de scène du meuble n'offre pas encore
/// d'éditeur d'alternative textuelle, donc il n'y a rien à transmettre ».
///
/// **Le transport existait de bout en bout** — `PostService.createCanvasPost(mediaAlt:)`,
/// `ComposerMediaAccessibility`, `StoryMediaTextMapping.serverKeyed`. Ce qui
/// manquait était la SOURCE. Et l'UI existait aussi, restée dans l'ANCIENNE
/// peau : `MediaAccessibilityPanel` est monté par `ComposerToolPanelHost` →
/// `ComposerBottomBand`, la bande de l'atelier plein écran que le meuble ne
/// monte plus.
///
/// > Le contrôle n'avait pas été supprimé — il était resté là où l'on ne va
/// > plus. C'est la forme « quelle PEAU est montée », et elle ne se voit pas
/// > en cherchant « qui écrit ce champ ? » : personne ne l'écrivait, et rien
/// > dans le code ne réclamait qu'on l'écrive.
final class ComposerMediaAltDoorTests: XCTestCase {

    private func source(_ fichier: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Composer/\(fichier)")
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // MARK: - 1. L'outil existe, et il est SERVI

    /// La loi 4 gouverne dans les deux sens : un outil ne se sert que si son
    /// effet existe de bout en bout — et ici il existe, donc le retenir serait
    /// aussi faux que servir un `crop` inerte.
    func test_lOutilDecrire_estServi() {
        XCTAssertTrue(MediaEditTool.served.contains(.altText),
                      "Le contrat porte `mediaAlt` de bout en bout et l'atome de saisie "
                      + "existe : rien ne justifie de retenir cet outil.")
        XCTAssertFalse(ComposerObjectEditorCopy.media(.altText).isEmpty,
                       "Un outil servi porte son mot — la rangée nomme le VERBE.")
        XCTAssertFalse(ComposerObjectEditorRail.symbolName(.media(.altText)).isEmpty,
                       "…et son glyphe.")
    }

    /// **Il ferme la liste, et pas par hasard.** On décrit un média une fois
    /// qu'on a fini de le régler : l'ordre du rail est celui des décisions.
    func test_decrire_fermeLaListeDesOutilsMedia() {
        XCTAssertEqual(MediaEditTool.served.last, .altText)
    }

    // MARK: - 2. La carte vit au MEUBLE, et la chaîne est entière

    /// **Le magasin appartient au meuble, jamais à l'éditeur.** Un magasin tenu
    /// par l'écran d'édition mourrait à sa fermeture — c'est exactement ce que
    /// la légende a payé avant #4890, où `documentMediaCaptions` avait un
    /// écrivain et aucun lecteur.
    func test_leMagasin_vitDansLeMeuble_etLEditeurNEnTientAucun() throws {
        let meuble = compact(try source("MeeshyComposerHost.swift"))
        XCTAssertTrue(meuble.contains("@StatevardocumentMediaAlts:[String:String]=[:]"),
                      "Le meuble tient la carte des textes alternatifs.")

        let editeur = compact(try source("ComposerObjectEditorView.swift"))
        XCTAssertFalse(editeur.contains("@StatevarmediaAlt"),
                       "L'éditeur d'objet ne doit tenir AUCUN magasin d'alt : il reçoit un "
                       + "Binding du meuble. Un état local ici serait perdu à la fermeture.")
        XCTAssertTrue(editeur.contains("varmediaAltText:Binding<String>?"),
                      "…il le reçoit en Binding, optionnel : un texte, un sticker ou une "
                      + "pastille de lieu n'ont pas d'alternative textuelle, et un champ "
                      + "inerte serait un contrôle sans effet.")
    }

    /// **La greffe porte les DEUX cartes.** Elle ne portait que les légendes :
    /// y ajouter l'alt sans toucher au site de greffe aurait laissé la carte
    /// mourir dans le meuble, un cran avant le publieur.
    func test_laGreffe_porteLAltEtLaLegende() throws {
        let greffe = compact(try source("MeeshyComposerHost+Captions.swift"))
        XCTAssertTrue(greffe.contains("mediaAlt:(base.mediaAlt??[:]).merging(altsDuComposer)"),
                      "La charge remise au publieur doit FUSIONNER l'alt du composer avec "
                      + "ce que la base porte — jamais l'écraser : un média que le composer "
                      + "n'a pas décrit garde ce qu'un autre chemin y a mis.")
        XCTAssertTrue(greffe.contains("mediaCaption:(base.mediaCaption??[:]).merging(duComposer)"),
                      "…et la légende reste greffée comme avant.")
    }

    /// **Le champ est câblé au meuble depuis le portail.** Une section montée
    /// sans binding serait un champ qui n'écrit nulle part.
    func test_lePortail_remetLeBindingDuMeuble() throws {
        let portail = compact(try source("MeeshyComposerHost+Portals.swift"))
        XCTAssertTrue(portail.contains("mediaAltText:mediaAltBinding(for:objet.id)"),
                      "Le portail doit remettre le binding du meuble, keyé par l'id de "
                      + "l'objet ouvert.")
    }

    /// **L'atome du SDK est employé tel quel.** En réécrire un côté app aurait
    /// fait diverger deux champs au premier réglage — la faute que le composer
    /// a déjà payée sur les légendes, et qui a coûté #5142.
    func test_laSection_monteLAtomeDuSDK_jamaisUnJumeau() throws {
        let media = compact(try source("ComposerObjectEditorView+Media.swift"))
        XCTAssertTrue(media.contains("MediaAltTextField(kind:.alt,"),
                      "La section monte l'atome du SDK, qui porte déjà son étiquette, son "
                      + "invite et son indice VoiceOver dans les sept langues.")
        XCTAssertTrue(media.contains("ifletalt=mediaAltText{"),
                      "…et seulement quand le meuble a remis son binding.")
    }

    // MARK: - 3. La CLÉ est celle que le serveur attend

    /// **Keyée par `StoryMediaObject.id`, et c'est ce que la traduction
    /// attend.** `StoryMediaTextMapping.serverKeyed(composerKeyed:mediaObjects:)`
    /// convertit les ids du composer en `postMediaId` APRÈS l'upload — plus tôt,
    /// les ids serveur n'existent pas. Une carte keyée autrement (par URL, par
    /// index) serait filtrée en SILENCE par `PostService.applyMediaAlt`, qui ne
    /// retient que des ids de `mediaIds`.
    ///
    /// > Une perte silencieuse est la forme la plus coûteuse : l'auteur a saisi,
    /// > vu son texte, validé — et rien ne part.
    func test_laCle_estCelleDeLObjetMedia_pasUneAutre() throws {
        let meuble = compact(try source("MeeshyComposerHost+Captions.swift"))
        XCTAssertTrue(meuble.contains("funcmediaAltBinding(forobjectId:String)->Binding<String>"),
                      "Le binding se prend par identifiant d'OBJET — le même que celui que "
                      + "`serverKeyed` sait traduire en `postMediaId`.")
    }

    /// **Une chaîne vide ne reste pas dans la carte.** Un texte effacé qui
    /// survivrait ferait partir une clé vide, que le gateway filtre sans rien
    /// dire — une perte qui ressemble à un envoi.
    func test_effacerUnTexte_leRetireDeLaCarte() throws {
        let greffe = compact(try source("MeeshyComposerHost+Captions.swift"))
        XCTAssertTrue(greffe.contains("documentMediaAlts.removeValue(forKey:objectId)"),
                      "Effacer doit RETIRER la clé, jamais y laisser une chaîne vide.")
        XCTAssertTrue(greffe.contains("altsDuComposer=documentMediaAlts.filter{"),
                      "…et la greffe filtre en second rideau ce qui n'est que du blanc.")
    }
}
