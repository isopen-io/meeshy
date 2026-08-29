import XCTest

/// **Le Pattern I4 nomme cinq écrans, et rien ne vérifiait qu'ils gardent leur
/// squelette.**
///
/// La bible d'architecture (`docs/superpowers/specs/2026-03-17-architecture-bible-design.md`
/// § Pattern I4) dit : « Chaque ecran DOIT avoir un skeleton qui mime la forme
/// du contenu final », et en nomme cinq dans un tableau. Les cinq sont conformes
/// — mesuré au 266i — et **aucun test ne le mesurait** (#4319).
///
/// Le mode de panne est concret, pas théorique : un refactor de
/// `ConversationListView` qui retire la rangée squelette rendrait l'écran
/// PRINCIPAL de l'app **blanc au démarrage à froid**, et tout resterait vert.
/// C'est la forme de #4302 (budget de taille), #4292 (cliquet i18n) et #4311
/// (tailles figées) : une règle déclarée, nommant une liste précise, dont la
/// mesure n'existe pas.
///
/// ### Pourquoi cette liste-ci et pas les 74 autres écrans
///
/// 82 fichiers rendent un `ProgressView` ; 74 n'ont aucun squelette. Les juger
/// demanderait de décider, écran par écran, si le spinner est un démarrage à
/// froid (à remplacer) ou une pagination / un bouton / un téléchargement (à
/// garder) — un travail de design, invérifiable sans simulateur. **Les cinq
/// écrans ci-dessous sont nommés par la BIBLE, pas par moi** : la garde épingle
/// une décision déjà prise, elle n'en invente aucune.
final class SkeletonColdStartGuardTests: XCTestCase {

    /// Écran → composant squelette qu'il doit monter, selon le Pattern I4.
    ///
    /// Le composant peut vivre dans l'app (`Views/Skeletons/`) ou dans le SDK
    /// (`MeeshyUI/Primitives/SkeletonView.swift`) — la garde vérifie le MONTAGE,
    /// pas le lieu de définition. Deux d'entre eux sont composites
    /// (`SkeletonFeedList` → `SkeletonFeedPost`, `SkeletonStoryTrayRow` →
    /// `SkeletonStoryThumb`) : c'est le conteneur que l'écran monte, donc c'est
    /// lui qu'on épingle.
    private static let matrix: [(screen: String, skeleton: String)] = [
        ("Features/Main/Views/ConversationListView.swift", "SkeletonConversationRow"),
        ("Features/Main/Views/ConversationView.swift",     "SkeletonMessageBubble"),
        ("Features/Main/Views/FeedView.swift",             "SkeletonFeedList"),
        ("Features/Main/Views/StoryTrayView.swift",        "SkeletonStoryTrayRow"),
        ("Features/Main/Views/ProfileView.swift",          "SkeletonProfileHeader"),
    ]

    // MARK: - La règle

    func test_lesCinqEcransDuPatternI4MontentLeurSquelette() throws {
        let missing = try Self.matrix.compactMap { entry -> String? in
            let (screen, skeleton) = entry
            let source = try text(atRelativePath: screen)
            guard !Self.mounts(skeleton, in: source) else { return nil }
            return "\(screen) ne monte plus `\(skeleton)()`"
        }

        XCTAssertTrue(
            missing.isEmpty,
            "Écran du Pattern I4 sans son squelette de démarrage à froid. Sans lui, l'écran est "
            + "VIDE tant que le cache est froid — la bible impose un squelette, jamais un "
            + "`ProgressView` :\n  " + missing.joined(separator: "\n  ")
        )
    }

    /// Un squelette qui n'existe plus nulle part serait « monté » par un écran
    /// qui ne compile pas — donc jamais. Mais un squelette RENOMMÉ compilerait
    /// des deux côtés en laissant la matrice mentir : on vérifie donc que chaque
    /// nom épinglé est bien DÉFINI quelque part.
    func test_chaqueSqueletteEpingleExisteBien() throws {
        let haystack = try definitionCorpus()

        // `\.skeleton` serait un key path sur un ÉLÉMENT DE TUPLE : Swift n'en
        // accepte pas, même labellisé (même piège que `\.1` au 264i).
        let undefined = Self.matrix
            .map { $0.skeleton }
            .filter { !haystack.contains("struct \($0)") }
            .sorted()

        XCTAssertTrue(
            undefined.isEmpty,
            "Squelette épinglé sans définition (app ou SDK) : \(undefined)"
        )
    }

    // MARK: - Bornes

    /// Sans elle, la règle passerait au vert en lisant des fichiers vides — le
    /// mode de panne payé au 256i et rejoué au 257i.
    func test_lesCinqEcransSontBienLusEtNonVides() throws {
        for (screen, _) in Self.matrix {
            let source = try text(atRelativePath: screen)
            XCTAssertGreaterThan(
                source.count, 2_000,
                "\(screen) lu vide ou tronqué — la règle ne mesurerait rien"
            )
        }
    }

    /// Témoins synthétiques : le détecteur doit répondre NON quand il faut.
    /// Sans eux, `mounts` pourrait rendre `true` sur n'importe quoi et les deux
    /// règles resteraient vertes en ne protégeant plus rien.
    func test_leDetecteurDeMontageDistingueMontageEtMention() {
        XCTAssertTrue(Self.mounts("SkeletonFeedList", in: "  SkeletonFeedList()"))
        XCTAssertTrue(Self.mounts("SkeletonFeedList", in: "if empty { SkeletonFeedList(count: 3) }"))

        // Une MENTION n'est pas un montage : un commentaire ou une chaîne qui
        // nomme le squelette ne le met pas à l'écran.
        XCTAssertFalse(Self.mounts("SkeletonFeedList", in: "// SkeletonFeedList() à rebrancher"))
        XCTAssertFalse(Self.mounts("SkeletonFeedList", in: #"let name = "SkeletonFeedList()""#))
        XCTAssertFalse(Self.mounts("SkeletonFeedList", in: "SkeletonFeedListPreview()"))
        XCTAssertFalse(Self.mounts("SkeletonFeedList", in: "ProgressView()"))
    }

    // MARK: - Détection

    /// `Nom(` dans du code — commentaires et chaînes neutralisés par
    /// `DeclarationBodyScanner.mask`, et le caractère qui PRÉCÈDE doit être un
    /// séparateur : sans quoi `SkeletonFeedListPreview()` compterait comme un
    /// montage de `SkeletonFeedList`.
    static func mounts(_ skeleton: String, in source: String) -> Bool {
        let masked = DeclarationBodyScanner.mask(source)
        guard let marker = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])\(skeleton)\\s*\\(")
        else { return false }
        let ns = masked as NSString
        return marker.rangeOfFirstMatch(
            in: masked, range: NSRange(location: 0, length: ns.length)
        ).location != NSNotFound
    }

    // MARK: - Fichiers

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func text(atRelativePath path: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/\(path)"), encoding: .utf8)
    }

    /// Toutes les sources de l'app ET du SDK concaténées : deux des cinq
    /// squelettes sont définis dans `MeeshyUI`, pas dans l'app.
    private func definitionCorpus() throws -> String {
        let roots = [
            iosRoot.appendingPathComponent("Meeshy"),
            iosRoot.deletingLastPathComponent()      // apps
                .deletingLastPathComponent()         // racine du dépôt
                .appendingPathComponent("packages/MeeshySDK/Sources"),
        ]
        return roots.flatMap { root -> [String] in
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
            else { return [] }
            return walker.compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" }
                .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
        }.joined(separator: "\n")
    }
}
