import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// La ligne de liste d'une conversation chiffrée de bout en bout lit le clair
/// que CET appareil tient de son dernier message (#12968) : ce qu'il a écrit
/// (`EndToEndSendSealer` le range sous l'identifiant serveur à l'acquittement)
/// ou ce que libsignal a ouvert — le même coffre que le fil. Ce que libsignal
/// en a authentifié (conversation, auteur, composition) voyage avec lui, et la
/// ligne le confronte à ce qu'elle montre à CHAQUE rendu
/// (`ConversationPreviewDeviceText.reading`). Le clair n'est tenu qu'en
/// mémoire par la liste, jamais écrit dans le cache des conversations ni
/// renvoyé au serveur. Absent, indéchiffrable ou hors de sa place, la ligne
/// garde « Message chiffré ».
nonisolated enum ConversationListEndToEndTexts {

    /// Un dernier message scellé par le serveur, que la ligne nomme.
    static func awaitsPlaintext(_ conversation: Conversation) -> Bool {
        conversation.lastMessageNature?.isEncrypted == true && !(conversation.lastMessageId ?? "").isEmpty
    }

    /// Le clair de la ligne, s'il est à SA place ; `nil` sinon. L'auteur se dit
    /// comme la ligne le dit : moi, ou un pair nommé.
    static func adoption(
        of entry: E2EEPlaintextEntry?, for conversation: Conversation, viewerId: String?
    ) -> ConversationPreviewDeviceText? {
        guard let viewerId, !viewerId.isEmpty, let messageId = conversation.lastMessageId,
              case .readable(let content, let senderUserId)? = entry,
              let writtenFor = content.conversationId else { return nil }
        let candidate = ConversationPreviewDeviceText(
            messageId: messageId,
            conversationId: writtenFor,
            author: senderUserId == viewerId ? .reader : .peer(userId: senderUserId),
            composedAt: Date(timeIntervalSince1970: TimeInterval(content.sentAt) / 1000),
            text: content.text ?? "",
            language: content.language
        )
        return candidate.reading(conversation)
    }

    /// Les clairs déjà tenus qui sont encore à leur place.
    static func kept(
        _ known: [String: ConversationPreviewDeviceText], in conversations: [Conversation]
    ) -> [String: ConversationPreviewDeviceText] {
        conversations.reduce(into: [String: ConversationPreviewDeviceText]()) { kept, conversation in
            guard let text = known[conversation.id]?.reading(conversation) else { return }
            kept[conversation.id] = text
        }
    }

    /// Lit le coffre pour les lignes scellées qui n'ont pas encore leur clair,
    /// hors des messages d'un pair déjà cherchés sans succès (`misses`, vidés à
    /// chaque ouverture), et rend la carte complète avec les nouveaux manques.
    static func resolve(
        _ conversations: [Conversation],
        known: [String: ConversationPreviewDeviceText],
        misses: Set<String>,
        viewerId: String?,
        from endToEnd: any EndToEndMessagingProviding
    ) async -> (texts: [String: ConversationPreviewDeviceText], misses: Set<String>) {
        let kept = kept(known, in: conversations)
        let pending = conversations.filter {
            awaitsPlaintext($0) && kept[$0.id] == nil && !misses.contains($0.lastMessageId ?? "")
        }
        let ids = pending.compactMap(\.lastMessageId)
        guard !ids.isEmpty, let viewerId, !viewerId.isEmpty else { return (kept, misses) }
        let entries = await endToEnd.plaintexts(for: ids, as: viewerId)
        return pending.reduce(into: (texts: kept, misses: misses)) { found, conversation in
            let entry = conversation.lastMessageId.flatMap { entries[$0] }
            if let text = adoption(of: entry, for: conversation, viewerId: viewerId) {
                found.texts[conversation.id] = text
            } else if let id = conversation.lastMessageId, !isMine(conversation) {
                found.misses.insert(id)
            }
        }
    }

    /// Mon propre envoi n'entre jamais dans les manques : son clair se range
    /// sous l'identifiant serveur à l'acquittement, qui peut suivre la ligne.
    static func isMine(_ conversation: Conversation) -> Bool {
        conversation.lastMessageSenderUserId == nil
            && conversation.lastMessageSenderName == ConversationListAuthor.readerLabel
    }
}

