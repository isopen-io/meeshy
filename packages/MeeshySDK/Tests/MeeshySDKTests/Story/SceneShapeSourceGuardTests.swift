import XCTest

/// **Garde de source : la forme d'une scène a UN site, et tout hôte qui monte
/// le player le consulte** (#6904, décision #6896).
///
/// ## Ce qu'elle ferme
///
/// L'audit du 2026-09-17 a compté sur `dev` : onze montages du player,
/// quatorze fichiers de loi, **trois lois de ratio qui ne s'accordent pas**,
/// deux littéraux `9/16` et trois copies de la constante. Le document B avait
/// trois formes selon la surface. Rien ne rougissait — parce qu'une loi
/// dupliquée compile, et qu'un hôte qui n'en consulte aucune compile mieux
/// encore.
///
/// > **Un défaut de CONVERGENCE ne se voit dans aucun fichier.** Il se voit
/// > dans l'inventaire des fichiers, et seul un témoin qui balaie l'arbre le
/// > tient. C'est pourquoi la garde assertionne en ÉGALITÉ, jamais en
/// > inclusion : une inclusion resterait verte au douzième hôte.
///
/// ## Les deux exceptions, et leur date
///
/// Les hôtes de `apps/ios/` sont réécrits par la seconde moitié du lot ; la
/// liste d'exceptions est DATÉE et se vide à la fin du lot 2. Un hôte qui y
/// entre après cette date n'est pas une exception, c'est une régression.
final class SceneShapeSourceGuardTests: XCTestCase {

    /// **La constante 9:16 n'a qu'un site.** Toute autre écriture du rapport
    /// — littéral `9.0 / 16.0`, `9/16`, `0.5625` — est une copie qui dérivera.
    func test_leRapport9sur16_naQuUnSiteDansLeSDK() throws {
        let sources = try Self.swiftSources(under: "packages/MeeshySDK/Sources")
        let porteurs = sources
            .filter { Self.declaresTheRatio($0.code) }
            .map(\.path)

        XCTAssertEqual(Set(porteurs), ["MeeshySDK/Story/SceneShape.swift"],
                       "Le rapport 9:16 se lit dans SceneShape.aspect ; toute autre écriture est " +
                       "une copie. Trouvé : \(porteurs.sorted())")
    }

    /// **Tout hôte qui monte le player consulte la loi.** La liste d'exceptions
    /// porte les hôtes de `apps/ios/` que la seconde moitié du lot #6904
    /// réécrit — datée du 2026-09-17, et vide à la fin du lot.
    func test_toutHoteQuiMonteLePlayer_consulteLaLoi() throws {
        let exceptionsDatees: Set<String> = [
            // apps/ios — réécrits par la seconde moitié du lot #6904 (2026-09-17)
            "apps/ios/Meeshy/Features/Main/Views/PostSceneMosaic.swift",
            "apps/ios/Meeshy/Features/Main/Views/PostDetailView+Canvas.swift",
            "apps/ios/Meeshy/Features/Main/Views/PostDetailView+RepostEmbed.swift",
            "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift",
            "apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift",
            "apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift",
            "apps/ios/Meeshy/Features/Main/Views/FeedSceneAutoplay.swift",
            "apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift",
            // SDK — l'aperçu du composer, qui rend le document en cours d'édition
            "packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift",
        ]

        let hotes = try Self.swiftSources(under: "packages/MeeshySDK/Sources")
            .map { (path: "packages/MeeshySDK/Sources/" + $0.path, code: $0.code) }
            + Self.swiftSources(under: "apps/ios/Meeshy")
            .map { (path: "apps/ios/Meeshy/" + $0.path, code: $0.code) }

        let muets = hotes
            .filter { Self.mountsThePlayer($0.code) && !$0.code.contains("SceneShape") }
            .map(\.path)

        XCTAssertEqual(Set(muets), exceptionsDatees,
                       "Un hôte monte le player sans consulter SceneShape (ou une exception datée " +
                       "a été réécrite sans vider cette liste). Manquants : " +
                       "\(Set(muets).subtracting(exceptionsDatees).sorted()) ; " +
                       "exceptions périmées : \(exceptionsDatees.subtracting(Set(muets)).sorted())")
    }

