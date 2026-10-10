import XCTest
@testable import Meeshy

/// **Une seule feuille de stickers sert la conversation et la scène d'un post,
/// d'un réel ou d'une story** (#9189, porteur 2026-10-02 : « On doit avoir un
/// seul composant ! »).
///
/// Avant ce lot, trois montages de `StickerPickerView` : la conversation avec
/// tous ses injecteurs (Mee, Instants, Mes stickers, Lieu, Coller, détentes
/// moyenne et grande), la scène du composer SANS eux (détente moyenne seule),
/// et l'atelier du SDK une troisième fois. Trois feuilles qui ne montraient
/// pas les mêmes onglets pour la même porte.
///
/// La garde COMPTE les montages (le motif de `ComposerAtelierHasOneMountSiteTests`) :
/// « présent dans `MeeshyStickerSheet` » resterait vrai avec un second montage
/// à côté. Le balayage est récursif, app ET SDK, et ne connaît aucune liste.
final class StickerSheetHasOneMountSiteTests: XCTestCase {

    private static var racineApp: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // …/Unit/Composer (retire le FICHIER)
            .deletingLastPathComponent()   // …/Unit
            .deletingLastPathComponent()   // …/MeeshyTests
            .deletingLastPathComponent()   // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static var racineSDK: URL {
        racineApp
            .deletingLastPathComponent()   // …/apps/ios
            .deletingLastPathComponent()   // …/apps
            .deletingLastPathComponent()   // racine du dépôt
            .appendingPathComponent("packages/MeeshySDK/Sources")
    }

    private func sources(under racine: URL) -> [URL] {
        guard let marcheur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return []
        }
        return marcheur.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func fichiers(contenant motif: String, sous racine: URL) -> [String] {
        sources(under: racine).compactMap { url in
            guard let brut = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            return AppSourceGuard.stripComments(brut).contains(motif) ? url.lastPathComponent : nil
        }.sorted()
    }

    private func source(_ nom: String) throws -> String {
        let url = try XCTUnwrap(sources(under: Self.racineApp).first { $0.lastPathComponent == nom },
                                "\(nom) introuvable sous \(Self.racineApp.path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - Non-vacuité

    func test_leBalayage_voitLesSourcesDeLAppEtDuSDK() {
        XCTAssertGreaterThan(sources(under: Self.racineApp).count, 200)
        XCTAssertGreaterThan(sources(under: Self.racineSDK).count, 200)
    }

    // MARK: - Un seul montage

    func test_laFeuilleDeStickers_nEstMonteeQueParLeComposantUnique() {
        XCTAssertEqual(fichiers(contenant: "StickerPickerView(", sous: Self.racineApp), ["MeeshyStickerSheet.swift"],
                       "`StickerPickerView` ne se monte QUE dans `MeeshyStickerSheet` : un second montage "
                           + "rouvrirait une feuille aux onglets amputés.")
        XCTAssertEqual(fichiers(contenant: "StickerPickerView(", sous: Self.racineSDK), [],
                       "L'atelier du SDK ne monte plus de feuille : sa porte la demande à l'hôte.")
    }

    /// **La moitié qui empêche de « réussir » en ne montant plus rien** : les
    /// deux destinations utilisent le composant.
    func test_laConversationEtLaScene_utilisentLeComposant() throws {
        XCTAssertTrue(try source("ConversationView+Composer.swift").contains("MeeshyStickerSheet("),
                      "la conversation présente la feuille unique")
        XCTAssertTrue(try source("MeeshyComposerHost+Pickers.swift").contains("MeeshyStickerSheet("),
                      "la scène d'un post, d'un réel ou d'une story présente la feuille unique")
        XCTAssertTrue(try source("MeeshyComposerHost+Portals.swift").contains(".storyStickerSheetRequestProvided"),
                      "la porte « Stickers » de l'atelier demande la feuille au meuble")
    }

    // MARK: - Ce que le composant porte

    /// Tous les injecteurs et les deux détentes, posés UNE fois : chaque
    /// destination reçoit les mêmes onglets.
    func test_leComposant_porteTousLesInjecteursEtLesDeuxDetentes() throws {
        let feuille = try source("MeeshyStickerSheet.swift")
        for injecteur in [".storyPasteProvided()", ".storyStickerLibraryProvided()", ".stickerNearbyPlacesProvided()",
                          ".stickerSheetDieCut(", ".meeStickersProvided", ".meeInstantsProvided",
                          ".stickerPackShelfProvided(", ".storyLocationPickerProvided(",
                          ".presentationDetents([.medium, .large])"] {
            XCTAssertTrue(feuille.contains(injecteur), "sans `\(injecteur)`, une destination perd un onglet")
        }
    }
}
