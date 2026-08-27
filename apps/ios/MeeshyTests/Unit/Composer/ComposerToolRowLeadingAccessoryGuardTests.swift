import XCTest
@testable import Meeshy

/// **#3903 — le chip « Position » chevauchait l'icône caméra dans `toolRow`.**
///
/// Cause : `documentLocationTile` était posé en `.overlay(alignment:
/// .bottomLeading)` sur TOUTE `ComposerDocumentSurface`, exactement où
/// `toolRow` peint sa première icône (elle aussi calée au bord de tête, sans
/// retrait). Un overlay et le premier enfant d'un `HStack` occupent le MÊME
/// point de l'écran — rien n'empêchait la superposition, à aucune taille
/// d'écran ni palier de Dynamic Type.
///
/// Le correctif fait entrer le chip DANS la disposition de `toolRow` (un slot
/// de tête rendu par le même `HStack` que les icônes) plutôt que de le
/// stacker par-dessus : deux enfants d'un `HStack` ne se superposent jamais,
/// par construction, quelle que soit la taille — c'est la rangée elle-même
/// qui garantit l'absence de chevauchement, pas une mesure de frame au cas
/// par cas. Cette garde le prouve par la SOURCE (même patron que
/// `FocalDynamicTypeTests` : suite tournée sans UIKit réel, R5/R15) plutôt que
/// par une capture d'écran.
final class ComposerToolRowLeadingAccessoryGuardTests: XCTestCase {

    private func surfaceSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: surfaceURL(), encoding: .utf8))
    }

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: hostURL(), encoding: .utf8))
    }

    private func surfaceURL() -> URL {
        composerRoot().appendingPathComponent("ComposerDocumentSurface.swift")
    }

    private func hostURL() -> URL {
        composerRoot().appendingPathComponent("MeeshyComposerHost.swift")
    }

    private func composerRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer")
    }

    /// Le corps d'une déclaration par appariement d'accolades — même patron que
    /// `ComposerDocumentSurfaceTests.corpsDeDeclaration`. `nil` quand l'ancre a
    /// disparu : l'appelant fait alors rougir, jamais passer en silence.
    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    // MARK: - `ComposerDocumentSurface` expose un slot de tête nommé

    func test_composerDocumentSurface_declaresATypedLeadingAccessoryProperty() throws {
        let source = try surfaceSource()
        XCTAssertTrue(
            source.contains("var toolRowLeadingAccessory: AnyView? = nil"),
            "`ComposerDocumentSurface` doit déclarer `toolRowLeadingAccessory` comme propriété stockée "
                + "(`AnyView?`, défaut `nil`) — un slot nommé qu'une assertion peut cibler, pas une condition "
                + "écrite en ligne dans `toolRow` qu'aucun test ne pourrait viser."
        )
    }

    // MARK: - `toolRow` rend le slot DANS le même HStack que les icônes

    func test_toolRow_rendersLeadingAccessoryInsideTheSameHStackAsTheIcons() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("toolRowLeadingAccessory"),
            "`toolRow` ne rend plus `toolRowLeadingAccessory` : le chip de tête (lieu, ou tout autre état actif) "
                + "n'aurait plus de place réservée dans la rangée, et redeviendrait un overlay séparé — la "
                + "source même du chevauchement #3903."
        )
        // `accessoryRange` est cherché APRÈS `hstackRange` (revue Opus
        // 2026-08-27) : la condition qui montre `toolRow` cite désormais
        // `toolRowLeadingAccessory != nil` (pour ne pas cacher le chip quand
        // `tools` est vide) — une première occurrence LÉGITIME avant le
        // `HStack`, que `range(of:)` sans borne aurait prise pour LE slot.
        guard let hstackRange = toolRow.range(of: "HStack(spacing: 16) {"),
              let accessoryRange = toolRow.range(
                of: "toolRowLeadingAccessory", range: hstackRange.upperBound..<toolRow.endIndex
              ),
              let forEachRange = toolRow.range(of: "ForEach(tools") else {
            return XCTFail("Structure de `toolRow` inattendue — HStack/accessoire/ForEach introuvables.")
        }
        XCTAssertTrue(
            hstackRange.lowerBound < accessoryRange.lowerBound,
            "`toolRowLeadingAccessory` doit être rendu À L'INTÉRIEUR du `HStack` de `toolRow`, pas avant lui — "
                + "sinon il resterait hors de la disposition qui garantit l'absence de chevauchement."
        )
        XCTAssertTrue(
            accessoryRange.lowerBound < forEachRange.lowerBound,
            "`toolRowLeadingAccessory` doit précéder `ForEach(tools` : c'est le slot de TÊTE de la rangée, "
                + "symétrique de la place qu'occupait l'ancien overlay `.bottomLeading`."
        )
    }

    // MARK: - Le meuble ne stacke plus le chip de lieu par-dessus toute la surface

    func test_host_documentSurface_noLongerOverlaysTheLocationTileOnTheWholeSurface() throws {
        let source = try hostSource()
        guard let block = body(of: "private var documentSurface: some View {", in: source) else {
            return XCTFail("`documentSurface` introuvable dans le meuble — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(
            block.contains(".overlay(alignment: .bottomLeading)"),
            "`documentSurface` pose encore un `.overlay(alignment: .bottomLeading)` — c'est exactement la "
                + "cause du chevauchement #3903 (même z-niveau que la première icône de `toolRow`). Le chip de "
                + "lieu doit désormais voyager par l'argument `toolRowLeadingAccessory:` de `ComposerDocumentSurface(`."
        )
        XCTAssertTrue(
            block.contains("toolRowLeadingAccessory:"),
            "`documentSurface` doit passer `toolRowLeadingAccessory:` à `ComposerDocumentSurface(` — sans cela "
                + "le chip de lieu n'est plus affiché du tout."
        )
        XCTAssertTrue(
            block.contains("documentLocationTile"),
            "`documentLocationTile` doit toujours être construit quelque part dans `documentSurface` — la "
                + "tuile elle-même n'a pas changé, seul son point d'attache dans la disposition change."
        )
    }
}
