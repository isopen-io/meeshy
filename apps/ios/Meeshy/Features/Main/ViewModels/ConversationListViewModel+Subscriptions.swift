import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

extension ConversationListViewModel {

    // MARK: - Push Notification Subscription

    /// Remonte une conversation en tête dès qu'une notification push
    /// « message » arrive — couvre les messages reçus alors que le websocket
    /// était déconnecté (app en arrière-plan). Le payload push ne porte pas
    /// l'horodatage du message ; on utilise `dateProvider()` (instant de
    /// réception). La conséquence — `lastMessageAt` légèrement dans le futur
    /// jusqu'au prochain sync — est documentée comme bénigne dans le spec.
    func subscribeToPushNotifications() {
        messageNotificationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] signal in
                guard let self else { return }
                guard let idx = self.convIndex(for: signal.conversationId) else {
                    self.fetchAndPrependMissingConversation(id: signal.conversationId, source: .pushNotification)
                    return
                }
                // Le push ne transporte AUCUN fait sur le message : sa facette
                // est neutre et `applyLastMessage` remplace les onze champs
                // `lastMessage*` en bloc. C'est le bon choix pour un message
                // qu'on n'a pas (garder ceux du précédent afficherait un auteur
                // faux) — mais destructeur pour celui que la ligne montre DÉJÀ.
                // Le socket `message:new` précède le push d'environ une seconde,
                // donc appliquer la facette ici effaçait l'aperçu et l'auteur
                // qu'il venait d'écrire, et `schedulePersist` gravait le vide en
                // L2 : la ligne restait muette jusqu'au prochain resync REST
                // complet. On ne bump que pour un AUTRE message.
                if let messageId = signal.messageId,
                   self.conversations[idx].lastMessageId == messageId {
                    return
                }
                self.bumpToTop(
                    conversationId: signal.conversationId,
                    facet: .bumped(at: self.dateProvider())
                )
            }
            .store(in: &cancellables)
    }

    // MARK: - Draft Summaries

    /// Recharge `draftSummaries` depuis le `DraftStore`. `internal` pour que
    /// les tests pilotent la synchro de façon déterministe.
    func reloadDraftSummaries() {
        draftSummaries = draftStore.allNonEmptyDrafts().mapValues { draft in
            DraftSummary(
                previewText: draft.text.trimmingCharacters(in: .whitespacesAndNewlines),
                updatedAt: draft.updatedAt
            )
        }
    }

    /// S'abonne aux mutations de brouillon. Le composer persiste à chaque
    /// frappe, donc `changed` émet en rafale — d'où le debounce de 300 ms qui
    /// évite de recharger tous les brouillons + re-trier à chaque caractère.
    /// Le re-`setConversations` ré-émet `$conversations`, ce qui relance le
    /// pipeline de groupement avec les `draftSummaries` fraîchement rechargés.
    func subscribeToDrafts() {
        draftStore.changed
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                self.reloadDraftSummaries()
                self.setConversations(self.conversations)
            }
            .store(in: &cancellables)
    }

    // MARK: - Typing Cleanup

    func scheduleTypingCleanup(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.clearTyping(for: conversationId)
            }
        }
    }

    /// A `typing:stop` removes ONLY the member who stopped. The row's indicator
    /// stays up (re-derived from the remaining typers) until the last one stops.
    /// Falls back to a full clear when we have no per-user tracking for the
    /// conversation (e.g. the display was seeded out-of-band), preserving the
    /// legacy "a stop clears the row" contract for that case.
    func handleTypingStopped(userId: String, conversationId: String) {
        guard var convTypers = typers[conversationId], !convTypers.isEmpty else {
            clearTyping(for: conversationId)
            return
        }
        convTypers.removeValue(forKey: userId)
        if convTypers.isEmpty {
            clearTyping(for: conversationId)
            return
        }
        typers[conversationId] = convTypers
        refreshTypingDerivations(for: conversationId)
    }

    private func clearTyping(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = nil
        if typingUsernames[conversationId] != nil { typingUsernames.removeValue(forKey: conversationId) }
        if typingUsers[conversationId] != nil { typingUsers.removeValue(forKey: conversationId) }
        typers.removeValue(forKey: conversationId)
    }

    /// Réaligne les deux vues publiques sur le frappeur retenu. Une seule
    /// sélection les alimente : la ligne et la pastille désignent donc toujours
    /// la même personne.
    func refreshTypingDerivations(for conversationId: String) {
        let selection = Self.typingSelection(for: typers[conversationId])
        if typingUsernames[conversationId] != selection?.displayName { typingUsernames[conversationId] = selection?.displayName }
        if typingUsers[conversationId] != selection?.username { typingUsers[conversationId] = selection?.username }
    }

    /// Un frappeur : son handle (`@pseudo`) et son nom d'affichage. Le gateway
    /// transmet les deux ; les deux surfaces n'en montrent pas le même.
    struct TypingUser: Equatable, Sendable {
        let username: String
        let displayName: String
    }

    /// Picks the single typer surfaced for a conversation. The row API is
    /// single-name; sorting keeps the choice deterministic (and stable across
    /// re-renders) when several members type at once.
    static func typingSelection(for typers: [String: TypingUser]?) -> TypingUser? {
        guard let typers, !typers.isEmpty else { return nil }
        return typers.values.sorted { ($0.displayName, $0.username) < ($1.displayName, $1.username) }.first
    }

    // MARK: - Badge Sync — forward each snapshot to the coordinator (badge + widget store). A list that never
    // loaded (`.idle` : the VM of an iPad detached window) publishes NOTHING: its `[]` wiped the widget.
    func syncBadgeOnUnreadChange() {
        $conversations.combineLatest($loadState.map { $0 != .idle }.removeDuplicates())
            .filter(\.1).map(\.0)
            .removeDuplicates { lhs, rhs in
                guard lhs.count == rhs.count else { return false }
                for (a, b) in zip(lhs, rhs) where a.id != b.id || a.userState.unreadCount != b.userState.unreadCount || a.userState.isPinned != b.userState.isPinned {
                    return false
                }
                return true
            }
            .debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
            .sink { convs in
                NotificationCoordinator.shared.registerConversations(convs)
            }
            .store(in: &cancellables)
    }

    // MARK: - Mark as Read (local update from ConversationView)

    func observeMarkAsRead() {
        if let existing = markAsReadObserver {
            NotificationCenter.default.removeObserver(existing)
        }
        markAsReadObserver = NotificationCenter.default.addObserver(
            forName: .conversationMarkedRead,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let cid = notification.object as? String else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                // La ligne AFFICHÉE d'abord, le store ensuite : `clearUnreadLocally`
                // est synchrone, `store.applyReadReceipt` traverse un acteur.
                // Les enchaîner dans l'autre sens faisait attendre à la pastille
                // un aller-retour d'acteur — visible en split-view iPad, où la
                // liste reste à l'écran pendant qu'on ouvre la conversation.
                self.clearUnreadLocally(cid)
                // Corrige le `ConversationStore` (RAM, tiers) : ce store
                // n'apprend autrement jamais qu'une
                // conversation vient d'être lue par CE chemin (rattrapage,
                // quick-action push, widget — tous postent `.conversationMarkedRead`,
                // aucun ne route vers `store.apply(.markAsRead, …)`). Sa
                // prochaine republication — déclenchée par N'IMPORTE QUELLE
                // mutation sur N'IMPORTE QUELLE AUTRE conversation, `commit()`
                // republiant tout le snapshot — regreffait sinon un `unreadCount`
                // périmé sur cette ligne pourtant déjà lue : le badge persistait
                // indéfiniment jusqu'au prochain `reloadFromCache()` (bug user
                // 2026-08-11). `applyReadReceipt` est LOCAL (jamais de réseau,
                // contrairement à `.markAsRead` — cf. `shouldDispatchListMarkAsRead` :
                // cet endpoint liste poste un mark-read « sans corps » auquel le
                // gateway retombe sur un repli par fenêtre temporelle, déclarant
                // lus des messages jamais montrés) et monotone sur `lastReadAt`
                // (inoffensif si un accusé plus récent est déjà en place).
                await self.store.applyReadReceipt(
                    ReadStatusEvent(conversationId: cid, unreadCount: 0, lastReadAt: Date())
                )
            }
        }
    }
}
