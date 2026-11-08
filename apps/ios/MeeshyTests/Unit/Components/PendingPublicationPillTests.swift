import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// **Une publication en attente d'envoi s'annule depuis la pastille** (#10331).
///
/// La pastille ne savait que relancer une ligne terminale : une publication en
/// file, qu'elle soit en attente ou en échec, n'offrait aucun « Annuler
/// l'envoi ». Le geste emprunte la MÊME action que le détail d'un post
/// (`PendingPublicationCancel.run`), et la carte optimiste du fil s'en va avec.
@MainActor
final class PendingPublicationPillTests: XCTestCase {

    private func publication(_ status: OutboxStatus, cmid: String) -> OutboxUIItem {
        OutboxUIItem(id: "ofqm_\(cmid)", kind: .other("createPost"), titlePreview: "Bonjour", iconKind: .text,
                     attachmentCount: 0, source: .post(id: cmid), status: status, createdAt: Date())
    }

    // MARK: - Quelles entrées s'annulent

    func test_cancellableId_ofAQueuedPublication_isItsCmid() {
        let cmid = ClientMutationId.generate()
        XCTAssertEqual(PendingPublicationPill.cancellableId(for: publication(.pending, cmid: cmid)), cmid)
        XCTAssertEqual(PendingPublicationPill.cancellableId(for: publication(.inflight, cmid: cmid)), cmid)
        XCTAssertEqual(PendingPublicationPill.cancellableId(for: publication(.exhausted, cmid: cmid)), cmid)
    }

    /// Un repost vise un post SERVEUR : il n'y a pas d'envoi de publication à annuler.
    func test_cancellableId_ofAnEntryPointingAtAServerPost_isNil() {
        let repost = OutboxUIItem(id: "ofqm_x", kind: .other("repostPost"), titlePreview: nil, iconKind: .text,
                                  attachmentCount: 0, source: .post(id: "665f1c2e9b1d4a0012345678"),
                                  status: .pending, createdAt: Date())
        XCTAssertNil(PendingPublicationPill.cancellableId(for: repost))
    }

    func test_cancellableId_ofAMessage_isNil() {
        let message = OutboxUIItem(id: "ofqm_m", kind: .message, titlePreview: "Salut", iconKind: .text,
                                   attachmentCount: 0,
                                   source: .conversation(id: "c1", messageId: ClientMutationId.generate()),
                                   status: .pending, createdAt: Date())
        XCTAssertNil(PendingPublicationPill.cancellableId(for: message))
    }

    // MARK: - Ce qu'un doigt déclenche

    private func entree(retry: String?, publication: String?) -> SyncPillEntry {
        SyncPillEntry(id: "e", label: "Publication de post", iconName: nil, dotStyle: .brand,
                      source: publication.map { .post(id: $0) }, retryOutboxId: retry,
                      pendingPublicationId: publication)
    }

    /// « Annuler l'envoi » vit À CÔTÉ de « Réessayer » : le doigt ouvre le choix,
    /// il ne relance plus d'office une publication qu'on voulait peut-être retirer.
    func test_tapOutcome_onAPendingPublication_offersCancelBesideRetry() {
        let cmid = ClientMutationId.generate()
        XCTAssertEqual(entree(retry: "ofqm_\(cmid)", publication: cmid).tapOutcome,
                       .publicationChoices(cmid: cmid, retryOutboxId: "ofqm_\(cmid)"))
        XCTAssertEqual(entree(retry: nil, publication: cmid).tapOutcome,
                       .publicationChoices(cmid: cmid, retryOutboxId: nil))
    }

    /// Une publication en attente ne NAVIGUE pas : son détail n'existe pas côté serveur.
    func test_tapOutcome_onAPendingPublication_neverNavigatesToItsCmid() {
        let cmid = ClientMutationId.generate()
        XCTAssertNotEqual(entree(retry: nil, publication: cmid).tapOutcome, .navigate(.post(id: cmid)))
    }

    // MARK: - L'action d'annulation, la même que le détail

    func test_run_cancelsTheRowAndSaysSo() async {
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .removed
        let toasts = MockFeedbackToast()
        let cmid = ClientMutationId.generate()

        let stopped = await PendingPublicationCancel.run(cmid, queue: queue, toasts: toasts)

        XCTAssertTrue(stopped)
        XCTAssertEqual(queue.cancelPendingPublicationCalls, [cmid])
        XCTAssertEqual(toasts.successMessages, [UnsentPublicationsCopy.deleted])
    }

    func test_run_whenThePublicationAlreadyLeft_saysSoAndWithdrawsNothing() async {
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .notFound
        let toasts = MockFeedbackToast()
        var withdrawn: [String] = []
        let sink = PendingPublicationCancel.withdrawn.sink { withdrawn.append($0) }
        defer { sink.cancel() }

        let stopped = await PendingPublicationCancel.run(ClientMutationId.generate(), queue: queue, toasts: toasts)

        XCTAssertFalse(stopped)
        XCTAssertTrue(withdrawn.isEmpty, "la publication partie reste dans le fil")
        XCTAssertEqual(toasts.errorMessages, [UnsentPublicationsCopy.alreadySent])
    }

    func test_run_announcesTheWithdrawnCmid() async {
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .cancelRequested
        var withdrawn: [String] = []
        let sink = PendingPublicationCancel.withdrawn.sink { withdrawn.append($0) }
        defer { sink.cancel() }
        let cmid = ClientMutationId.generate()

        _ = await PendingPublicationCancel.run(cmid, queue: queue, toasts: MockFeedbackToast())

        XCTAssertEqual(withdrawn, [cmid])
    }

    // MARK: - Câblage : la bannière marque et branche, une fois pour les deux racines

    private func banniere() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Components/ConnectionBanner.swift"))
    }

    func test_laBanniereMarqueLesPublicationsAnnulables() throws {
        XCTAssertTrue(try banniere().contains("pendingPublicationId: PendingPublicationPill.cancellableId(for: item)"))
    }

    func test_laBanniereBrancheLAnnulationSurLActionDuDetail() throws {
        XCTAssertTrue(try banniere().contains("onCancelPublication: { PendingPublicationCancel.start($0) }"))
    }

    func test_leDetailEmprunteLaMemeAction() throws {
        let detail = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/PostDetailViewModel+PostActions.swift"))
        XCTAssertTrue(detail.contains("PendingPublicationCancel.run("))
        XCTAssertFalse(detail.contains("cancelPendingPublication(clientMutationId:"),
                       "une seule action d'annulation : le détail ne réécrit pas l'appel à la file")
    }
}
