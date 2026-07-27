import XCTest
@testable import Meeshy
import MeeshySDK

/// Les commentaires de story se chargent par QUATRE chemins — première charge
/// réseau, réponses, arrivée temps réel, pagination. Tous doivent résoudre la
/// langue par le même résolveur : `PostDetailViewModel.resolveCommentTranslation`.
///
/// Le chemin principal (`fetchStoryCommentsFromNetwork`) le réimplémentait en
/// une fermeture locale, à laquelle manquaient deux règles :
///
///   1. si une langue préférée EST déjà celle de l'original, afficher
///      l'ORIGINAL — la règle explicite du Prisme, « ne jamais tomber sur une
///      traduction de priorité inférieure » ;
///   2. la comparaison des codes langue insensible à la casse.
///
/// Effet concret pour un lecteur dont le Prisme est `["en", "fr"]` : un
/// commentaire écrit EN ANGLAIS dont le serveur avait aussi produit une
/// traduction française — pour d'autres lecteurs — lui était affiché en
/// FRANÇAIS. Sa langue principale correspondait pourtant déjà à l'original.
final class StoryCommentPrismeSingleResolverTests: XCTestCase {

    /// Le comportement du résolveur canonique sur le cas précis que la
    /// réimplémentation ratait.
    func test_canonicalResolver_returnsOriginal_whenPreferredLanguageIsTheOriginal() throws {
        let resolved = PostDetailViewModel.resolveCommentTranslation(
            translations: ["fr": try Self.entry("Bonjour")],
            originalLanguage: "en",
            preferredLanguages: ["en", "fr"]
        )

        XCTAssertNil(resolved,
                     "La langue n°1 du lecteur est déjà celle de l'original : " +
                     "il doit voir l'original, pas la traduction française.")
    }

    /// …et il traduit bien quand la langue préférée n'est PAS l'original.
    func test_canonicalResolver_translates_whenPreferredLanguageDiffersFromOriginal() throws {
        let resolved = PostDetailViewModel.resolveCommentTranslation(
            translations: ["fr": try Self.entry("Bonjour")],
            originalLanguage: "en",
            preferredLanguages: ["fr", "en"]
        )

        XCTAssertEqual(resolved, "Bonjour")
    }

    /// Garde de source : aucun des quatre chemins ne doit re-déclarer sa propre
    /// résolution. Ancrée sur le NOMBRE d'appels au résolveur canonique — une
    /// réimplémentation locale se traduirait par un appel manquant, quel que
    /// soit le nom qu'on lui donnerait.
    func test_everyStoryCommentPath_usesTheCanonicalResolver() throws {
        let source = try String(contentsOfFile: Self.readerContentPath, encoding: .utf8)
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        let calls = code.components(separatedBy: "PostDetailViewModel.resolveCommentTranslation").count - 1
        XCTAssertGreaterThanOrEqual(calls, 4,
                                    "Les quatre chemins de commentaires de story (charge réseau, " +
                                    "réponses, temps réel, pagination) doivent tous passer par le " +
                                    "résolveur canonique du Prisme.")

        // La forme exacte que prenait la réimplémentation : une itération sur
        // les langues qui lit le dictionnaire sans consulter `originalLanguage`.
        XCTAssertFalse(code.contains("if let entry = dict[lang]"),
                       "Une résolution de langue locale est revenue dans le lecteur.")
    }

    /// `APIPostTranslationEntry` n'a pas d'init memberwise public : on la
    /// construit comme le réseau le fait, par décodage.
    private static func entry(_ text: String) throws -> APIPostTranslationEntry {
        try JSONDecoder().decode(APIPostTranslationEntry.self,
                                 from: Data("{\"text\":\"\(text)\"}".utf8))
    }

    private static var readerContentPath: String {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
            .path
    }
}
