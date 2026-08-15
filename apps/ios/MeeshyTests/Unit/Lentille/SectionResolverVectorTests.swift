import XCTest
@testable import Meeshy

/// Vecteurs inter-plateformes pour `LentilleSectionResolver` (contrat LWS-5)
/// — même JSON que les suites Jest
/// `packages/shared/__tests__/vectors/{sections,sort}.vectors.test.ts`.
///
/// Fixtures : `packages/shared/fixtures/reading-modes/{sections,sort}.vectors.json`,
/// câblées comme ressource de bundle de tests via `project.yml`
/// (`MeeshyTests.resources`, `../../packages/shared/fixtures`, `type: folder`
/// — même mécanique que `LentilleMetricsTests` pour `design/`). Le dossier
/// `fixtures` devient un sous-répertoire du bundle de tests, d'où le chemin
/// `fixtures/reading-modes/` passé à `Bundle(for:).url(subdirectory:)`
/// ci-dessous.
///
/// ── Sémantique de l'adaptateur (reproduite à l'identique de
/// `sections.vectors.test.ts` / `sort.vectors.test.ts`) ──
/// - `updatedAt` / `lastMessageAt` / `now` sont des chaînes ISO-8601 UTC
///   (`Z`), parsées en `Date`. `lastMessageAt` ABSENT ou explicitement `null`
///   dans le JSON convergent tous deux vers `nil` côté Swift — la loi lit
///   `lastMessageAt ?? updatedAt` dans les deux cas, donc la distinction
///   absent/`null` n'a aucun effet observable (documentée dans le vecteur
///   `fallback-updatedat` pour le cas `null` explicite).
/// - `categoryId` / `orderInCategory` absents ⇒ `nil`, jamais une valeur par
///   défaut inventée par l'adaptateur.
/// - `liveCall` : seule sa PRÉSENCE compte (`LentilleSectionResolver.SectionableLiveCall()`
///   marqueur vide) — la loi ne lit jamais `voices`/`startedAt`/`joined`.
/// - `locale` (fixtures `sections.vectors.json`) n'existe PAS côté Swift : la
///   loi TS le reçoit mais ne l'utilise jamais pour ses bornes calendaires
///   (voir le commentaire de la loi partagée) ; ce miroir Swift n'a donc
///   simplement pas ce paramètre.
///
/// Sortie loi → forme JSON `expected` : `{ kind, categoryId?, ids }` par
/// section (`sections.vectors.json`) ou tableau d'`id` réordonné
/// (`sort.vectors.json`) — jamais les conversations complètes. Décodage
/// TOLÉRANT aux clés inconnues : `_label` (et toute clé sœur future) n'est
/// jamais un champ des structs `VectorConversationJSON`/`*InputJSON`
/// ci-dessous, donc `JSONDecoder` synthétisé les ignore nativement — aucune
/// clé additionnelle du JSON ne fait échouer le décodage.
///
/// GARDE leçon 257 (jamais de vert silencieux) : `loadCases` échoue
/// explicitement (`XCTFail`) si le fichier de vecteurs est introuvable, non
/// décodable, ou contient ZÉRO cas.
///
/// **Nommage** — aucun jeton qui bascule cette suite en phase 2 du gate
/// (`meeshy.sh` `FINAL_PHASE_CLASS_PATTERN`, ligne ~1591) :
/// `SectionResolverVectorTests`, pas `ConversationSectionResolverVectorTests`
/// (le jeton `Conversation` change de phase).
final class SectionResolverVectorTests: XCTestCase {

    // MARK: - Formes JSON tolérantes (clés inconnues ignorées nativement par Decodable)

    private struct VectorLiveCallJSON: Decodable {
        let voices: Int?
        let startedAt: String?
        let joined: Bool?
    }

    private struct VectorConversationJSON: Decodable {
        let id: String
        let isPinned: Bool?
        let categoryId: String?
        let orderInCategory: Double?
        let lastMessageAt: String?
        let updatedAt: String
        let liveCall: VectorLiveCallJSON?
    }

    private struct VectorCategoryJSON: Decodable {
        let id: String
    }

    private struct SectionsInputJSON: Decodable {
        let conversations: [VectorConversationJSON]
        let categories: [VectorCategoryJSON]
        let now: String
        let timeZone: String
    }

    private struct SortInputJSON: Decodable {
        let conversations: [VectorConversationJSON]
    }

    private struct SerializedSectionJSON: Decodable, Equatable {
        let kind: String
        let categoryId: String?
        let ids: [String]
    }

    private struct SectionsVectorCase: Decodable {
        let input: SectionsInputJSON
        let expected: [SerializedSectionJSON]
        let _label: String?
    }

    private struct SortVectorCase: Decodable {
        let input: SortInputJSON
        let expected: [String]
        let _label: String?
    }

    private enum VectorError: Error, CustomStringConvertible {
        case invalidDate(String)
        case unknownTimeZone(String)

