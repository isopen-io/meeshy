import XCTest
@testable import Meeshy

/// Garde d'analyse de source : dans la surface CONVERSATION, une fonction
/// déclarée doit être ATTEIGNABLE — référencée ailleurs qu'à sa propre
/// déclaration.
///
/// ## Le défaut qu'elle fige (243i)
///
/// `ConversationView+MessageRow.swift` hébergeait deux fonctions qu'AUCUN commit
/// du dépôt n'a jamais appelées :
///
/// - `replyCountPill(count:isMe:parentMessageId:)` — une pastille « N réponses »
///   sous la bulle, avec son `Button`, son libellé, son `accessibilityLabel` et
///   son `accessibilityHint`. Le fil de réponses vivant passe par
///   `MessageMoreSheet` → `onThread` → `ThreadView`.
/// - `scrollToAndHighlight(_:proxy:)` — le saut-vers-le-message de l'époque
///   `ScrollView` SwiftUI, remplacé par `MessageListViewController`.
///
/// Entre elles, **trois clés de catalogue traduites en sept locales** pour des
/// pixels qui n'ont jamais existé — et un état, `highlightedMessageId`, dont
/// `scrollToAndHighlight` était le seul écrivain non nul et que rien ne lisait.
///
/// Ce n'est pas seulement du gaspillage. `conversation.view.reply.count.{one,many}`
/// a voyagé de report en report depuis 240i (« l'arabe y est lésé, six formes
/// pour deux branches Swift »), et TROIS itérations l'ont recopié sans jamais
/// demander qui l'affichait. La description d'un défaut se propage seule ; sa
/// vérification, non.
///
/// > **Une chaîne localisée dans une fonction morte est invisible aux DEUX
/// > gardes existantes.** `LocalizationConsistencyTests` vérifie que toute clé
/// > du catalogue est citée en code (elle l'était) et que toute clé citée existe
/// > au catalogue. Aucune ne demande si le code qui la cite s'exécute. Le
/// > chaînon manquant est ici : la fonction est-elle appelée ?
///
/// ## Ce que la garde N'ATTRAPE PAS
///
/// L'atteignabilité par référence est une approximation, choisie parce qu'elle
/// est DÉCIDABLE hors compilateur. Une fonction citée une seule fois depuis une
/// autre fonction elle-même morte reste verte ici. La garde attrape la feuille
/// de l'arbre mort, pas l'arbre — c'est déjà ce qui manquait, et c'est vérifiable
/// sans toolchain Swift (aucune n'existe sous Linux, cf. leçons 238i / 242i).
///
/// Les conformances de protocole sont appelées PAR LE FRAMEWORK et par rien
/// d'autre : `makeUIViewController` / `updateUIViewController` rougiraient à
/// tort — elles rougissaient à la première mesure. Elles sortent par
/// `frameworkInvoked`, un ensemble de NOMS DE CONTRAT et non la liste des
/// exceptions : le jour où une septième extension conformera à
/// `UIViewControllerRepresentable`, elle sera couverte sans que personne y pense.
@MainActor
final class ConversationSurfaceReachabilityGuardTests: XCTestCase {

    /// La surface conversation : la vue et ses cinq fichiers d'extension.
    /// Le préfixe est le critère — un septième `ConversationView+…` naîtra
    /// couvert, sans que personne ait à penser à l'ajouter ici.
    private static let surfacePrefix = "ConversationView"
    private static let surfaceDirectory = "apps/ios/Meeshy/Features/Main/Views"

    /// Les exceptions, chacune avec la raison qui la rend légitime.
    ///
    /// `buildNativeMessageMenu(for:)` : `private`, jamais appelée, et pourtant
    /// tenue VERTE par `ConversationMenuSystemDesignGuardTests`, qui l'inspecte
    /// à la source — le motif « code mort testé vert » que ce dépôt connaît.
    /// Son doc-comment dit « le menu natif n'existe que sur iOS 26 » : c'est
    /// peut-être un chemin monté plus tard, pas un vestige. Trancher demande
    /// l'arbitrage produit du menu contextuel natif, pas une passe de nettoyage
    /// — inscrite ici NOMMÉMENT pour qu'elle reste une dette VUE.
    private static let unreachableAllowlist: Set<String> = [
        "buildNativeMessageMenu",
    ]

