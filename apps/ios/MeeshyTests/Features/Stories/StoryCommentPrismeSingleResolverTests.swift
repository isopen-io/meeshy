import XCTest
@testable import Meeshy
import MeeshySDK

/// Les commentaires de story se chargent par QUATRE chemins — première charge
/// réseau, réponses, arrivée temps réel, pagination. Tous doivent résoudre la
/// langue par le même résolveur : `PostDetailViewModel.resolveCommentTranslation`.
///
/// Le chemin principal (`fetchStoryCommentsFromNetwork`, celui de chaque
/// ouverture sur cache froid) le réimplémentait en une fermeture locale qui
/// parcourait le Prisme en lisant le dictionnaire SANS consulter
/// `originalLanguage`. Il lui manquait la règle critique n° 3 du Prisme : la
/// langue d'origine concourt à son RANG. Un commentaire déjà écrit dans la
/// langue n° 1 du lecteur s'affichait donc traduit dans sa langue n° 2, dès
/// que le serveur avait produit cette traduction pour d'autres lecteurs.
///
/// Le chemin passe désormais par `StoryViewerView.storyComment(from:preferredLanguages:)`,
/// qui appelle le résolveur canonique ; les témoins de RANG lisent ce
/// chemin-ci, pas seulement le résolveur.
final class StoryCommentPrismeSingleResolverTests: XCTestCase {

    // MARK: - Fixtures

    private func makeComment(
        originalLanguage: String,
        translations: [String: String]
    ) -> APIPostComment {
        let entries = translations
            .map { "\"\($0.key)\": {\"text\": \"\($0.value)\"}" }
            .joined(separator: ",")
        return JSONStub.decode("""
        {
            "id": "c-1",
            "content": "original",
            "originalLanguage": "\(originalLanguage)",
            "translations": {\(entries)},
            "createdAt": "2026-01-01T00:00:00.000Z",
            "author": {"id": "a1", "username": "alice"}
        }
        """)
    }

    // MARK: - Témoins de RANG sur le chemin de la première charge réseau

    /// Le cas précis que la fermeture locale ratait : l'original EST la langue
    /// n° 1 du lecteur, et une traduction vers sa langue n° 2 existe. La
    /// fermeture ne trouvait pas d'entrée « fr », passait au rang suivant et
    /// servait « Hello ». Le Prisme sert l'original.
    @MainActor
    func test_storyComment_originalInTheReadersFirstLanguage_keepsTheOriginal() {
        let comment = makeComment(originalLanguage: "fr", translations: ["en": "Hello"])

        let row = StoryViewerView.storyComment(from: comment, preferredLanguages: ["fr", "en"])

        XCTAssertNil(row.translatedContent,
                     "La langue n° 1 du lecteur est déjà celle de l'original : " +
                     "il doit lire l'original, pas la traduction anglaise de rang 2.")
        XCTAssertEqual(row.displayContent, "original")
    }

    /// Témoin de rang AUTRE que le premier (leçon 261) : au rang 1, le
    /// court-circuit interdit « l'origine appartient au prisme ⇒ original » et
    /// la règle juste rendent le même verdict. Ici l'original occupe le rang 2
    /// et une traduction vers le rang 1 existe : le Prisme sert « Bonjour »,
    /// jamais « Hello ».
    @MainActor
    func test_storyComment_translationAtTheFirstRank_winsOverAnOriginalAtTheSecondRank() {
        let comment = makeComment(originalLanguage: "en", translations: ["fr": "Bonjour"])

        let row = StoryViewerView.storyComment(from: comment, preferredLanguages: ["fr", "en"])

        XCTAssertEqual(row.translatedContent, "Bonjour",
                       "La langue d'origine concourt à son RANG : au rang 2, elle " +
                       "ne court-circuite pas la traduction disponible au rang 1.")
    }

    /// La fermeture locale comparait les codes langue à la lettre près ; le
    /// résolveur canonique, non.
    @MainActor
    func test_storyComment_matchesLanguageCodesCaseInsensitively() {
        let comment = makeComment(originalLanguage: "en", translations: ["fr": "Bonjour"])

        let row = StoryViewerView.storyComment(from: comment, preferredLanguages: ["FR"])

        XCTAssertEqual(row.translatedContent, "Bonjour")
    }

