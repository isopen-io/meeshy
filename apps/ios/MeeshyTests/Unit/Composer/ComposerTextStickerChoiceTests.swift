import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Quel cadre à mots la pastille du composer porte** (directive porteur
/// 2026-09-06, #5326 : « une des icônes de sticker dynamique »).
///
/// Dynamique veut dire : celui dont l'auteur se sert. La règle lit le magasin
/// que la palette alimente déjà (`StickerUsageStore`) — jamais une seconde
/// liste de préférences, qui divergerait du premier ajustement.
final class ComposerTextStickerChoiceTests: XCTestCase {

    private var catalogue: [StickerTemplate] {
        StickerTemplateCatalog.templates(family: .text)
    }

    /// Le cas nominal : le dernier cadre posé est en tête des récents.
    func test_leDernierCadrePose_estCeluiQuiEstServi() {
        let choisi = ComposerTextStickerChoice.resolve(
            recents: [.emoji("😂"), StickerUsageEntry(kind: .template, value: StickerTemplateCatalog.ID.textNeon)],
            favorites: [],
            catalog: catalogue)
        XCTAssertEqual(choisi?.id, StickerTemplateCatalog.ID.textNeon)
    }

    /// **LE témoin du lot.** Les récents portent AUSSI des gabarits d'autres
    /// familles (cœur, heure, lieu) et des emojis. Sans le filtre par
    /// catalogue de la famille, la pastille aurait servi un cadre à cœurs — qui
    /// n'a pas d'emplacement `text` et ne porterait donc PAS les mots tapés.
    func test_unGabaritDUneAutreFamille_estIgnore() {
        let uneHeure = StickerTemplateCatalog.templates(family: .time).first
        XCTAssertNotNil(uneHeure, "le catalogue doit porter la famille heure")
        let choisi = ComposerTextStickerChoice.resolve(
            recents: [StickerUsageEntry(kind: .template, value: uneHeure!.id)],
            favorites: [],
            catalog: catalogue)
        XCTAssertEqual(choisi?.id, catalogue.first?.id)
    }

    /// Une entrée qui désigne un gabarit retiré du catalogue par une mise à
    /// jour est ignorée, comme partout ailleurs dans la palette.
    func test_unGabaritDisparu_estIgnore() {
        let choisi = ComposerTextStickerChoice.resolve(
            recents: [StickerUsageEntry(kind: .template, value: "text.disparu")],
            favorites: [],
            catalog: catalogue)
        XCTAssertEqual(choisi?.id, catalogue.first?.id)
    }

    /// Sans usage, un cadre ÉPINGLÉ sert : l'auteur l'a désigné, même s'il ne
    /// l'a pas encore posé sur ce téléphone.
    func test_sansRecent_unFavoriSert() {
        let choisi = ComposerTextStickerChoice.resolve(
            recents: [.emoji("❤️")],
            favorites: [StickerUsageEntry(kind: .template, value: StickerTemplateCatalog.ID.textStamp)],
            catalog: catalogue)
        XCTAssertEqual(choisi?.id, StickerTemplateCatalog.ID.textStamp)
    }

    /// L'USAGE prime sur l'épinglage : un favori posé une fois il y a un mois
    /// ne doit pas reprendre la pastille à celui de tous les jours.
    func test_lUsageGagneSurLEpinglage() {
        let choisi = ComposerTextStickerChoice.resolve(
            recents: [StickerUsageEntry(kind: .template, value: StickerTemplateCatalog.ID.textTape)],
            favorites: [StickerUsageEntry(kind: .template, value: StickerTemplateCatalog.ID.textStamp)],
            catalog: catalogue)
        XCTAssertEqual(choisi?.id, StickerTemplateCatalog.ID.textTape)
    }

    /// Premier lancement : rien n'a servi, rien n'est épinglé. La pastille
    /// existe quand même — c'est le premier du catalogue, la bulle.
    func test_auPremierLancement_leCatalogueDonneLeRepli() {
        let choisi = ComposerTextStickerChoice.resolve(recents: [], favorites: [], catalog: catalogue)
        XCTAssertEqual(choisi?.id, StickerTemplateCatalog.ID.textSpeechBubble)
    }

    /// Un catalogue vide ne fabrique pas de gabarit : `nil` gouverne
    /// l'ABSENCE de la pastille, jamais son grisé (loi 4).
    func test_unCatalogueVide_neRendRien() {
        XCTAssertNil(ComposerTextStickerChoice.resolve(recents: [], favorites: [], catalog: []))
    }
    // MARK: - La ROTATION (#6537)

    /// **La pastille commence par ce que l'auteur emploie.** La rotation ajoute
    /// ce qu'il ne connaît pas encore ; elle ne change pas ce qu'il reconnaît.
    func test_leTourCommenceParLeCadreEmploye() {
        let tour = ComposerTextStickerChoice.rotation(
            recents: [StickerUsageEntry(kind: .template, value: StickerTemplateCatalog.ID.textNeon)],
            favorites: [],
            catalog: catalogue)
        XCTAssertEqual(tour.first?.id, StickerTemplateCatalog.ID.textNeon)
    }

    /// **LE témoin du lot.** Un cadre ne revient pas au milieu du tour : sur un
    /// catalogue court, le doublon ferait « bégayer » la pastille, et l'auteur
    /// croirait la rotation cassée.
    func test_leTourNePorteAucunDoublon() {
        let tour = ComposerTextStickerChoice.rotation(
            recents: [StickerUsageEntry(kind: .template, value: StickerTemplateCatalog.ID.textNeon)],
            favorites: [],
            catalog: catalogue)
        XCTAssertEqual(Set(tour.map(\.id)).count, tour.count)
    }

    /// Le tour porte TOUT le catalogue — sinon la rotation montrerait moins que
    /// la feuille qu'un appui long ouvre, et l'auteur croirait avoir vu l'offre.
    func test_leTourPorteToutLeCatalogue() {
        let tour = ComposerTextStickerChoice.rotation(recents: [], favorites: [], catalog: catalogue)
        XCTAssertEqual(Set(tour.map(\.id)), Set(catalogue.map(\.id)))
    }

    /// Catalogue vide ⇒ tour vide ⇒ pastille ABSENTE, jamais figée (loi 4).
    func test_unCatalogueVide_neDonneAucunTour() {
        XCTAssertTrue(ComposerTextStickerChoice.rotation(recents: [], favorites: [], catalog: []).isEmpty)
    }

}
