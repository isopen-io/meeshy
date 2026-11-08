import XCTest
@testable import Meeshy

/// **La CITATION ne passe jamais par la file du DOCUMENT, et c'est GARDÉ.**
///
/// La file du document REFUSE une citation (`ComposerDocumentSendPlan` rend
/// `.refuse(.nonDurablePath(.quotedRepost))`) : elle publierait un post sans
/// sa source. La citation s'ouvre donc dans le compositeur par sa propre porte,
/// `QuoteComposerDoor`, qui publie par l'écrivain durable du repost
/// (`ComposerQuotePublisher` → `RepostPublisher`) — jamais par
/// `DocumentComposerDoor`, où l'envoi échouerait à chaque fois (#15628).
final class ComposerDocumentQuoteRefusalTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func citation() -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "je cite", visibility: .public,
            visibilityUserIds: [], repostOfId: "post-source", localMedia: [], location: nil,
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil, references: [], storyEffects: nil, mediaCaptions: [:], mediaAlts: [:], mediaObjectIds: [:],
            allowSoundExtraction: nil
        )
    }

    // 1 — le refus est NOMMÉ, pas déduit.
    func test_lePlanRefuseUneCitation_parUnCheminNonDurableNomme() {
        XCTAssertEqual(
            ComposerDocumentSendPlan.plan(for: citation(), isOffline: false),
            .refuse(.nonDurablePath(.quotedRepost)),
            "Une citation (`repostOfId != nil`) part par `POST /posts/:id/repost` — sans file durable. Le "
                + "meuble la REFUSE plutôt que de la faire partir par un chemin que rien ne rejoue : rendre "
                + "`.quotedRepost` durable sans écrivain (condition 7.5) la ferait partir en silence."
        )
    }

    // 2 — la table sert la citation d'un post par le meuble.
    func test_laCitationDunPost_estServieParLeMeuble() {
        XCTAssertNil(
            ComposerProfile.profile(for: .repost(ofPostId: "p", sourceFormat: .post)).routesToLegacy,
            "La citation d'un POST s'ouvre dans le compositeur unifié : la feuille historique a quitté le dépôt."
        )
    }

    // 3 — les DEUX sites de citation montent la porte de la citation, jamais celle du document.
    func test_lesDeuxSitesDeCitation_montentLaPorteDeLaCitation() throws {
        for chemin in ["Meeshy/Features/Main/Views/RootViewComponents.swift",
                       "Meeshy/Features/Main/Views/FeedView.swift"] {
            let code = compact(try source(chemin))
            XCTAssertEqual(code.components(separatedBy: "QuoteComposerDoor(").count - 1, 1,
                           "\(chemin) doit monter `QuoteComposerDoor(` pour sa citation.")
            XCTAssertFalse(code.contains("DocumentComposerDoor(intent:ComposerIntent(origin:.repost"),
                           "\(chemin) : une citation sur la porte du document serait refusée à chaque envoi.")
        }
        let porte = compact(try source("Meeshy/Features/Composer/QuoteComposerDoor.swift"))
        XCTAssertTrue(porte.contains("ComposerQuotePublisher()"), "La citation publie par l'écrivain du repost.")
        XCTAssertFalse(porte.contains("ComposerDocumentDurablePublisher"),
                       "La file du document refuse une citation : la porte ne doit pas y publier.")
    }

    // 4 — garde-fou : les sources lues sont les bonnes et non vides (mode
    // d'extinction propre aux gardes négatives : un chemin faux ⇒ vert sur vide).
    func test_lesSourcesLues_sontLesBonnes_etNonVides() throws {
        let rootView = compact(try source("Meeshy/Features/Main/Views/RootViewComponents.swift"))
        let feedView = compact(try source("Meeshy/Features/Main/Views/FeedView.swift"))
        XCTAssertTrue(rootView.contains("structThemedFeedOverlay"), "RootViewComponents introuvable ou vide")
        XCTAssertTrue(feedView.contains("structFeedView"), "FeedView introuvable ou vide")
    }
}
