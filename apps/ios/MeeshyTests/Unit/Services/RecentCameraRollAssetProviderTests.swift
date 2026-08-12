import XCTest
@testable import Meeshy

/// S5 — la vignette « dernière photo » de la page blanche, côté app.
///
/// Ce que ces tests protègent tient en une phrase produit : **le composer ne
/// demande JAMAIS l'accès aux photos à son ouverture.** Un prompt système que
/// l'utilisateur n'a pas provoqué est le meilleur moyen d'obtenir un refus
/// définitif — et, une fois refusé, iOS ne re-demande plus jamais. La vignette
/// n'apparaît donc que si l'accès était DÉJÀ accordé ; sinon la capsule
/// « Galerie » attend un geste explicite, et son tap seul déclenche la demande.
///
/// Gardes de source, et pas tests de comportement : l'état TCC du bundle de
/// tests est global, non réinitialisable en cours de run, et le premier appel
/// réel afficherait une alerte système qui bloquerait la suite. C'est
/// exactement le cas où une garde de source prouve ce qu'aucun rendu ne montre
/// — l'ABSENCE d'une demande sur un chemin donné.
final class RecentCameraRollAssetProviderTests: XCTestCase {

    private func providerSource() throws -> String {
        let projectRoot = #filePath.components(separatedBy: "/MeeshyTests/").first ?? ""
        let path = "\(projectRoot)/Meeshy/Features/Main/Services/RecentCameraRollAssetProvider.swift"
        let raw = try String(contentsOfFile: path, encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let comment = line.range(of: "//") else { return line }
                return line[line.startIndex..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    private func body(of declaration: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: declaration),
                                  "« \(declaration) » a disparu du fournisseur.")
        let rest = source[start.upperBound...]
        // La déclaration suivante borne le corps : toutes les fonctions du
        // fichier sont déclarées au même niveau d'indentation.
        guard let next = rest.range(of: "\n    static ") ?? rest.range(of: "\n    private static ") else {
            return String(rest)
        }
        return String(rest[..<next.lowerBound])
    }

    /// Le chemin appelé à l'`onAppear` du composer.
    func test_latest_neverAsksForPhotoLibraryPermission() throws {
        let source = try providerSource()
        let latest = try body(of: "static func latest()", in: source)

        XCTAssertFalse(
            latest.contains("ensurePhotoLibraryRead"),
            """
            `latest()` est appelée à l'ouverture du composer : y demander l'accès \
            ferait surgir une alerte système sur un écran que l'utilisateur vient \
            d'ouvrir pour écrire. Un refus y est définitif.
            """
        )
        XCTAssertTrue(
            latest.contains("isReadAuthorized"),
            "Sans le garde d'autorisation, PhotoKit prompterait de lui-même à la première requête."
        )
    }

    /// Le chemin appelé par le TAP sur la capsule « Galerie ».
    func test_requestAccess_goesThroughTheSharedPermissionCoordinator() throws {
        let source = try providerSource()
        let request = try body(of: "static func requestAccess()", in: source)

        XCTAssertTrue(
            request.contains("MediaPermissionCoordinator.ensurePhotoLibraryRead"),
            """
            La demande passe par la porte UNIQUE de l'app : demander avant d'agir, \
            ne prompter qu'une fois, rendre tout refus définitif actionnable.
            """
        )
        XCTAssertTrue(
            request.contains("announcesRefusal: false"),
            """
            Même recette que `RecentMediaStrip` : le SDK enchaîne déjà sur le \
            `PhotosPicker` système, un toast de refus parlerait d'une impasse \
            qui n'existe pas.
            """
        )
    }

    /// Le crash de prod Meeshy-2026-07-11 : une closure littérale écrite dans
    /// cette cible hérite de `@MainActor` (isolation par défaut), et Swift 6
    /// pose une assertion d'isolation dans son prologue — elle trappe dès que
    /// PhotoKit l'invoque depuis sa propre file.
    func test_thePhotoKitCompletionIsAnExplicitlySendableLocal() throws {
        let source = try providerSource()

        XCTAssertTrue(
            source.contains("let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void"),
            """
            La complétion doit être une variable locale explicitement typée \
            `@Sendable` — jamais une closure suiveuse, dont le prologue trappe \
            hors du MainActor (même seam que `RecentMediaStrip`).
            """
        )
        XCTAssertFalse(
            source.contains("var resumed"),
            """
            Un drapeau `var` capté par une closure `@Sendable` n'est ni sûr ni \
            compilable : le loquet de reprise unique passe par \
            `PhotoKitResumeLatch`.
            """
        )
    }

    /// Le loquet de reprise reste un loquet : deux reprises = crash de la
    /// continuation, zéro reprise = fuite (« SWIFT TASK CONTINUATION MISUSE »).
    func test_resumeLatch_letsExactlyOneCallerThrough() {
        let latch = PhotoKitResumeLatch()

        XCTAssertTrue(latch.claim())
        XCTAssertFalse(latch.claim())
        XCTAssertFalse(latch.claim())
    }

    /// Le fournisseur injecté au SDK expose bien les TROIS opérations : sans
    /// `requestAccess`, la capsule « Galerie » redeviendrait un cul-de-sac pour
    /// qui n'a pas encore accordé l'accès.
    func test_theInjectedProviderCarriesTheAccessRequestSeam() throws {
        let source = try providerSource()

        for seam in ["latest:", "fullImage:", "requestAccess:"] {
            XCTAssertTrue(
                source.contains(seam),
                "« \(seam) » manque à l'injection : le SDK perdrait une capacité en silence."
            )
        }
    }
}
