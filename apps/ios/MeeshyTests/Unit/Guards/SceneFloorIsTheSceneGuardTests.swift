import XCTest

/// **En plein écran, le SOL est la scène** (#7039, directive porteur du
/// 2026-09-18).
///
/// Le fond ne change pas de nature — c'est la même empreinte — il change de
/// PORTEUR : la carte cesse de le peindre, le sol plein écran le porte. Deux
/// surfaces peignaient jusque-là le même hachage dans deux cadres différents,
/// ce qui est le défaut #6797, et ce qui a projeté la croix hors de l'écran
/// (#7037).
///
/// Une garde de SOURCE, parce que la règle est un CÂBLAGE : à l'écran, les deux
/// états rendent un fond vert de la même famille, et seule la bascule au tap les
/// distingue. Un témoin de pixels ne verrait pas la régression ; un témoin de
/// comportement ne peut pas monter un `fullScreenCover` de galerie.
final class SceneFloorIsTheSceneGuardTests: XCTestCase {

    /// La racine du dépôt, remontée depuis ce fichier : les gardes de l'app
    /// lisent aussi des sources du SDK, et il n'existe pas d'autre chemin qui
    /// survive à un déplacement du paquet.
    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    private func sdk(_ chemin: String) throws -> String {
        let url = Self.repoRoot.appendingPathComponent("packages/MeeshySDK/Sources/" + chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_laPageDeScene_neFaitPeindreLeFondParLaCarte_quHorsPleinEcran() throws {
        let code = try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift")

        XCTAssertTrue(
            code.contains("paintsBackdrop: !presentation.isFull"),
            """
            La page de scène doit dire à la carte de NE PAS peindre son fond en \
            plein écran : c'est le sol qui le porte (#7039). Sans ce câblage, \
            deux surfaces peignent la même empreinte dans deux cadres — le \
            défaut #6797 — et le tap ne fond plus la carte dans le sol.
            """
        )
    }

    func test_laCarte_offreUnEtatSansFond_etLEfaceEnFondu() throws {
        let carte = try sdk("MeeshyUI/Story/ScenePlayer/SceneCard.swift")

        XCTAssertTrue(
            carte.contains("paintsBackdrop"),
            "`SceneCard` doit offrir l'état « l'hôte porte le fond » (#7039)."
        )
        XCTAssertTrue(
            carte.contains(".opacity(paintsBackdrop ? 1 : 0)"),
            """
            Le fond doit s'effacer en OPACITÉ, jamais par un retrait de la \
            hiérarchie : le porteur demande un fondu — « le fondu fait \
            disparaître la scène pour préserver le sol déjà peint ». Une vue \
            retirée saute, une opacité animée se fond.
            """
        )
    }

    func test_leSol_resteLePeintreUniqueEtNeDicteAucuneTaille() throws {
        let sol = try sdk("MeeshyUI/Story/ScenePlayer/SceneFloorView.swift")

        XCTAssertTrue(
            sol.contains("Color.clear") && sol.contains(".clipped()"),
            """
            Le sol doit rester posé en overlay d'une couche neutre (#7037) : \
            `scaledToFill()` nu annonce une taille débordante, et son hôte \
            l'adopte — c'est ce qui envoyait « Fermer » à −326,3 pt. Maintenant \
            que le sol est LE fond du plein écran, cette borne compte double.
            """
        )
    }
}