    /// Les exigences de protocole que le FRAMEWORK appelle. Elles ne sont
    /// jamais nommées par du code du dépôt, et leur absence de référence ne dit
    /// donc rien de leur atteignabilité. Ce sont des noms de CONTRAT : les
    /// exclure ici couvre d'avance toute conformance future, là où une liste
    /// d'exceptions attendrait qu'on y pense.
    private static let frameworkInvoked: Set<String> = [
        // UIViewControllerRepresentable / UIViewRepresentable
        "makeUIViewController", "updateUIViewController", "dismantleUIViewController",
        "makeUIView", "updateUIView", "dismantleUIView", "makeCoordinator",
        // UIViewController & app lifecycle
        "viewDidLoad", "viewWillAppear", "viewDidAppear",
        "viewWillDisappear", "viewDidDisappear",
    ]

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    /// Le balayage des RÉFÉRENCES couvre l'app, ses quatre extensions et le SDK :
    /// une extension peut très bien appeler un helper de la surface.
    private func allSourceFiles() -> [URL] {
        let root = repoRoot()
        let roots = [
            "apps/ios/Meeshy",
            "apps/ios/MeeshyShareExtension",
            "apps/ios/MeeshyNotificationExtension",
            "apps/ios/MeeshyWidgets",
            "apps/ios/MeeshyContextMenu",
            "packages/MeeshySDK/Sources",
        ].map { root.appendingPathComponent($0) }

        var found: [URL] = []
        for dir in roots {
            guard let walker = FileManager.default.enumerator(
                at: dir, includingPropertiesForKeys: nil
            ) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                found.append(url)
            }
        }
        return found
    }

    private func surfaceFiles() -> [URL] {
        let dir = repoRoot().appendingPathComponent(Self.surfaceDirectory)
        let contents = (try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: nil
        )) ?? []
        return contents
            .filter { $0.pathExtension == "swift" }
            .filter { $0.lastPathComponent.hasPrefix(Self.surfacePrefix) }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// Le dépouillement des commentaires est ce qui donne son sens au test : une
    /// pierre tombale qui NOMME la fonction retirée — c'est le style de ce
    /// dépôt — ne doit pas la ressusciter en la faisant compter pour une
    /// référence.
    private func code(of url: URL) -> String {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return "" }
        return AppSourceGuard.stripComments(raw)
    }

    /// Les noms de fonction déclarés par un fichier. `func` suivi d'un
    /// identifiant : les initialiseurs et les `subscript` n'en sont pas, et
    /// c'est voulu — leur atteignabilité ne se lit pas au nom.
    private func declaredFunctionNames(in code: String) -> Set<String> {
        Self.matches(of: #"\bfunc\s+([A-Za-z_]\w*)"#, in: code)
    }

    private static func matches(of pattern: String, in text: String) -> Set<String> {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        var out = Set<String>()
        for match in regex.matches(in: text, range: range) {
            guard match.numberOfRanges > 1,
                  let r = Range(match.range(at: 1), in: text) else { continue }
            out.insert(String(text[r]))
        }
        return out
    }

    /// Combien de fois `name` apparaît en code, DÉCLARATIONS DÉDUITES. Zéro
    /// signifie : rien, nulle part, ne nomme cette fonction hors de sa propre
    /// signature.
    private func referenceCount(of name: String, in corpus: String) -> Int {
        let uses = Self.occurrences(of: #"\b\#(name)\b"#, in: corpus)
        let declarations = Self.occurrences(of: #"\bfunc\s+\#(name)\b"#, in: corpus)
        return uses - declarations
    }

    private static func occurrences(of pattern: String, in text: String) -> Int {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return 0 }
        return regex.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text))
    }

    // MARK: - Le versant atteignabilité

    func test_touteFonctionDeLaSurfaceConversationEstAtteignable() {
        let corpus = allSourceFiles().map { code(of: $0) }.joined(separator: "\n")
        XCTAssertFalse(corpus.isEmpty, "Le balayage ne lit aucune source — la garde n'inspecterait rien.")

        var unreachable: [String] = []
        for file in surfaceFiles() {
            for name in declaredFunctionNames(in: code(of: file)).sorted() {
                guard !Self.unreachableAllowlist.contains(name),
                      !Self.frameworkInvoked.contains(name) else { continue }
                if referenceCount(of: name, in: corpus) == 0 {
                    unreachable.append("\(file.lastPathComponent) → \(name)")
                }
            }
        }

        XCTAssertTrue(
            unreachable.isEmpty,
            """
            Fonction déclarée dans la surface conversation et référencée NULLE PART. \
            Une vue qu'on ne monte pas ne rend aucun pixel — mais ses chaînes \
            localisées, ses libellés VoiceOver et ses cibles tactiles ont l'air \
            présents à la relecture, et ses clés de catalogue partent en traduction. \
            La retirer, ou la monter :
            \(unreachable.joined(separator: "\n"))
            """
        )
    }

    // MARK: - La garde se garde elle-même

    /// Sans ce versant, le test ci-dessus passerait au vert pour la mauvaise
    /// raison le jour où le balayage, le dépouillement ou la regex casserait :
    /// il n'inspecterait plus rien.
    func test_leBalayageVoitLaSurfaceEtSesFonctions() {
        let files = surfaceFiles()
        XCTAssertGreaterThanOrEqual(
            files.count, 5,
            "La surface conversation compte au moins la vue et ses cinq extensions"
        )

        let declared = files.reduce(into: Set<String>()) {
            $0.formUnion(declaredFunctionNames(in: code(of: $1)))
        }
        XCTAssertGreaterThan(declared.count, 50, "Le dépouillement mange les déclarations")
        XCTAssertTrue(
            declared.contains("triggerReply"),
            "`triggerReply(for:)` est un helper vivant de la surface — s'il n'est plus vu, la détection est cassée"
        )
    }

    /// Le cœur du test est une SOUSTRACTION (usages − déclarations). Si elle
    /// dérivait, une fonction morte compterait sa propre signature comme un
    /// appel et la garde ne détecterait plus rien.
    func test_laSoustractionSépareUnAppelDUneDéclaration() {
        let deadOnly = "func widgetOrphanHelper() -> Int { 0 }"
        XCTAssertEqual(
            referenceCount(of: "widgetOrphanHelper", in: deadOnly), 0,
            "Une déclaration seule doit compter ZÉRO référence"
        )

        let declaredAndCalled = deadOnly + "\nlet x = widgetOrphanHelper()"
        XCTAssertEqual(
            referenceCount(of: "widgetOrphanHelper", in: declaredAndCalled), 1,
            "Un appel doit compter pour une référence"
        )
    }

    /// La pierre tombale de 243i nomme les deux fonctions retirées. Si le
    /// dépouillement des commentaires devenait timide, ces noms compteraient
    /// pour des références et la garde deviendrait aveugle à son propre défaut.
    func test_unePierreTombaleNeRessuscitePasSaFonction() {
        let stripped = AppSourceGuard.stripComments(
            "// `replyCountPill(count:)` a vécu ici jusqu'en 243i\nlet keep = 1\n"
        )
        XCTAssertFalse(
            stripped.contains("replyCountPill"),
            "Le dépouillement laisse passer les commentaires — une fonction retirée resterait « référencée » par son épitaphe"
        )
        XCTAssertTrue(stripped.contains("keep"), "Le dépouillement avale le code")
    }

    /// Le défaut de 243i, figé : ces deux fonctions ne doivent pas revenir sans
    /// site d'appel. Le test ci-dessus les attraperait — celui-ci le dit par
    /// leur nom, pour que la recherche `git log -S` les retrouve.
    func test_lesDeuxFonctionsRetiréesEn243iNeSontPasRevenues() {
        let corpus = surfaceFiles().map { code(of: $0) }.joined(separator: "\n")
        for name in ["replyCountPill", "scrollToAndHighlight"] {
            XCTAssertFalse(
                corpus.contains(name),
                "\(name) est revenue dans la surface conversation. Elle n'a jamais eu de site d'appel : la monter, ou ne pas la réécrire."
            )
        }
    }
}
