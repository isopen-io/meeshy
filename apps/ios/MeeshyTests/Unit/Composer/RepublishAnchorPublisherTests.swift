import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'ANCRAGE d'une republication a son propre publieur, et ce n'est pas la
/// file durable** (#5055).
///
/// ## Le défaut que ce fichier ferme, et son origine
///
/// #5053 a fait passer la republication d'une story au meuble. L'éventail y
/// offre `[.story, .post]` — l'ANCRAGE, « garder la chose pour de bon » —, une
/// option déclarée par la table depuis le lot 4.7 et qui n'atteignait jusque-là
/// aucun écran. En la rendant atteignable, #5053 a branché sa flèche sur
/// `ComposerDocumentDurablePublisher`, par symétrie avec la porte du tray.
///
/// Or ce publieur **ne peut pas** servir une citation, et il le sait :
/// `ComposerDocumentSendRouting.path(isQuote: true, …)` rend un chemin NON
/// durable, que `ComposerDocumentSendPlan` refuse plutôt que de le laisser
/// partir par une voie que rien ne rejoue. La flèche affichait donc « Échec de
/// la publication » et ne publiait rien.
///
/// > **Rendre une option ATTEIGNABLE, c'est hériter de tout son aval.** Le lot
/// > qui ouvre une branche doit suivre la valeur jusqu'à son publieur, pas
/// > jusqu'à sa surface. Ici l'option était correcte, la surface aussi, et le
/// > seul maillon absent était le dernier.
///
/// La bonne nouvelle est que le refus était VISIBLE : un toast d'erreur, pas
/// une perte silencieuse. C'est la garde du lot 4.5 qui l'a rendu ainsi, et
/// c'est ce qui sépare un contrôle mort d'une fuite de données.
@MainActor
final class RepublishAnchorPublisherTests: XCTestCase {

    private func brouillonAncrage(repostOfId: String?) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post,
            forcePlainPost: true,
            text: "Ce que j'en pense",
            visibility: .public,
            visibilityUserIds: [],
            repostOfId: repostOfId,
            localMedia: [],
            location: nil,
            discoverabilityPrecision: nil,
            originalLanguage: "fr",
            mobileTranscription: nil,
            references: [],
            storyEffects: nil,
            mediaCaptions: [:], mediaAlts: [:], mediaObjectIds: [:]
        )
    }

    // MARK: - 1 · Le FAIT : la file durable refuse une citation

    /// Le témoin porte sur la RÈGLE, pas sur le câblage. Tant qu'il tient, le
    /// jour où quelqu'un rebranchera l'ancrage sur la file durable, la surface
    /// aura l'air de marcher et ne publiera rien — c'est ce fait-là qu'il faut
    /// pouvoir opposer.
    func test_lAncrage_neParPasParLaFileDurable_quelQueSoitLeReseau() {
        for horsLigne in [false, true] {
            let plan = ComposerDocumentSendPlan.plan(
                for: brouillonAncrage(repostOfId: "post-source"),
                isOffline: horsLigne
            )
            guard case .refuse(let motif) = plan else {
                return XCTFail("La file durable a accepté une citation (hors-ligne: \(horsLigne)) — "
                                   + "elle partirait par un chemin que rien ne rejoue.")
            }
            XCTAssertEqual(motif, .nonDurablePath(.quotedRepost),
                           "Et le refus doit NOMMER sa cause : un refus générique laisserait croire "
                               + "à un brouillon mal formé plutôt qu'à un publieur mal choisi.")
        }
    }

    /// **Non-vacuité — le MÊME brouillon sans citation part.** Sans ce témoin,
    /// le précédent resterait vert si le plan refusait tout : on prouverait
    /// « la file refuse » au lieu de « la file refuse les CITATIONS ».
    func test_leMemeBrouillonSansCitation_partParLaFileDurable() {
        let plan = ComposerDocumentSendPlan.plan(
            for: brouillonAncrage(repostOfId: nil),
            isOffline: false
        )
        guard case .send = plan else {
            return XCTFail("Un post ordinaire doit partir par la file durable — sinon le témoin "
                               + "au-dessus ne mesure pas ce qu'il prétend.")
        }
    }

    // MARK: - 2 · Le câblage : la porte a choisi le bon publieur

    func test_laPorteDeRepublication_ancreParLePublieurDeRepost() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/StoryRepublishComposer.swift"))
        XCTAssertTrue(
            code.contains("RepostPublisher"),
            "L'ancrage d'une republication passe par `RepostPublisher` — `POST /posts/:id/repost`, "
                + "le seul chemin qui préserve le lien vers l'original."
        )
        XCTAssertFalse(
            code.contains("ComposerDocumentDurablePublisher"),
            "Et jamais par la file durable, qui REFUSE une citation : la flèche afficherait "
                + "« Échec de la publication » sans rien publier."
        )
    }

    /// **La porte du TRAY, elle, garde la file durable — et c'est juste.**
    /// `.storyTray` n'a aucune source (`repostedPostId` vaut `nil`), donc son
    /// brouillon n'est jamais une citation. Ce témoin empêche une
    /// « harmonisation » qui ferait passer une création ordinaire par
    /// l'endpoint de repost.
    func test_laPorteDuTray_gardeLaFileDurable_carElleNeCiteJamais() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryTrayActions.swift"))
        XCTAssertTrue(
            code.contains("ComposerDocumentDurablePublisher"),
            "La création depuis le tray part d'une ardoise : sa file durable est le bon chemin, "
                + "et hors-ligne elle est le SEUL qui ne perde rien."
        )
    }
}
