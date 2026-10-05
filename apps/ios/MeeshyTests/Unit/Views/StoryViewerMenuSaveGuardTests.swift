import XCTest
@testable import Meeshy

/// **« ENREGISTRER » DANS LE MENU (…) DU LECTEUR, POUR TOUT LECTEUR** (#8823).
///
/// Demande porteur 2026-09-30 : le menu (…) de `StoryHeaderView` appelle la
/// sauvegarde EXISTANTE — `StoryPhotoSaveService.shared.save(story:)`, la même
/// que le rail auteur et « Mes stories » — et l'offre à tout lecteur, pas
/// seulement à l'auteur. Un `Menu` SwiftUI ne s'inspecte pas au rendu : la
/// garde lit la source, comme `StoryViewerAnchorGlyphGuardTests`.
final class StoryViewerMenuSaveGuardTests: XCTestCase {

    private static let headerFile = "Meeshy/Features/Main/Views/StoryViewerView+Header.swift"
    private static let saveCall = "StoryPhotoSaveService.shared.save(story: story)"

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.headerFile)
    }

    func test_menu_callsTheExistingStorySave() throws {
        let text = try source()
        XCTAssertTrue(text.contains(Self.saveCall),
                      "Le menu (…) doit appeler la sauvegarde existante, jamais une seconde implémentation.")
    }

    func test_menu_offersSaveBeforeTheOwnerBranch_soEveryReaderGetsIt() throws {
        let text = try source()
        let save = try XCTUnwrap(text.range(of: Self.saveCall), "« Enregistrer » absent du menu (…)")
        let ownerBranch = try XCTUnwrap(text.range(of: "if isOwnStory {"), "embranchement auteur introuvable")
        XCTAssertLessThan(save.lowerBound, ownerBranch.lowerBound,
                          "« Enregistrer » doit précéder `if isOwnStory` : il est offert à TOUT lecteur (arbitrage porteur #8823).")
    }
}
