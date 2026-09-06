import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Une tuile de la rangée haute dit le FOND d'une slide, et rien d'autre** (#4724).
///
/// > Directive porteur 2026-09-01 : « faire la différence entre les medias sur la
/// > scene en foreground et les media en background (apparaissent comme nouveau
/// > tuile en haut sur la rangé des headers) […] le comportement actuel qui fait
/// > que lorsqu'on ajoute n'importe quel média ça vient [dans] la trail des
/// > slides doit être supprimé ! »
///
/// Le témoin s'écrit sur les cas que la STRUCTURE rate. Alimentée par
/// `documentLocalMedia`, la rangée rendait le MÊME écran pour un fond et pour un
/// premier plan : le seul rang où l'ancien défaut était invisible est celui d'un
/// document qui n'a qu'un fond — et c'est exactement le cas nominal.
final class ComposerMediaPlacementTests: XCTestCase {

    private func media(_ nom: String, mime: String = "image/jpeg") -> ComposerDocumentMedia {
        ComposerDocumentMediaFactory.media(
            url: URL(fileURLWithPath: "/tmp/\(nom)"), declaredMimeType: mime)
    }

    private func url(_ nom: String) -> URL { URL(fileURLWithPath: "/tmp/\(nom)") }

    // MARK: - Par quelle porte, sur quelle scène

    /// **La rangée du document fonde une page, même quand une scène existe.**
    /// C'est le cas qu'une règle résumée à « il y a déjà un fond ⇒ premier plan »
    /// raterait : elle ferait disparaître le carrousel dès la seconde photo.
    func test_laRangeeDuDocument_fondeUnePage_memeSurUneSceneDejaFondee() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .documentRow, currentSlideHasBackground: true),
            .background)
    }

    func test_laRangeeDuDocument_fondeUnePage_surUnDocumentVierge() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .documentRow, currentSlideHasBackground: false),
            .background)
    }

    /// **LE cas du lot** : la porte du rail pose SUR la scène, elle n'ouvre pas
    /// de page.
    func test_leRailPose_enPremierPlan_quandLaSceneAUnFond() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: true),
            .foreground)
    }

    /// **La moitié qu'on oublie en résumant la règle.** Une slide vierge n'a pas
    /// de fond : le premier média posé le DEVIENT, `addMediaObject` l'y range de
    /// lui-même. Déclarer « premier plan » ici ferait dire à la rangée haute le
    /// contraire de ce que le modèle écrit.
    func test_leRailFondeLeFond_quandLaSlideEstVierge() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: false),
            .background,
            "un rôle déclaré à l'entrée doit être celui que le modèle écrira à la sortie")
    }

    // MARK: - Ce qui gagne une tuile — la garantie a changé de NATURE

    /// **Ces témoins ont été retirés le 2026-09-06, et leur garantie est plus
    /// forte qu'avant.**
    ///
    /// Ils éprouvaient `ComposerHeaderTiles.tiles(_:founding:)` : qu'un média de
    /// PREMIER PLAN, un SON et un DOCUMENT n'obtiennent pas de tuile dans la
    /// rangée haute. La règle filtrait des médias par l'index des fondations.
    ///
    /// La rangée ne compte plus des médias : elle compte des SCÈNES
    /// (`tiles(for: [StorySlide])`). Un son, un PDF ou une image posée ne
    /// PEUVENT plus y entrer — non parce qu'un filtre les écarte, mais parce
    /// qu'ils ne sont pas du bon type. **Le compilateur tient l'invariant que
    /// ces quatre témoins vérifiaient à l'exécution.**
    ///
    /// > Une règle abolie ne se remplace pas par un test qui passe toujours :
    /// > elle se remplace par la question qui reste posée. Ici la question
    /// > — « la rangée montre-t-elle chaque scène ? » — vit dans
    /// > `ComposerSlideRailTests`, et son témoin discriminant est la scène SANS
    /// > média, que l'ancienne règle rendait précisément invisible.

    // MARK: - Quand la scène reste montée (défaut V2)

    /// **LE cas** : plus aucune fondation, mais la slide garde des objets. La
    /// scène doit RESTER. Se démonter là rendait les médias de premier plan
    /// invisibles et irretirables — pendant qu'ils repartaient à la publication.
    func test_laScèneReste_quandLaSlideGardeDesObjets_sansAucuneFondation() {
        XCTAssertTrue(ComposerScenePresence.hasScene(backgroundHex: nil,
                                                     foundedSlides: 0,
                                                     sceneObjectCount: 2))
    }

    /// Le composer NEUF n'a pas de scène : ni fond, ni fondation, ni objet.
    /// Sans ce témoin, la règle pourrait rendre `true` partout et le premier
    /// cas ci-dessus ne s'en apercevrait pas.
    func test_unComposerVierge_nAAucuneScène() {
        XCTAssertFalse(ComposerScenePresence.hasScene(backgroundHex: nil,
                                                      foundedSlides: 0,
                                                      sceneObjectCount: 0))
    }

    /// Un fond de COULEUR seul suffit — c'est le cas d'origine (Phase 2, #3885),
    /// et il ne doit pas se perdre en chemin.
    func test_unFondDeCouleurSeul_faitLaScène() {
        XCTAssertTrue(ComposerScenePresence.hasScene(backgroundHex: "#112233",
                                                     foundedSlides: 0,
                                                     sceneObjectCount: 0))
    }

    func test_uneFondationSeule_faitLaScène() {
        XCTAssertTrue(ComposerScenePresence.hasScene(backgroundHex: nil,
                                                     foundedSlides: 1,
                                                     sceneObjectCount: 0))
    }

}
