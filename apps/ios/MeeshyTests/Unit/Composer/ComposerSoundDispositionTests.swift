import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Deux vocaux en fond ⇒ deux cartes, et l'ordre de la pose ne bouge pas**
/// (#4695 et #4698, directive porteur 2026-09-01).
///
/// Les deux règles éprouvées ici corrigent deux pertes silencieuses mesurées au
/// simulateur : un son de fond DÉTRUIT par le suivant (#4676 avait remplacé un
/// no-op par une suppression), et une carte qui SAUTE en dernière position
/// quand on la rouvre sans rien y changer.
final class ComposerSoundDispositionTests: XCTestCase {

    private func son(id: String, background: Bool? = true) -> StoryAudioPlayerObject {
        var objet = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                           x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        objet.id = id
        objet.isBackground = background
        objet.duration = 7
        return objet
    }

    private let piste = URL(fileURLWithPath: "/tmp/disposition_A.m4a")
    private let autrePiste = URL(fileURLWithPath: "/tmp/disposition_B.m4a")

    private func media(_ url: URL) -> ComposerDocumentMedia {
        ComposerDocumentMediaFactory.media(url: url, declaredMimeType: "audio/mp4", durationMs: 4000)
    }

    // MARK: - Le fond remplacé DESCEND, il ne meurt pas

    /// **LE témoin de la directive.** Poser un second vocal en fond doit rendre
    /// DEUX cartes — donc l'occupant doit survivre au remplacement.
    func test_unFondRemplace_descendEnCONTENU_ilNEstPasDetruit() {
        let ancien = son(id: "bg-1")
        XCTAssertEqual(
            ComposerSupersededBackground.fate(background: ancien,
                                              audioObjects: [ancien],
                                              localURL: piste,
                                              contentMediaURLs: []),
            .demoteToContent(id: "bg-1", url: piste),
            "prendre la place de l'ambiance n'est pas prendre la vie du son qui l'occupait")
    }

    func test_sansFond_rienNeBouge() {
        XCTAssertEqual(
            ComposerSupersededBackground.fate(background: nil, audioObjects: [],
                                              localURL: nil, contentMediaURLs: []),
            .none)
    }

    // MARK: - Les deux cas où descendre est IMPOSSIBLE, et ils diffèrent

    /// **Un son EMPRUNTÉ n'a pas de fichier**, donc aucune carte ne peut le
    /// porter : la carte de contenu se dessine depuis `documentLocalMedia`.
    /// Lui en fabriquer une la laisserait muette et injouable.
    func test_unFondEmprunte_sansFichier_nePeutPasDescendre() {
        let emprunte = son(id: "bg-snd")
        XCTAssertEqual(
            ComposerSupersededBackground.fate(background: emprunte,
                                              audioObjects: [emprunte],
                                              localURL: nil,
                                              contentMediaURLs: []),
            .discard(id: "bg-snd"))
    }

    /// **Un son déjà servi en CONTENU a déjà sa carte.** Le rétrograder la
    /// doublerait — deux cartes pour une piste, ce que `ComposerSoundColumn`
    /// passe précisément son temps à empêcher côté avatar.
    func test_unFondDejaServiEnContenu_neSeDedoublePas() {
        let commun = son(id: "bg-2")
        XCTAssertEqual(
            ComposerSupersededBackground.fate(background: commun,
                                              audioObjects: [commun],
                                              localURL: piste,
                                              contentMediaURLs: [piste]),
            .discard(id: "bg-2"))
    }

    /// Un fond LEGACY est SYNTHÉTISÉ (`legacy-bg-audio`) et n'existe dans aucun
    /// tableau : le déplacer ferait croire à un déplacement qui n'a pas eu lieu.
    func test_unFondLegacy_nEstNiDescenduNiSupprime() {
        XCTAssertEqual(
            ComposerSupersededBackground.fate(background: son(id: "legacy-bg-audio"),
                                              audioObjects: [],
                                              localURL: piste,
                                              contentMediaURLs: []),
            .none)
    }

    // MARK: - L'ordre de la pose

    /// **Rouvrir puis valider sans rien changer ne DÉPLACE pas la carte.**
    /// C'est le défaut mesuré : `A, B` devenait `B, A` au retour de feuille.
    func test_editerLePremierSon_leLaisseEnPREMIER() {
        let apres = ComposerMediaOrder.replacing([media(piste), media(autrePiste)],
                                                 at: piste,
                                                 with: media(piste))
        XCTAssertEqual(apres.map(\.url), [piste, autrePiste])
    }

    /// **Un rognage rend une URL NEUVE, et la carte reste à SA place.** C'est
    /// le cas qui distingue la règle d'un simple `firstIndex(of:)` : la clé
    /// cherchée et la valeur posée ne portent pas la même URL.
    func test_unRognage_changeLURL_maisPasLaPLACE() {
        let rognee = URL(fileURLWithPath: "/tmp/disposition_A_trim.m4a")
        let apres = ComposerMediaOrder.replacing([media(piste), media(autrePiste)],
                                                 at: piste,
                                                 with: media(rognee))
        XCTAssertEqual(apres.map(\.url), [rognee, autrePiste])
    }

    /// Sans URL éditée, c'est une POSE : elle s'ajoute au bout.
    func test_uneNouvellePose_vaAuBOUT() {
        let apres = ComposerMediaOrder.replacing([media(piste)], at: nil, with: media(autrePiste))
        XCTAssertEqual(apres.map(\.url), [piste, autrePiste])
    }

    /// Une URL éditée INCONNUE de la liste est une pose, pas une perte : c'est
    /// ce qui arrive quand l'auteur fait passer un son du FOND au contenu.
    func test_uneURLInconnue_sePOSE_elleNEfaceRien() {
        let apres = ComposerMediaOrder.replacing([media(piste)],
                                                 at: URL(fileURLWithPath: "/tmp/absent.m4a"),
                                                 with: media(autrePiste))
        XCTAssertEqual(apres.map(\.url), [piste, autrePiste])
    }

    // MARK: - Supprimer

    func test_supprimer_neRetireQueLaCarteVISEE() {
        let apres = ComposerMediaOrder.removing([media(piste), media(autrePiste)], at: piste)
        XCTAssertEqual(apres.map(\.url), [autrePiste])
    }

    /// Supprimer deux fois le même son n'emporte pas un voisin.
    func test_supprimerUneURLAbsente_laisseLaListeINTACTE() {
        let apres = ComposerMediaOrder.removing([media(piste)],
                                                at: URL(fileURLWithPath: "/tmp/absent.m4a"))
        XCTAssertEqual(apres.map(\.url), [piste])
    }
}