    // MARK: - Méta-tests de la garde

    /// Contrôle positif : sans lui, un détecteur cassé resterait vert pour
    /// toujours et ne protégerait rien.
    func test_laGardeReconnaitUnMontageEtUneCopieDeLaConstante() {
        XCTAssertTrue(Self.mountsThePlayer("MeeshyScenePlayer(document: d, mode: .card)"))
        XCTAssertTrue(Self.mountsThePlayer("StoryReaderRepresentable(story: s, mute: false)"))
        XCTAssertTrue(Self.declaresTheRatio("let r: CGFloat = 9.0 / 16.0"))
        XCTAssertTrue(Self.declaresTheRatio("static let portraitRatio: CGFloat = 0.5625"))
    }

    /// Contrôle négatif : la forme corrigée ne déclenche rien, et un
    /// commentaire qui CITE le littéral non plus — une garde qui compte dans
    /// un fichier commenté valide la documentation, pas le code.
    func test_laGardeIgnoreLaProjectionEtLesCommentaires() {
        XCTAssertFalse(Self.declaresTheRatio("static let portraitRatio = SceneShape.aspect"))
        XCTAssertFalse(Self.mountsThePlayer("// il montait MeeshyScenePlayer(mode: .preview) ici"))
        XCTAssertFalse(Self.declaresTheRatio("/// le gabarit 9.0 / 16.0 de la composition"))
    }

    // MARK: - Détecteurs

    /// Un montage, et non une mention : le nom SUIVI d'une parenthèse
    /// ouvrante, commentaires retirés.
    static func mountsThePlayer(_ rawCode: String) -> Bool {
        let code = stripComments(rawCode)
        return ["MeeshyScenePlayer(", "StoryReaderRepresentable(", "StoryCanvasUIView("]
            .contains { code.contains($0) }
    }

    /// Le rapport ÉCRIT, sous ses trois orthographes. `designWidth /
    /// designHeight` n'en est pas une : c'est une définition d'espace de
    /// design, pas du gabarit de scène — elle devient une projection sans
    /// cesser d'être une division.
    static func declaresTheRatio(_ rawCode: String) -> Bool {
        let code = stripComments(rawCode)
        for forme in ["9.0 / 16.0", "9.0/16.0", "9 / 16", "0.5625"] where code.contains(forme) {
            return true
        }
        return false
    }

    // MARK: - Helpers

    static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        // Tests/MeeshySDKTests/Story/<fichier> → packages/MeeshySDK → packages → racine
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    static func swiftSources(under relative: String) throws -> [(path: String, code: String)] {
        let root = repoRoot.appendingPathComponent(relative)
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        else { return [] }
        var out: [(path: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let chemin = url.path.replacingOccurrences(of: root.path + "/", with: "")
            out.append((chemin, try String(contentsOf: url, encoding: .utf8)))
        }
        return out.sorted { $0.path < $1.path }
    }

    /// Retire les commentaires — ligne et bloc. Miroir local de
    /// `ComposerSourceGuard.stripComments`, que `MeeshySDKTests` ne voit pas
    /// (il vit dans la cible `MeeshyUITests`).
    static func stripComments(_ source: String) -> String {
        var sortie = ""
        var index = source.startIndex
        var dansLigne = false
        var dansBloc = false
        while index < source.endIndex {
            let reste = source[index...]
            if dansLigne {
                if source[index] == "\n" { dansLigne = false; sortie.append("\n") }
                index = source.index(after: index)
                continue
            }
            if dansBloc {
                if reste.hasPrefix("*/") {
                    dansBloc = false
                    index = source.index(index, offsetBy: 2)
                } else {
                    index = source.index(after: index)
                }
                continue
            }
            if reste.hasPrefix("//") { dansLigne = true; index = source.index(index, offsetBy: 2); continue }
            if reste.hasPrefix("/*") { dansBloc = true; index = source.index(index, offsetBy: 2); continue }
            sortie.append(source[index])
            index = source.index(after: index)
        }
        return sortie
    }
}
