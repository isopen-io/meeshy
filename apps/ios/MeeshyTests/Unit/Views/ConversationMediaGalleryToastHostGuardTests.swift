import XCTest

/// **La galerie plein écran affiche ses propres retours** (#10729).
///
/// « … › Enregistrer » lève « Enregistré dans Photos », « Déjà dans la
/// photothèque » ou l'erreur d'enregistrement (`MediaSaveFlowHost`). La galerie
/// est présentée en `fullScreenCover` par ses quatre hôtes : l'overlay de la
/// racine est recouvert, et les trois retours se levaient derrière l'écran —
/// mesuré sur iPhone réel pendant la recette #10723.
///
/// Même forme que #4872 (composer) et #4876 (lecteur de story) : le témoin
/// garde le LIEN entre la surface qui lève et l'hôte qui affiche.
final class ConversationMediaGalleryToastHostGuardTests: XCTestCase {

    private static let galleryPath = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"
    private static let menuPath = "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Menu.swift"

    func test_laGalerieMonteLHoteDesRetours() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.galleryPath))
        XCTAssertTrue(
            source.contains(".feedbackToastOverlay()"),
            "`ConversationMediaGalleryView` doit monter l'hôte des toasts : elle est présentée en "
                + "`fullScreenCover` par quatre hôtes, qui recouvre l'overlay de la racine (#10729)."
        )
    }

    /// Garde d'aveuglement : tant que la galerie branche le flux
    /// d'enregistrement, qui lève des toasts, l'hôte ne peut pas partir.
    func test_laGalerieBrancheBienLeFluxDEnregistrement() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.menuPath))
        XCTAssertTrue(
            source.contains(".mediaSaveFlow("),
            "La galerie ne branche plus `mediaSaveFlow` — si c'est voulu, `feedbackToastOverlay()` "
                + "peut partir avec, et ce témoin doit être retiré en connaissance de cause."
        )
    }
}