        var description: String {
            switch self {
            case .invalidDate(let raw): return "date ISO8601 invalide: \(raw)"
            case .unknownTimeZone(let raw): return "fuseau horaire inconnu: \(raw)"
            }
        }
    }

    // MARK: - Dates ISO8601 tolérantes (fractionnaire, repli plain — patron `MessageModels.swift`)

    private nonisolated(unsafe) static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private nonisolated(unsafe) static let isoPlain = ISO8601DateFormatter()

    private static func parseDate(_ raw: String) throws -> Date {
        guard let date = isoFractional.date(from: raw) ?? isoPlain.date(from: raw) else {
            throw VectorError.invalidDate(raw)
        }
        return date
    }

    // MARK: - Conversion JSON → miroir de loi

    private static func toSectionable(_ raw: VectorConversationJSON) throws -> LentilleSectionResolver.SectionableConversation {
        LentilleSectionResolver.SectionableConversation(
            id: raw.id,
            isPinned: raw.isPinned ?? false,
            categoryId: raw.categoryId,
            orderInCategory: raw.orderInCategory,
            lastMessageAt: try raw.lastMessageAt.map(parseDate),
            updatedAt: try parseDate(raw.updatedAt),
            liveCall: raw.liveCall != nil ? LentilleSectionResolver.SectionableLiveCall() : nil
        )
    }

    private static func serialize(_ section: LentilleSectionResolver.ConversationSection) -> SerializedSectionJSON {
        switch section {
        case .pinned(let conversations):
            return SerializedSectionJSON(kind: "pinned", categoryId: nil, ids: conversations.map(\.id))
        case .live(let conversations):
            return SerializedSectionJSON(kind: "live", categoryId: nil, ids: conversations.map(\.id))
        case .category(let categoryId, let conversations):
            return SerializedSectionJSON(kind: "category", categoryId: categoryId, ids: conversations.map(\.id))
        case .temporal(let kind, let conversations):
            return SerializedSectionJSON(kind: kind.rawValue, categoryId: nil, ids: conversations.map(\.id))
        }
    }

    // MARK: - Chargement des vecteurs (bundle de tests)

    /// Charge `<resourceBaseName>.json` sous `fixtures/reading-modes/` du
    /// bundle de tests. Fichier introuvable, JSON invalide, ou tableau vide
    /// (leçon 257) ⇒ `XCTFail` explicite + tableau vide retourné — la suite
    /// rougit, jamais un vert silencieux à zéro cas exécuté.
    private static func loadCases<T: Decodable>(resourceBaseName: String) -> [T] {
        guard let url = Bundle(for: SectionResolverVectorTests.self).url(
            forResource: resourceBaseName,
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                \(resourceBaseName).json introuvable dans le bundle de tests sous \
                fixtures/reading-modes/. Vérifier la ressource \
                `../../packages/shared/fixtures` (type: folder) dans project.yml, \
                puis `xcodegen generate`.
                """)
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            let cases = try JSONDecoder().decode([T].self, from: data)
            guard !cases.isEmpty else {
                XCTFail("""
                    \(resourceBaseName).json contient ZÉRO cas — une suite de vecteurs ne \
                    doit jamais charger zéro cas (leçon 257, jamais de vert silencieux)
                    """)
                return []
            }
            return cases
        } catch {
            XCTFail("\(resourceBaseName).json présent mais illisible : \(error)")
            return []
        }
    }

    // MARK: - resolveSections

    func test_resolveSections_matchesVectors() throws {
        let cases: [SectionsVectorCase] = Self.loadCases(resourceBaseName: "sections.vectors")

        for (index, testCase) in cases.enumerated() {
            let name = testCase._label.map { "case \(index) — \($0)" } ?? "case \(index)"

            let conversations = try testCase.input.conversations.map(Self.toSectionable)
            let categories = testCase.input.categories.map { LentilleSectionResolver.SectionableCategory(id: $0.id) }
            let now = try Self.parseDate(testCase.input.now)

            guard let timeZone = TimeZone(identifier: testCase.input.timeZone) else {
                XCTFail("\(name) : \(VectorError.unknownTimeZone(testCase.input.timeZone))")
                continue
            }

            let actual = LentilleSectionResolver.resolveSections(
                conversations: conversations,
                categories: categories,
                now: now,
                timeZone: timeZone
            ).map(Self.serialize)

            XCTAssertEqual(actual, testCase.expected, name)
        }
    }

    // MARK: - sortConversations

    func test_sortConversations_matchesVectors() throws {
        let cases: [SortVectorCase] = Self.loadCases(resourceBaseName: "sort.vectors")

        for (index, testCase) in cases.enumerated() {
            let name = testCase._label.map { "case \(index) — \($0)" } ?? "case \(index)"

            let conversations = try testCase.input.conversations.map(Self.toSectionable)
            let actual = LentilleSectionResolver.sortConversations(conversations).map(\.id)

            XCTAssertEqual(actual, testCase.expected, name)
        }
    }
}
