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
}
