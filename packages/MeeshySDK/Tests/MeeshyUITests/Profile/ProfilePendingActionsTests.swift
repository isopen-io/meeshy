import Combine
import Foundation
import Testing
import MeeshySDK
@testable import MeeshyUI

/// Hors ligne, la fiche d'un autre liste ce que la file garde pour lui et le laisse annuler (#19465, planche
/// `Etat-HorsLigne`) : seuls ses envois, au rang où ils partiront, et un retrait se voit tout de suite.
@Suite("Hors ligne, les actions en attente de la fiche d'un autre")
struct ProfilePendingActionsTests {

    private static let direct = "conv-leo"
    private static let start = Date(timeIntervalSince1970: 1_800_000_000)

    private static func item(_ id: String,
                             conversation: String = Self.direct,
                             kind: OutboxUIItem.Kind = .message,
                             preview: String? = "Tu es encore à Alfama ce soir ?",
                             icon: OutboxUIItem.IconKind = .text,
                             status: OutboxStatus = .pending,
                             at offset: TimeInterval) -> OutboxUIItem {
        OutboxUIItem(id: id, kind: kind, titlePreview: preview, iconKind: icon, attachmentCount: 0,
                     source: .conversation(id: conversation, messageId: "cid_\(id)"), status: status,
                     createdAt: Self.start.addingTimeInterval(offset))
    }

    private static func resolve(_ items: [OutboxUIItem], withdrawn: Set<String> = []) -> [ProfilePendingAction] {
        ProfilePendingActions.resolve(items, conversationIds: [Self.direct], withdrawn: withdrawn)
    }

    // MARK: La loi

    @Test("seuls les envois vers sa conversation directe se listent, jamais ceux d'une autre conversation")
    func resolve_keepsOnlyTheirConversation() {
        let actions = Self.resolve([
            Self.item("a", at: 0),
            Self.item("b", conversation: "conv-other", at: 1),
            Self.item("c", at: 2)
        ])
        #expect(actions.map(\.id) == ["a", "c"])
        #expect(actions.map(\.clientMessageId) == ["cid_a", "cid_c"])
    }

    @Test("le rang compte toute la file : un envoi vers un autre qui part avant le repousse")
    func resolve_rankCountsTheWholeQueue() {
        let actions = Self.resolve([
            Self.item("c", at: 20),
            Self.item("other", conversation: "conv-other", at: 10),
            Self.item("a", at: 0)
        ])
        #expect(actions.map(\.id) == ["a", "c"])
        #expect(actions.map(\.rank) == [1, 3])
    }

    @Test("une réaction ou une édition dans sa conversation n'est pas un envoi à lui")
    func resolve_ignoresNonMessageKinds() {
        let actions = Self.resolve([
            Self.item("r", kind: .reaction, at: 0),
            Self.item("e", kind: .edit, at: 1),
            Self.item("m", at: 2)
        ])
        #expect(actions.map(\.id) == ["m"])
    }

    @Test("sans conversation connue avec lui, rien ne se liste")
    func resolve_withoutConversation_isEmpty() {
        let actions = ProfilePendingActions.resolve([Self.item("a", at: 0)], conversationIds: [])
        #expect(actions.isEmpty)
    }

    @Test("un envoi qui a renoncé se dit, sans rang, et ne retarde pas ceux qui partiront")
    func resolve_failedHasNoRank() {
        let actions = Self.resolve([
            Self.item("f", status: .failed, at: 0),
            Self.item("p", at: 1)
        ])
        #expect(actions.map(\.isFailed) == [true, false])
        #expect(actions.map(\.rank) == [nil, 1])
    }

    @Test("un envoi déjà en vol ne s'annule plus")
    func resolve_inflightIsNotCancellable() {
        let actions = Self.resolve([Self.item("v", status: .inflight, at: 0), Self.item("p", at: 1)])
        #expect(actions.map(\.isCancellable) == [false, true])
    }

    @Test("un retrait montré sort de la liste et rend son rang au suivant")
    func resolve_withdrawnIsHiddenAndRanksMove() {
        let actions = Self.resolve([Self.item("a", at: 0), Self.item("b", at: 1)], withdrawn: ["a"])
        #expect(actions.map(\.id) == ["b"])
        #expect(actions.first?.rank == 1)
    }

    @Test("le texte écrit se cite ; une pièce jointe garde son libellé ; « (message) » ne se montre pas")
    func resolve_previewKinds() {
        let actions = Self.resolve([
            Self.item("t", at: 0),
            Self.item("v", preview: "🎙 Note vocale", icon: .audio, at: 1),
            Self.item("x", preview: "(message)", at: 2)
        ])
        #expect(actions.map(\.isWrittenText) == [true, false, true])
        #expect(actions.map(\.preview) == ["Tu es encore à Alfama ce soir ?", "🎙 Note vocale", nil])
    }

