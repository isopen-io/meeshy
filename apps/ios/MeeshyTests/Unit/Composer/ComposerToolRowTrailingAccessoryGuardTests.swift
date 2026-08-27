import XCTest
@testable import Meeshy

/// **Revue Opus 2026-08-27 — la capsule de langue chevauchait la bande de
/// mentions (#3904), rejouant #3903 au coin opposé.**
///
/// Cause : `documentLanguageCapsule` était posée en `.overlay(alignment:
/// .bottomTrailing)` sur TOUTE `ComposerDocumentSurface`, sur la promesse que
/// `toolRow` restait « la seule ligne peinte au bas de la surface ». #3904 a
/// rendu cette promesse fausse — `ComposerMentionStrip` peut désormais
/// s'afficher SOUS `toolRow` dans le même `VStack` — et l'overlay recouvrait
/// alors la moitié de la bande, la rendant intappable sur cette zone.
///
/// Même correctif que #3903, à l'autre bout du `HStack` : la capsule voyage
/// désormais par `toolRowTrailingAccessory`, un slot rendu DANS la
/// disposition de `toolRow` — un enfant du flux ne chevauche jamais ce qui se
/// peint plus bas dans le `VStack` parent, quel que soit son contenu. Même
/// patron de garde par la SOURCE que `ComposerToolRowLeadingAccessoryGuardTests`
/// (R5/R15, pas de UIKit réel).
final class ComposerToolRowTrailingAccessoryGuardTests: XCTestCase {

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

    func test_composerDocumentSurface_declaresATypedTrailingAccessoryProperty() throws {
        let source = try surfaceSource()
        XCTAssertTrue(
            source.contains("var toolRowTrailingAccessory: AnyView? = nil"),
            "`ComposerDocumentSurface` doit déclarer `toolRowTrailingAccessory` comme propriété stockée."
        )
    }

    func test_toolRow_rendersTrailingAccessoryInsideTheSameHStackAsTheIcons() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("toolRowTrailingAccessory"),
            "`toolRow` ne rend plus `toolRowTrailingAccessory` : la capsule de langue redeviendrait un "
                + "overlay séparé — la source même du chevauchement corrigé par la revue Opus 2026-08-27."
        )
        // `accessoryRange` est cherché APRÈS `spacerRange` : la condition qui
        // montre `toolRow` cite `toolRowTrailingAccessory != nil` (pour ne
        // pas cacher la capsule quand `tools` est vide) — une première
        // occurrence LÉGITIME avant le `Spacer()`.
        guard let spacerRange = toolRow.range(of: "Spacer()"),
              let accessoryRange = toolRow.range(
                of: "toolRowTrailingAccessory", range: spacerRange.upperBound..<toolRow.endIndex
              ) else {
            return XCTFail("Structure de `toolRow` inattendue — `Spacer()`/accessoire introuvables.")
        }
        XCTAssertTrue(
            spacerRange.lowerBound < accessoryRange.lowerBound,
            "`toolRowTrailingAccessory` doit suivre le `Spacer()` : c'est le slot de QUEUE de la rangée."
        )
    }

    func test_toolRow_showsWhenOnlyAnAccessoryIsPresent_evenWithNoTools() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("toolRowLeadingAccessory != nil || toolRowTrailingAccessory != nil"),
            "La condition qui montre `toolRow` doit couvrir les DEUX accessoires en plus de `!tools.isEmpty` — "
                + "sinon une rangée d'outils vide ferait aussi disparaître silencieusement le chip de lieu ET "
                + "la capsule de langue, qui ne dépendent d'aucun des deux de `tools`."
        )
    }

    func test_host_documentSurface_noLongerOverlaysTheLanguageCapsuleOnTheWholeSurface() throws {
        let source = try hostSource()
        guard let block = body(of: "private var documentSurface: some View {", in: source) else {
            return XCTFail("`documentSurface` introuvable dans le meuble — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(
            block.contains(".overlay(alignment: .bottomTrailing)"),
            "`documentSurface` pose encore un `.overlay(alignment: .bottomTrailing)` — c'est exactement la "
                + "cause du chevauchement avec la bande de mentions. La capsule de langue doit désormais "
                + "voyager par l'argument `toolRowTrailingAccessory:` de `ComposerDocumentSurface(`."
        )
        XCTAssertTrue(
            block.contains("toolRowTrailingAccessory:"),
            "`documentSurface` doit passer `toolRowTrailingAccessory:` à `ComposerDocumentSurface(` — sans "
                + "cela la capsule de langue n'est plus affichée du tout."
        )
        XCTAssertTrue(
            block.contains("documentLanguageCapsule"),
            "`documentLanguageCapsule` doit toujours être construite quelque part dans `documentSurface` — "
                + "seul son point d'attache dans la disposition change."
        )
    }
}
