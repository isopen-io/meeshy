import XCTest
@testable import Meeshy

/// **La porte qui manquait : la vignette d'une slide ouvre son FOND** (#5041).
///
/// > Directive porteur : « Longpress editer sur la miniature des slide permet
/// > d'ouvrir le background ».
///
/// Le fond d'une slide n'avait aucune porte depuis la bande : son menu offrait
/// *Supprimer* et *Dupliquer*, et pour le régler il fallait le trouver sur le
/// canvas — c'est-à-dire savoir qu'un fond EST un objet, ce que rien n'enseigne.
///
/// La chaîne compte trois maillons, et ce témoin garde les deux qu'une règle
/// pure ne peut pas atteindre : l'entrée du menu et son câblage chez l'hôte.
/// Le troisième (`SlideThumbEditAffordance`) a ses propres témoins, côté SDK.
final class SlideThumbBackgroundDoorTests: XCTestCase {

    private var racine: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: racine.appendingPathComponent(chemin), encoding: .utf8)
    }

    private func compact(_ s: String) -> String {
        s.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
    }

    /// **Non-vacuité, et elle porte ici un risque REEL** : le chemin remonte six
    /// niveaux. En compter cinq rendrait une URL inexistante — `source` lèverait,
    /// certes, mais une source tronquée ou renommée ferait passer les assertions
    /// pour la meilleure des raisons apparentes.
    func test_leTemoin_litBienLesDeuxFichiers() throws {
        let bande = try source("packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SlideStrip.swift")
        let meuble = try source("apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(bande.contains("func slideThumb("),
                      "le témoin doit lire la vignette qu'il prétend garder")
        XCTAssertTrue(meuble.contains("var composerSurface"),
                      "et le site où l'atelier est monté")
    }

    /// L'entrée existe, et elle est **gouvernée par la règle** — pas par une
    /// condition écrite dans le `body`. C'est ce qui rend éprouvable le refus
    /// d'offrir « Éditer » sur une slide sans fond.
    func test_lEntree_estGouverneeParLaRegle() throws {
        let nu = compact(try source(
            "packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SlideStrip.swift"))
        XCTAssertTrue(
            nu.contains("SlideThumbEditAffordance.editableBackgroundId(in:slide.effects,hostServesEditor:onEditSceneObject!=nil)"),
            "l'entrée demande à la RÈGLE, en lui passant la présence de l'hôte — "
            + "le montage entier, fermante comprise, pour qu'un argument ajouté ne passe pas")
        XCTAssertTrue(nu.contains("onEditSceneObject?(fondId)"),
                      "et elle appelle l'hôte avec l'identifiant que la règle a élu")
    }

    /// **Sélectionner AVANT d'ouvrir.** L'éditeur d'objet lit
    /// `viewModel.currentSlide` ; ouvert sur le fond d'une slide qui n'est pas la
    /// courante, il chercherait un objet introuvable et se refermerait — un geste
    /// qui a l'air de marcher et ne fait rien.
    ///
    /// L'ORDRE est le fait gardé, pas la présence des lignes.
    func test_laSlideEstMiseAuPoint_avantLOuverture() throws {
        let nu = compact(try source(
            "packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SlideStrip.swift"))
        guard let selection = nu.range(of: "restoreCanvas(from:viewModel.slides[index])onEditSceneObject?(fondId)") else {
            return XCTFail("la mise au point de la slide doit précéder IMMÉDIATEMENT l'ouverture")
        }
        XCTAssertFalse(selection.isEmpty)
    }

    /// **Le meuble câble la porte sur le site UNIQUE d'ouverture.**
    ///
    /// `openObjectEditor` est la seule façon d'ouvrir un objet quelle que soit la
    /// porte ; recopier son contenu ici est exactement ce qui avait fait diverger
    /// deux chemins au #4634.
    func test_leMeuble_cableLaPorteSurLeSiteUnique() throws {
        let nu = compact(try source(
            "apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift"))
        XCTAssertTrue(nu.contains("onEditSceneObject:{openObjectEditor($0)}"),
                      "l'atelier reçoit la porte, et elle mène au site unique")
    }
}
