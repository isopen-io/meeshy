import XCTest
@testable import Meeshy

/// **T3.2 — la CITATION reste sur la feuille, et c'est GARDÉ.**
///
/// Sans cette garde, la session suivante « finirait le travail » en recâblant
/// les deux sites de citation sur `DocumentComposerDoor` — une porte qui les
/// REFUSE (`ComposerDocumentSendPlan` rend `.refuse(.nonDurablePath(.quotedRepost))`)
/// — et le refus serait SILENCIEUX : le composer se refermerait exactement comme
/// quand tout va bien. La condition de levée est NOMMÉE : **7.5**, un écrivain
/// durable du repost (fondation livrée, ZÉRO appelant). Tant qu'elle n'a pas
/// d'appelant, la citation part par `POST /posts/:id/repost`, sans file durable.
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
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil, references: [], storyEffects: nil
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

    // 2 — la table route une citation de POST vers un composer HISTORIQUE.
    func test_laCitationDunPost_routeVersLeComposerHistorique() {
        XCTAssertNotNil(
            ComposerProfile.profile(for: .repost(ofPostId: "p", sourceFormat: .post)).routesToLegacy,
            "La table doit router une citation de POST vers un composer HISTORIQUE (`.repostComposer`) — la "
                + "passer à `nil` ferait servir par le meuble une citation qu'il refuse ensuite (condition 7.5)."
        )
    }

    // 3 — les DEUX sites de citation montent encore la feuille ; 7.5 les libère.
    func test_lesDeuxSitesDeCitation_montentEncoreLaFeuille_conditionDeLevee_7_5() throws {
        let rootView = compact(try source("Meeshy/Features/Main/Views/RootViewComponents.swift"))
        let feedView = compact(try source("Meeshy/Features/Main/Views/FeedView.swift"))

        XCTAssertEqual(
            rootView.components(separatedBy: "FeedComposerSheet(").count - 1, 1,
            "RootViewComponents doit garder EXACTEMENT un `FeedComposerSheet(` — la citation "
                + "(`.fullScreenCover(item: $quoteOriginalPost)`). Le plein composer du fil est passé au "
                + "meuble à T3.1 ; la recâbler sur le meuble la ferait refuser en silence. Levée : 7.5."
        )
        XCTAssertEqual(
            feedView.components(separatedBy: "FeedComposerSheet(").count - 1, 1,
            "FeedView doit garder EXACTEMENT un `FeedComposerSheet(` — la citation iPad. Même refus "
                + "silencieux si on la recâble sur le meuble. Levée : 7.5."
        )
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
