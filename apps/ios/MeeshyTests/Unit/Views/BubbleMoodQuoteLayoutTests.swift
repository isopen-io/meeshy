import XCTest

/// Garde de composition de la citation d'un mood.
///
/// La date doit vivre sur la LIGNE DE TITRE, pas dans la ligne de contenu :
/// dans l'aperçu elle consommait la largeur du contenu, qui se coupait.
///
/// Garde de SOURCE : la mise en page SwiftUI n'est pas décidable autrement sans
/// snapshot. Elle lit le code en ayant retiré les commentaires — sans quoi une
/// simple mention en commentaire la ferait passer à tort.
final class BubbleMoodQuoteLayoutTests: XCTestCase {

    private func sourceWithoutComments() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift")
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// Corps textuel d'une `struct`, de sa déclaration jusqu'à la `struct`
    /// suivante (ou la fin du fichier).
    private func body(of structName: String, in source: String) throws -> String {
        guard let start = source.range(of: "struct \(structName)") else {
            XCTFail("struct \(structName) introuvable")
            return ""
        }
        let rest = source[start.lowerBound...]
        let afterFirst = rest.index(rest.startIndex, offsetBy: 1)
        guard let next = rest.range(of: "\nstruct ", range: afterFirst..<rest.endIndex) else {
            return String(rest)
        }
        return String(rest[rest.startIndex..<next.lowerBound])
    }

    /// Partie RENDU d'une struct : de `var body: some View` à sa fin.
    ///
    /// Scoper ainsi est nécessaire, pas cosmétique : `storyPublishedAt` doit
    /// RESTER dans le `==` d'`Equatable` — la date pilote toujours le rendu de
    /// la ligne de titre, et l'oublier manquerait une invalidation. Seul son
    /// rendu doit disparaître d'ici.
    private func renderBody(of structName: String, in source: String) throws -> String {
        let whole = try body(of: structName, in: source)
        guard let start = whole.range(of: "var body: some View") else {
            XCTFail("var body introuvable dans \(structName)")
            return ""
        }
        return String(whole[start.lowerBound...])
    }

    func test_moodPreview_doesNotRenderTheDate() throws {
        let preview = try renderBody(of: "BubbleMoodReplyPreview", in: sourceWithoutComments())
        XCTAssertFalse(
            preview.contains("storyPublishedAt"),
            "La date ne doit plus être rendue par BubbleMoodReplyPreview — elle appartient à la ligne de titre"
        )
    }

    func test_moodPreview_allowsMoreThanTwoLinesOfContent() throws {
        let preview = try renderBody(of: "BubbleMoodReplyPreview", in: sourceWithoutComments())
        XCTAssertTrue(
            preview.contains("lineLimit(3)"),
            "Le contenu du mood récupère la largeur libérée par la date : 3 lignes"
        )
    }

    func test_quotedReply_rendersTheMoodDateOnTheTitleRow() throws {
        let quoted = try body(of: "BubbleQuotedReply", in: sourceWithoutComments())
        XCTAssertTrue(
            quoted.contains("moodDateLabel"),
            "La ligne de titre de BubbleQuotedReply doit porter la date du mood"
        )
    }
}
