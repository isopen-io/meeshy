import XCTest
@testable import Meeshy

/// Test minimal embarqué de `LentilleSkeletonRow` (contrat LWS-7, workshop
/// I-066) : « géométrie == métriques du rang (pas de littéral) ». Aucun
/// framework d'inspection SwiftUI n'est disponible dans ce bundle — un test
/// de rendu ne distinguerait de toute façon pas une hauteur DÉRIVÉE d'un
/// token d'une hauteur qui coïncide numériquement par hasard, or c'est
/// exactement la propriété à garder (« aucun saut à l'hydratation » exige
/// une IDENTITÉ de source, pas une coïncidence de valeur). Garde de
/// STRUCTURE sur le code source, à la manière de `StickySectionStructureTests`.
///
/// Suite complète (`LentilleSkeletonGeometryTests`, nom cité par le contrat
/// §LWS-7) : I-068.
final class LentilleSkeletonRowTests: XCTestCase {

    private func skeletonSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // .../Unit/Lentille
            .deletingLastPathComponent() // .../Unit
            .deletingLastPathComponent() // .../MeeshyTests
            .deletingLastPathComponent() // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Lentille/Row/LentilleSkeletonRow.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func realRowSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// La hauteur de layout du rang squelette doit être LA MÊME référence que
    /// celle du rang réel (`LentilleMetrics.Row.height(for: dynamicTypeSize)`,
    /// 84 à la taille de texte par défaut) — jamais un littéral recopié, et
    /// jamais la hauteur fixe `LentilleMetrics.Row.height` : à une taille de
    /// texte agrandie, le rang réel grandit et la liste sauterait à
    /// l'hydratation.
    func test_skeletonRow_usesRowHeightMetric_notALiteral() throws {
        let expected = "frame(height: LentilleMetrics.Row.height(for: dynamicTypeSize))"
        let code = normalizedCode(try skeletonSource())
        XCTAssertTrue(
            code.contains(expected),
            "LentilleSkeletonRow doit fixer sa hauteur de layout avec LentilleMetrics.Row.height(for: dynamicTypeSize) — même référence que LentilleConversationRow, Dynamic Type compris, aucun littéral recopié"
        )
        XCTAssertTrue(
            normalizedCode(try realRowSource()).contains(expected),
            "LentilleConversationRow doit poser la même hauteur de layout que son squelette"
        )
    }

    /// L'avatar squelette doit avoir EXACTEMENT le diamètre de l'avatar réel
    /// (`LentilleMetrics.Avatar.size`, 44) — même token, même contexte.
    func test_skeletonRow_avatarPlaceholder_usesAvatarSizeMetric() throws {
        let code = normalizedCode(try skeletonSource())
        XCTAssertTrue(
            code.contains("width: LentilleMetrics.Avatar.size, height: LentilleMetrics.Avatar.size"),
            "L'avatar du squelette doit être dimensionné par LentilleMetrics.Avatar.size, comme LentilleConversationRow"
        )
    }

    /// Le padding du rang squelette doit reprendre EXACTEMENT les tokens du
    /// rang réel — sans quoi le contenu « saute » à l'hydratation même si la
    /// hauteur globale coïncide.
    func test_skeletonRow_padding_usesRowMetrics() throws {
        let code = normalizedCode(try skeletonSource())
        XCTAssertTrue(code.contains("padding(.horizontal, LentilleMetrics.Row.paddingHorizontal)"))
        XCTAssertTrue(code.contains("padding(.vertical, LentilleMetrics.Row.paddingVertical)"))
    }

    /// Les deux « barres » du squelette doivent être posées avec les MÊMES
    /// polices que `LentilleConversationRow` (nom, ligne 2) — sinon leur
    /// hauteur de ligne diverge du rang réel, même géométrie de conteneur.
    func test_skeletonRow_twoBars_useSameFontsAsRealRow() throws {
        let code = normalizedCode(try skeletonSource())
        XCTAssertTrue(code.contains("font(LentilleMetrics.Name.font)"), "première barre — même police que le nom du rang réel")
        XCTAssertTrue(code.contains("font(LentilleMetrics.Line2.font)"), "seconde barre — même police que la ligne 2 du rang réel")
    }

    /// Garde R15 : aucun littéral de géométrie propre à ce fichier (déjà
    /// vérifié par `scripts/check-law-literals.sh`, dupliqué ici en
    /// assertion directe pour rester dans ce fichier de test — les cotes
    /// numériques attendues n'apparaissent QUE via `LentilleMetrics`).
    func test_skeletonRow_neverHardcodes44or64() throws {
        let code = normalizedCode(try skeletonSource())
        XCTAssertFalse(code.contains("height: 64") || code.contains("height: 84"), "hauteur du rang : jamais en dur, toujours LentilleMetrics.Row.height(for:)")
        XCTAssertFalse(code.contains("width: 44") || code.contains(": 44,"), "diamètre avatar : jamais 44 en dur, toujours LentilleMetrics.Avatar.size")
    }
}
