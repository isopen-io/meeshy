import XCTest
import SwiftUI
@testable import Meeshy

/// Garde de source + contrat d'environnement pour la classe de crash
/// « feuille qui lit un `@EnvironmentObject` absent ».
///
/// Symptôme d'origine (macOS 26.2, iPad-app-on-Mac, TestFlight 1.0.4/1773) :
/// SIGTRAP (`exceptionType 6 / signal 5 / code 1`) dans `libswiftCore` appelé par
/// `SwiftUICore` juste sous une frame Meeshy, pendant une passe de mise à jour du
/// graphe de vues — la signature exacte de
/// `EnvironmentObject.wrappedValue` qui ne trouve pas son objet.
///
/// Une feuille N'HÉRITE PAS des `@EnvironmentObject` de la vue qui la présente ;
/// elle hérite des `EnvironmentValues`. Sur iPhone/iPad la feuille restait dans
/// la hiérarchie du présentateur et l'objet était trouvé par chance ; sous macOS
/// l'hébergement diffère et la lecture trappait.
///
/// L'accès étant PARESSEUX — il vivait dans le `ForEach` des commentaires — le
/// crash ne survenait pas à l'ouverture d'une feuille vide mais au rendu de la
/// PREMIÈRE ligne, c'est-à-dire à l'insertion optimiste d'un commentaire envoyé.
///
/// Garde ancrée sur le comportement : ces vues, toujours présentées en feuille /
/// fullScreenCover, ne doivent déclarer AUCUN `@EnvironmentObject` — elles lisent
/// leur chrome social via `EnvironmentValues` (cf. `SocialChromeEnvironment.swift`),
/// dont l'absence dégrade au lieu de trapper.
@MainActor
final class SheetEnvironmentObjectGuardTests: XCTestCase {

    /// Objets de « chrome social ». Aucun hôte de feuille ne les réinjecte —
    /// leurs porteurs sont des racines (`RootView`, `iPadRootView`) ou des vues
    /// feuilles volontairement sans `@EnvironmentObject` (`FeedPostCard`,
    /// `ReelsPlayerView`, `ProfileUserPostsList`). Une feuille qui les déclare
    /// dépend donc d'un héritage qui n'a jamais été garanti.
    private static let socialChromeObjects = [
        "StatusViewModel", "StoryViewModel", "StoryViewerCoordinator"
    ]

    /// Vues toujours présentées en `.sheet` / `.fullScreenCover` par au moins un
    /// hôte qui ne réinjecte pas le chrome social.
    private static let sheetOnlyViews: [(file: String, types: [String])] = [
        ("Meeshy/Features/Main/Views/FeedCommentsSheet.swift",
         ["CommentsSheetView", "CommentRowView", "ThreadedCommentSection"]),
        ("Meeshy/Features/Main/Components/ConversationInfoSheet.swift",
         ["ConversationInfoSheet"]),
        ("Meeshy/Features/Main/Views/GlobalSearchView.swift",
         ["GlobalSearchView"])
    ]

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Gardes de source

    func test_sheetPresentedViews_neverDeclareSocialChromeAsEnvironmentObject() throws {
        for entry in Self.sheetOnlyViews {
            let stripped = AppSourceGuard.stripComments(try source(entry.file))

            for type in entry.types {
                let body = try XCTUnwrap(
                    Self.declarationBody(of: type, in: stripped),
                    "\(type) doit rester déclaré dans \(entry.file)."
                )
                for object in Self.socialChromeObjects {
                    XCTAssertFalse(
                        Self.declaresEnvironmentObject(object, in: body),
                        """
                        \(type) (\(entry.file)) déclare `@EnvironmentObject … : \(object)`. \
                        Cette vue est présentée en feuille par des hôtes qui ne le \
                        réinjectent pas : la lecture trappe (SIGTRAP) dès que la \
                        branche qui la lit est évaluée — sous macOS, à l'envoi d'un \
                        commentaire. Passer par les EnvironmentValues de \
                        SocialChromeEnvironment.swift, dont l'absence dégrade.
                        """
                    )
                }
            }
        }
    }

    func test_bothRoots_poseSocialChromeResolvers() throws {
        for root in ["Meeshy/Features/Main/Views/RootView.swift",
                     "Meeshy/Features/Main/Views/iPadRootView.swift"] {
            let stripped = AppSourceGuard.stripComments(try source(root))
            XCTAssertTrue(
                stripped.contains(".meeshySocialChrome("),
                """
                \(root) doit poser `.meeshySocialChrome(...)`. Sans lui les \
                feuilles perdent humeur / anneau de story / ouverture du \
                lecteur — la racine est le SEUL point de pose (les feuilles \
                héritent des EnvironmentValues).
                """
            )
        }
    }

    // MARK: - Contrat de dégradation

    func test_socialChromeResolvers_defaultToNil_soAbsenceDegradesInsteadOfTrapping() {
        let values = EnvironmentValues()
        XCTAssertNil(values.meeshyMoodEmojiResolver)
        XCTAssertNil(values.meeshyStoryRingResolver)
        XCTAssertNil(values.meeshyMoodTapResolver)
        XCTAssertNil(values.meeshyStoryViewerPresent)
    }

    // MARK: - Helpers

    /// Vrai si `body` déclare un `@EnvironmentObject` du type `object`. Ancré sur
    /// la DÉCLARATION (`: Type`) et non sur une simple mention du nom : passer le
    /// même type en paramètre ordinaire reste légitime.
    private static func declaresEnvironmentObject(_ object: String, in body: String) -> Bool {
        body
            .components(separatedBy: "@EnvironmentObject")
            .dropFirst()
            .contains { fragment in
                guard let line = fragment.components(separatedBy: "\n").first,
                      let colon = line.lastIndex(of: ":") else { return false }
                return line[line.index(after: colon)...]
                    .trimmingCharacters(in: .whitespaces) == object
            }
    }

    /// Corps textuel de la déclaration `type` (accolade ouvrante → fermante
    /// appariée), ou `nil` si le type est absent.
    private static func declarationBody(of type: String, in source: String) -> String? {
        guard let declaration = source.range(of: "struct \(type)"),
              let open = source[declaration.upperBound...].firstIndex(of: "{") else { return nil }

        var depth = 0
        var index = open
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { return String(source[open ... index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }
}