    // MARK: - Garde de source : un seul résolveur pour les quatre chemins

    /// La forme exacte que prenait la réimplémentation — une itération sur le
    /// Prisme qui lit le dictionnaire par la langue — et ses variantes de
    /// nommage. Ancrée sur le BLOC, jamais sur le fichier : un `[lang]`
    /// légitime ailleurs dans le lecteur ne serait pas condamné.
    private static let adHocLookups = ["[lang]", "[language]", "for lang in", "for language in"]

    private func readerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // …/Features/Stories
            .deletingLastPathComponent()   // …/Features
            .deletingLastPathComponent()   // …/MeeshyTests
            .deletingLastPathComponent()   // …/apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le corps du BLOC qui commence à `anchor`, accolades appariées. `nil`
    /// quand l'ancre a disparu — l'appelant fait alors rougir, jamais passer.
    /// Jumeau assumé de `ComposerSourceGuard.functionBody(named:in:)` (bundle
    /// de tests du SDK, hors de portée d'ici).
    private func blockBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    private struct AncreIntrouvable: Error, CustomStringConvertible {
        let anchor: String
        var description: String { "Le bloc `\(anchor)` est introuvable — la garde ne mesurerait RIEN" }
    }

    private func block(_ anchor: String) throws -> String {
        guard let bloc = blockBody(startingAt: anchor, in: try readerSource()) else {
            throw AncreIntrouvable(anchor: anchor)
        }
        return bloc
    }

    private static let mapperAnchor = "static func storyComment(from"
    private static let networkPathAnchor = "private func fetchStoryCommentsFromNetwork("
    private static let canonicalCall = "PostDetailViewModel.resolveCommentTranslation("

    /// Le versant INTERDICTION : la ligne de la première charge réseau ne
    /// résout plus sa langue elle-même. Rougit si la fermeture revient dans le
    /// mappeur OU si le chemin réseau cesse de passer par lui.
    func test_networkCommentPath_resolvesTheLanguageOnlyThroughTheCanonicalResolver() throws {
        let mapper = try block(Self.mapperAnchor)
        let networkPath = try block(Self.networkPathAnchor)

        XCTAssertTrue(mapper.contains(Self.canonicalCall),
                      "Le mappeur de la première charge réseau doit appeler le résolveur canonique du Prisme.")
        XCTAssertTrue(networkPath.contains("storyComment(from:"),
                      "`fetchStoryCommentsFromNetwork` doit bâtir ses lignes par `storyComment(from:preferredLanguages:)`.")
        for lookup in Self.adHocLookups {
            XCTAssertFalse(mapper.contains(lookup),
                           "Une résolution de langue locale (`\(lookup)`) est revenue dans le mappeur.")
            XCTAssertFalse(networkPath.contains(lookup),
                           "Une résolution de langue locale (`\(lookup)`) est revenue dans la première charge réseau.")
        }
    }

    /// Le versant CONSOLIDATION : les quatre chemins nomment le résolveur. Une
    /// réimplémentation locale se signale par un appel manquant, quel que soit
    /// le nom qu'on lui donne.
    func test_everyStoryCommentPath_namesTheCanonicalResolver() throws {
        let calls = try readerSource().components(separatedBy: Self.canonicalCall).count - 1

        XCTAssertGreaterThanOrEqual(calls, 4,
                                    "Les quatre chemins de commentaires de story (première charge réseau, " +
                                    "réponses, temps réel, pagination) doivent tous passer par le " +
                                    "résolveur canonique du Prisme.")
    }

    /// La garde se garde elle-même : une ancre renommée rendrait les gardes de
    /// bloc vertes sur une chaîne vide.
    func test_theGuardReadsTheBlocksItClaimsToRead() throws {
        let mapper = try block(Self.mapperAnchor)
        let networkPath = try block(Self.networkPathAnchor)

        XCTAssertTrue(mapper.contains("FeedComment("), "Le bloc lu n'est pas le mappeur de commentaire.")
        XCTAssertTrue(networkPath.contains("getComments("), "Le bloc lu n'est pas la première charge réseau.")
        XCTAssertFalse(networkPath.contains(Self.mapperAnchor),
                       "L'appariement d'accolades a débordé sur le bloc voisin.")
    }
}
