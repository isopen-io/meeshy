import XCTest

/// Garde contre la RÉAPPARITION du build figé : l'app installée portait 1800
/// pendant que le projet déclarait 1821 (#6186, mesuré le 2026-09-12 sur
/// `Services CEO i16pm`).
///
/// Le 2026-07-22, `ba356ef7b9` (« drop agvtool — version via build settings »)
/// pose `CFBundleVersion = $(CURRENT_PROJECT_VERSION)` dans les QUATRE
/// Info.plist, en miroir de `$(MARKETING_VERSION)` : le numéro se propage alors
/// à l'app ET à ses extensions, sans mutation de fichier. Le 2026-08-04,
/// `b16042856f` (« build 1271 — TestFlight ») remplace la variable par la
/// littérale `1271`. La décision est défaite sans un mot, et chaque « chore
/// build NNNN » suivant réécrit une littérale : 1271 → 1756 → 1800.
///
/// Pourquoi le script ne pouvait pas le voir : `write_build_number()` n'écrit
/// que dans `project.yml` et `project.pbxproj`, et `current_build_number()` lit
/// le `pbxproj`. `sync_build_number` compare donc 1821 à 1821, annonce
/// « aligné », et ne regarde JAMAIS les plists — la divergence est
/// structurellement invisible depuis l'outil censé la tenir.
///
/// Ce que cette garde protège : que la valeur reste une VARIABLE. Un test qui
/// comparerait le nombre du plist au nombre du projet serait vert le jour où on
/// les aligne à la main, puis faux à la publication suivante ; seule la forme
/// `$(…)` énonce l'invariant — le plist ne PORTE pas le numéro, il le RÉSOUT.
final class BundleVersionVariableGuardTests: XCTestCase {

    /// Les quatre cibles qui embarquent un Info.plist : leurs `CFBundleVersion`
    /// doivent toujours coïncider, sans quoi App Store Connect rejette le
    /// paquet. C'est la raison d'être de la variable partagée.
    private static let plistRelativePaths = [
        "Meeshy/Info.plist",
        "MeeshyNotificationExtension/Info.plist",
        "MeeshyShareExtension/Info.plist",
        "MeeshyWidgets/Info.plist",
    ]

    private static let buildVersionVariable = "$(CURRENT_PROJECT_VERSION)"
    private static let marketingVersionVariable = "$(MARKETING_VERSION)"

    private var iosDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Architecture
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func plist(_ relativePath: String) throws -> [String: Any] {
        let url = iosDirectory.appendingPathComponent(relativePath)
        let data = try Data(contentsOf: url)
        let parsed = try PropertyListSerialization.propertyList(from: data, format: nil)
        return try XCTUnwrap(parsed as? [String: Any], "\(relativePath) n'est pas un dictionnaire plist.")
    }

    func test_everyInfoPlist_resolvesBuildNumberFromTheProjectVariable() throws {
        for relativePath in Self.plistRelativePaths {
            let value = try XCTUnwrap(
                plist(relativePath)["CFBundleVersion"] as? String,
                "\(relativePath) ne déclare aucun CFBundleVersion."
            )

            XCTAssertEqual(
                value,
                Self.buildVersionVariable,
                """
                \(relativePath) fige CFBundleVersion à « \(value) ».

                Un plist ne PORTE pas le numéro de build, il le RÉSOUT : la seule
                valeur admise est \(Self.buildVersionVariable), alimentée par
                CURRENT_PROJECT_VERSION (project.yml + pbxproj, écrits par
                write_build_number). Une littérale ici rend l'app installée
                muette sur sa vraie version — et le script qui la synchronise ne
                lit pas ce fichier, donc rien ne rougit. Voir #6186.
                """
            )
        }
    }

    /// Contre-épreuve de forme : la version MARKETING est restée une variable
    /// dans les mêmes fichiers. C'est ce voisinage qui rend la littérale de
    /// `CFBundleVersion` reconnaissable comme une régression, et non comme un
    /// choix — les deux clés se tiennent, ou aucune.
    func test_everyInfoPlist_resolvesMarketingVersionFromTheProjectVariable() throws {
        for relativePath in Self.plistRelativePaths {
            let value = try XCTUnwrap(
                plist(relativePath)["CFBundleShortVersionString"] as? String,
                "\(relativePath) ne déclare aucun CFBundleShortVersionString."
            )

            XCTAssertEqual(
                value,
                Self.marketingVersionVariable,
                "\(relativePath) fige CFBundleShortVersionString à « \(value) » — même défaut que #6186, autre clé."
            )
        }
    }
}