/// La carte « conversation → clair local du dernier message » que la liste
/// passe à ses rangées (#12968). Relue quand la liste change et quand
/// libsignal ouvre des enveloppes (une rafale de rattrapage ne relit qu'une
/// fois) ; une seule lecture en vol, la plus récente gagne. Un message cherché
/// sans succès n'est relu qu'après une ouverture ; mon propre envoi, dont le
/// clair se range à l'acquittement et peut suivre la ligne, est relu UNE fois
/// de plus peu après. `willChange` prévient le modèle de la liste, que la vue
/// observe.
@MainActor
final class ConversationListEndToEndTextStore {
    nonisolated deinit {}

    private(set) var texts: [String: ConversationPreviewDeviceText] = [:]
    private var misses: Set<String> = []
    private var retriedMine: Set<String> = []
    private let mineRetryDelay: Duration
    private let endToEnd: any EndToEndMessagingProviding
    private let viewerId: @MainActor () -> String?
    private let willChange: @MainActor () -> Void
    /// Ce que l'appareil traduit de ces clairs (#13002), en mémoire.
    let translations: ConversationListDeviceTranslations
    private var latestRows: [Conversation] = []
    private var reading: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(
        rows: AnyPublisher<[Conversation], Never>,
        endToEnd: any EndToEndMessagingProviding = EndToEndMessagingRuntime.shared,
        viewerId: @escaping @MainActor () -> String?,
        mineRetryDelay: Duration = .milliseconds(600),
        translations: ConversationListDeviceTranslations? = nil,
        willChange: @escaping @MainActor () -> Void
    ) {
        self.mineRetryDelay = mineRetryDelay
        self.endToEnd = endToEnd
        self.viewerId = viewerId
        self.willChange = willChange
        self.translations = translations ?? ConversationListDeviceTranslations(willChange: willChange)
        // La première liste se lit sans attendre (#13002, clignotement au
        // démarrage) ; les suivantes, regroupées.
        rows
            .prefix(1)
            .sink { [weak self] rows in self?.refresh(rows) }
            .store(in: &cancellables)
        rows
            .dropFirst()
            .debounce(for: .milliseconds(16), scheduler: DispatchQueue.main)
            .sink { [weak self] rows in self?.refresh(rows) }
            .store(in: &cancellables)
        // #13000 — une lecture faite avant l'ouverture de la session n'a rien
        // rendu : elle n'est pas un manque, la session ouverte relit tout.
        // Un autre compte ne trouve rien du précédent en mémoire.
        endToEnd.sessions
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.forgetEverything() }
            .store(in: &cancellables)
        endToEnd.opened.map { _ in () }
            .merge(with: endToEnd.sessions.map { _ in () })
            .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.misses = []
                self.refresh(self.latestRows)
            }
            .store(in: &cancellables)
    }

    private func forgetEverything() {
        guard !texts.isEmpty || !misses.isEmpty else { return }
        willChange()
        texts = [:]
        misses = []
        retriedMine = []
        translations.forget()
    }

    func text(for conversationId: String) -> ConversationPreviewDeviceText? {
        texts[conversationId].map(translations.dressing)
    }

    private func refresh(_ rows: [Conversation]) {
        latestRows = rows
        let known = texts
        let misses = misses
        let viewer = viewerId()
        let endToEnd = endToEnd
        reading?.cancel()
        reading = Task { [weak self] in
            let resolved = await ConversationListEndToEndTexts.resolve(
                rows, known: known, misses: misses, viewerId: viewer, from: endToEnd
            )
            guard !Task.isCancelled, let self else { return }
            self.misses = resolved.misses
            self.retryMine(in: rows, unresolvedBy: resolved.texts)
            self.translations.translate(Array(resolved.texts.values))
            guard self.texts != resolved.texts else { return }
            self.willChange()
            self.texts = resolved.texts
        }
    }

    private func retryMine(in rows: [Conversation], unresolvedBy texts: [String: ConversationPreviewDeviceText]) {
        let waiting = rows.filter {
            ConversationListEndToEndTexts.awaitsPlaintext($0) && ConversationListEndToEndTexts.isMine($0) && texts[$0.id] == nil
        }.compactMap(\.lastMessageId).filter { !retriedMine.contains($0) }
        guard !waiting.isEmpty else { return }
        retriedMine.formUnion(waiting)
        let delay = mineRetryDelay
        Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            guard let self else { return }
            self.refresh(self.latestRows)
        }
    }
}
