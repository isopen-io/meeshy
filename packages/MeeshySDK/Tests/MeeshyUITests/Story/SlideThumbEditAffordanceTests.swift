import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **La vignette d'une slide ouvre son FOND** (#5041).
///
/// > Directive porteur : « Longpress editer sur la miniature des slide permet
/// > d'ouvrir le background ».
///
/// Le menu de la vignette n'offrait que *Supprimer* et *Dupliquer* : le fond
/// d'une slide n'avait **aucune porte** depuis la bande — il fallait le trouver
/// sur le canvas, ce qui suppose de savoir qu'il est un objet.
///
/// La règle vit ici plutôt que dans le `contextMenu` parce qu'elle décide d'une
/// ABSENCE : une slide sans fond ne doit offrir aucune entrée. Une entrée
/// « Éditer » qui n'ouvre rien est la loi 4 prise en défaut, et une condition
/// écrite dans un `body` n'est éprouvable qu'en montant la vue.
final class SlideThumbEditAffordanceTests: XCTestCase {

    private func effets(medias: [StoryMediaObject]?) -> StoryEffects {
        var e = StoryEffects()
        e.mediaObjects = medias
        return e
    }

    private func fond(id: String) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "m-\(id)", kind: .image,
                         aspectRatio: 1, isBackground: true)
    }

    private func devant(id: String) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "m-\(id)", kind: .image,
                         aspectRatio: 1, isBackground: false)
    }

    /// Le cas nominal : la slide porte un fond, la vignette l'ouvre.
    func test_unFondPresent_estOffertALEdition() {
        XCTAssertEqual(
            SlideThumbEditAffordance.editableBackgroundId(
                in: effets(medias: [fond(id: "bg-1")]), hostServesEditor: true),
            "bg-1")
    }

    /// **Aucune entrée sans fond.** Une slide de texte, de dessin ou vierge n'a
    /// rien à ouvrir ; proposer « Éditer » y ferait croire à une capacité que
    /// l'écran suivant démentirait.
    func test_sansAucunMedia_aucuneEntree() {
        XCTAssertNil(SlideThumbEditAffordance.editableBackgroundId(
            in: effets(medias: nil), hostServesEditor: true))
        XCTAssertNil(SlideThumbEditAffordance.editableBackgroundId(
            in: effets(medias: []), hostServesEditor: true))
    }

    /// **Un média de PREMIER PLAN n'est pas un fond.** C'est la distinction qui
    /// fait tout le lot : le canvas les sépare déjà (`itemsContainer` contre
    /// `backgroundLayer`), et la vignette doit s'aligner sur la même frontière —
    /// sans quoi elle ouvrirait un sticker photo en croyant ouvrir la scène.
    func test_unMediaDeDevant_neVautPasUnFond() {
        XCTAssertNil(SlideThumbEditAffordance.editableBackgroundId(
            in: effets(medias: [devant(id: "fg-1")]), hostServesEditor: true))
    }

    /// Le fond est élu parmi PLUSIEURS médias, pas pris au premier venu.
    func test_leFondEstElu_parmiLesAutresMedias() {
        XCTAssertEqual(
            SlideThumbEditAffordance.editableBackgroundId(
                in: effets(medias: [devant(id: "fg-1"), fond(id: "bg-9"), devant(id: "fg-2")]),
                hostServesEditor: true),
            "bg-9")
    }

    /// **Sans hôte pour ouvrir l'éditeur, aucune entrée** — même avec un fond.
    ///
    /// Même raison que la clause de repli du long press (#5041) : un composant
    /// partagé reste inerte chez qui ne le branche pas, et une entrée de menu
    /// qui n'appelle personne est pire qu'absente, parce qu'elle a l'air de
    /// marcher jusqu'au tap.
    func test_sansHotePourEditer_aucuneEntree() {
        XCTAssertNil(
            SlideThumbEditAffordance.editableBackgroundId(
                in: effets(medias: [fond(id: "bg-1")]), hostServesEditor: false))
    }

    /// Un identifiant vide n'est pas un identifiant : l'éditeur s'ouvrirait sur
    /// un objet introuvable, donc sur un écran vide — pire que pas d'entrée.
    func test_unIdentifiantVide_neVautPasUnFond() {
        XCTAssertNil(
            SlideThumbEditAffordance.editableBackgroundId(
                in: effets(medias: [fond(id: "")]), hostServesEditor: true))
    }
}