    // MARK: Les mots

    @Test("le détail cite le texte, garde le libellé d'une pièce, et dit le rang à défaut d'aperçu")
    func copy_detail() throws {
        let actions = Self.resolve([
            Self.item("t", at: 0),
            Self.item("v", preview: "🎙 Note vocale", icon: .audio, at: 1),
            Self.item("x", preview: nil, at: 2)
        ])
        let quoted = try #require(ProfilePendingCopy.detail(actions[0]))
        #expect(quoted.contains("Tu es encore à Alfama ce soir ?"))
        #expect(quoted != "Tu es encore à Alfama ce soir ?")
        #expect(ProfilePendingCopy.detail(actions[1]) == "🎙 Note vocale")
        #expect(ProfilePendingCopy.detail(actions[2]) == ProfilePendingCopy.rank(3))
    }

    @Test("un envoi qui a renoncé se dit tel, quel que soit son aperçu")
    func copy_failedSaysNotSent() throws {
        let action = try #require(Self.resolve([Self.item("f", status: .failed, at: 0)]).first)
        #expect(ProfilePendingCopy.detail(action) == ProfilePendingCopy.notSent)
    }

    // MARK: Le modèle

    @MainActor
    @Test("annuler retire la rangée tout de suite, avant que la file ne réponde")
    func model_cancelIsOptimistic() async {
        let queue = FakePendingQueue(withdrawResult: true)
        let model = ProfilePendingModel()
        model.scope(to: [Self.direct])
        model.receive([Self.item("a", at: 0), Self.item("b", at: 1)])
        let first = model.actions[0]
        await model.cancel(first, queue: queue)
        let remaining = model.actions.map(\.id)
        #expect(remaining == ["b"])
        #expect(queue.withdrawn == ["cid_a"])
    }

    @MainActor
    @Test("un retrait refusé rend la rangée")
    func model_cancelRefused_rollsBack() async {
        let queue = FakePendingQueue(withdrawResult: false)
        let model = ProfilePendingModel()
        model.scope(to: [Self.direct])
        model.receive([Self.item("a", at: 0)])
        let first = model.actions[0]
        await model.cancel(first, queue: queue)
        let remaining = model.actions.map(\.id)
        #expect(remaining == ["a"])
    }

    @MainActor
    @Test("un envoi en vol ne part pas en retrait")
    func model_inflight_isNotWithdrawn() async {
        let queue = FakePendingQueue(withdrawResult: true)
        let model = ProfilePendingModel()
        model.scope(to: [Self.direct])
        model.receive([Self.item("v", status: .inflight, at: 0)])
        let first = model.actions[0]
        await model.cancel(first, queue: queue)
        #expect(queue.withdrawn.isEmpty)
        #expect(model.actions.count == 1)
    }

    @MainActor
    @Test("réessayer ne relance que les envois qui ont renoncé")
    func model_retry_onlyFailed() async {
        let queue = FakePendingQueue(withdrawResult: true)
        let model = ProfilePendingModel()
        model.scope(to: [Self.direct])
        model.receive([Self.item("f", status: .exhausted, at: 0), Self.item("p", at: 1)])
        await model.retry(queue: queue)
        #expect(queue.retried == ["f"])
    }

    @MainActor
    @Test("la file qui confirme le retrait garde la rangée retirée")
    func model_confirmedWithdrawal_staysHidden() async {
        let queue = FakePendingQueue(withdrawResult: true)
        let model = ProfilePendingModel()
        model.scope(to: [Self.direct])
        model.receive([Self.item("a", at: 0), Self.item("b", at: 1)])
        let first = model.actions[0]
        await model.cancel(first, queue: queue)
        model.receive([Self.item("b", at: 1)])
        let remaining = model.actions.map(\.id)
        #expect(remaining == ["b"])
        #expect(model.actions.first?.rank == 1)
    }
}

@MainActor
private final class FakePendingQueue: ProfilePendingQueueProviding {
    nonisolated deinit {}

    let withdrawResult: Bool
    private(set) var withdrawn: [String] = []
    private(set) var retried: [String] = []

    init(withdrawResult: Bool) {
        self.withdrawResult = withdrawResult
    }

    func directConversationIds(with userId: String) async -> Set<String> { [] }

    func pendingItems() -> AnyPublisher<[OutboxUIItem], Never> {
        Empty<[OutboxUIItem], Never>().eraseToAnyPublisher()
    }

    func withdraw(_ action: ProfilePendingAction) async -> Bool {
        withdrawn.append(action.clientMessageId)
        return withdrawResult
    }

    func retry(_ actions: [ProfilePendingAction]) async {
        retried.append(contentsOf: actions.map(\.id))
    }
}
