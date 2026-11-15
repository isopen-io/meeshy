import XCTest
@testable import MeeshySDK

/// #6539 — **aucune source du SDK ne recolle une base d'API et le chemin d'une
/// adresse du catalogue.**
///
/// ## Le défaut que la garde interdit de rejouer
///
/// `MeeshyEndpoint.path` est le chemin COMPLET (`/api/v1/sync`), et
/// `apiBaseURL` porte déjà `/api/v1`. `SyncDeltaClient` écrivait
/// `baseURL + SyncEndpoint.root.path` : l'app appelait `/api/v1/api/v1/sync`,
/// la passerelle répondait 404 à chaque synchronisation delta, et le moteur
/// retombait en silence sur le chargement complet. Le doc-comment de
/// `MeeshyEndpoint.absoluteURLString` nommait pourtant exactement ce piège.
///
/// ## Ce que la garde laisse passer
///
/// La composition vit à UN endroit : `MeeshyEndpoint.absoluteURLString`, qui
/// part de l'origine. `"\(baseURL)\(legacyPath)"` (`APIClient.ResolvedEndpoint`)
/// reste permis : un chemin HÉRITÉ est relatif à la base, ce n'est pas un
/// chemin du catalogue. Les deux cas négatifs ci-dessous le fixent, pour qu'on
/// n'élargisse pas le motif « juste un peu » au premier ajout légitime.
///
/// Les commentaires sont retirés avant le balayage : ce fichier et le
/// doc-comment de `MeeshyEndpoint` CITENT la forme interdite.
final class EndpointBaseURLConcatenationGuardTests: XCTestCase {

    /// `Tests/MeeshySDKTests/Networking/<ce fichier>` : 4 composants à retirer.
    private var sourcesRoot: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("Sources")
    }

    private static let formesInterdites: [NSRegularExpression] = [
        #"(?:api)?[Bb]aseURL\s*\+\s*[A-Z]\w*Endpoint\b[^\n]*?\.path\b"#,
        #"\\\(\s*(?:self\.)?(?:\w+\.)?(?:api)?[Bb]aseURL\s*\)\\\(\s*[A-Z]\w*Endpoint\b[^\n]*?\.path\s*\)"#,
        #"(?:api)?[Bb]aseURL[^\n]*appending(?:PathComponent)?\(\s*[A-Z]\w*Endpoint\b[^\n]*?\.path\b"#,
    ].map { try! NSRegularExpression(pattern: $0) }

    private func fichiersSwift() -> [URL] {
        guard let e = FileManager.default.enumerator(at: sourcesRoot, includingPropertiesForKeys: nil) else {
            return []
        }
        return e.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func estCommentaire(_ ligne: Substring) -> Bool {
        let nu = ligne.trimmingCharacters(in: .whitespaces)
        return nu.hasPrefix("//") || nu.hasPrefix("*") || nu.hasPrefix("/*")
    }

    private func recolle(_ ligne: String) -> Bool {
        let etendue = NSRange(ligne.startIndex..., in: ligne)
        return Self.formesInterdites.contains { $0.firstMatch(in: ligne, range: etendue) != nil }
    }

    func test_leBalayageVoitReellementLesSources() {
        XCTAssertGreaterThan(fichiersSwift().count, 100,
                             "une garde de source mal ancrée balaie ZÉRO fichier et passe au vert")
    }

    func test_leMotifReconnaitLesFormesQuIlInterdit() {
        XCTAssertTrue(recolle("guard var composants = URLComponents(string: baseURL + SyncEndpoint.root.path) else {"))
        XCTAssertTrue(recolle("let url = api.baseURL + PostsEndpoint.byPostId(postId: id).path"))
        XCTAssertTrue(recolle(#"let s = "\(baseURL)\(SyncEndpoint.root.path)""#))
        XCTAssertTrue(recolle(#"let s = "\(config.apiBaseURL)\(SyncEndpoint.root.path)""#))
        XCTAssertTrue(recolle("URL(string: apiBaseURL)!.appendingPathComponent(SyncEndpoint.root.path)"))
    }

    func test_leMotifLaissePasserLaCompositionUnique_etLesCheminsHerites() {
        XCTAssertFalse(recolle("absoluteURLString(apiBaseURL: MeeshyConfig.shared.apiBaseURL)"))
        XCTAssertFalse(recolle("URLComponents(string: SyncEndpoint.root.absoluteURLString(apiBaseURL: baseURL))"))
        XCTAssertFalse(recolle(#"self.urlString = "\(baseURL)\(legacyPath)""#))
        XCTAssertFalse(recolle("resolved: ResolvedEndpoint(legacyPath: endpoint, baseURL: baseURL),"))
    }

    func test_aucuneSourceNeRecolleUneBaseDApiEtUnCheminDuCatalogue() throws {
        let fautifs = try fichiersSwift().flatMap { fichier -> [String] in
            let lignes = try String(contentsOf: fichier, encoding: .utf8)
                .split(separator: "\n", omittingEmptySubsequences: false)
            return lignes.enumerated().compactMap { index, ligne in
                guard !estCommentaire(ligne), recolle(String(ligne)) else { return nil }
                return "\(fichier.lastPathComponent):\(index + 1) — \(ligne.trimmingCharacters(in: .whitespaces))"
            }
        }

        XCTAssertEqual(fautifs, [], """
        Une base d'API porte déjà `/api/v1` et `MeeshyEndpoint.path` est le chemin COMPLET : \
        les recoller double le préfixe (404). Composer par `endpoint.absoluteURLString` \
        ou `endpoint.absoluteURLString(apiBaseURL:)`.
        """)
    }
}
