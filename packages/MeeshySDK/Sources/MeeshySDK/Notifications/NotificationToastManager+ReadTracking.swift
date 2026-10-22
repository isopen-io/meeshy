import Foundation
import Combine
import os

private let logger = MeeshyLog.logger(.notifications, subsystem: .sdk)

extension NotificationToastManager {
    public func onConversationOpened(_ conversationId: String) {
        // Gate idempotent : un parent qui observe ce manager (RootView / iPadRootView)
        // se re-render à chaque mutation `@Published`, ce qui fait re-construire à
        // SwiftUI un `ConversationViewModel` jetable → un `ConversationSocketHandler`
        // jetable → un nouvel appel à `onConversationOpened` pour la conversation DÉJÀ
        // ouverte. Sans ce gate, chaque tour relance `markConversationRead` +
        // `refreshUnreadCount` ET re-publie `activeConversationId`/`unreadCount`, ce
        // qui re-render le parent → boucle auto-entretenue (storm 429 sur `/read`).
        // Re-ouvrir réellement une autre conversation, ou la même après
        // `onConversationClosed()` (→ nil), passe normalement.
        //
        // Le compte, lui, passe AVANT le gate : la même conversation ouverte
        // dans une seconde fenêtre est une seconde ouverture, que sa
        // fermeture devra équilibrer.
        openConversationCounts[conversationId, default: 0] += 1
        openConversationStack.removeAll { $0 == conversationId }
        openConversationStack.append(conversationId)
        MessageSocketManager.shared.openConversationIds = openConversationIds
        guard conversationId != activeConversationId else { return }

        activeConversationId = conversationId
        MessageSocketManager.shared.activeConversationId = conversationId

        if let toast = currentToast, toast.conversationId == conversationId {
            dismissToast()
        }

        consumeConversationLocally(conversationId)
    }

    /// Variante de `onConversationOpened` pour un marquage SANS ouverture : la
    /// quick-action « Marquer lu » d'une bannière push et l'action du widget
    /// consomment la conversation sans jamais l'afficher. Fait le même triplet
    /// (publisher in-app + patch du cache GRDB + marquage serveur coalescé)
    /// mais ne déclare PAS la conversation active — l'app peut être en
    /// arrière-plan, aucune surface n'est ouverte.
    public func onConversationMarkedRead(_ conversationId: String) {
        if let toast = currentToast, toast.conversationId == conversationId {
            dismissToast()
        }

        consumeConversationLocally(conversationId)
    }

    /// Ce qu'une conversation consommée déclenche, en UN site (#6999).
    ///
    /// On informe d'abord la liste in-app (mise à jour optimiste instantanée),
    /// puis on marque côté serveur (qui ré-émet `notification:counts` → la
    /// cloche et le badge se recalent, le compteur étant ensuite rafraîchi),
    /// et enfin — c'est le geste qui MANQUAIT — on retire du centre iOS les
    /// bannières du fil : le contenu était réputé consommé partout sauf là où
    /// l'utilisateur allait le relire.
    ///
    /// Site unique parce que ses deux appelants (`onConversationOpened` et
    /// `onConversationMarkedRead`) avaient déjà divergé une fois : le second
    /// est né en copiant le premier, et tout ce qu'on ajoute à l'un doit être
    /// ajouté à l'autre pour rester vrai.
    private func consumeConversationLocally(_ conversationId: String) {
        conversationNotificationsRead.send(conversationId)
        applyReadToCache(.conversation(id: conversationId))
        markConversationNotificationsRead(conversationId)
        deliveredBannerPurger?(.conversation(id: conversationId))
    }

    /// Pendant de `onConversationOpened` pour un contenu social : story, statut
    /// ou post de feed. Le contenu étant consommé, ses notifications (« X a
    /// publié une story », commentaires et réactions dessus) ne doivent plus
    /// apparaître comme non lues.
    ///
    /// Ne PAS confondre avec l'appel opportuniste que le gateway fait déjà
    /// depuis `POST /posts/:postId/view` : celui-là est borné à la PREMIÈRE vue,
    /// et le « vu » client est coalescé (binaire) donc une seconde ouverture ne
    /// repart même pas. Une notification arrivée après la première vue resterait
    /// non lue pour toujours.
    public func onPostOpened(_ postId: String) {
        guard postId != activePostId else { return }

        activePostId = postId

        if let toast = currentToast, toast.postId == postId {
            dismissToast()
        }

        consumePostLocally(postId)
    }

    /// Jumelle de `onConversationMarkedRead` pour un POST : consomme ses
    /// notifications SANS déclarer le contenu actif.
    ///
    /// C'est la forme qu'il faut à `consume(.post(id:))` quand l'ordre vient
    /// d'une bannière push tapée ou d'une action rapide de commentaire :
    /// l'app peut être en arrière-plan, aucun viewer n'est monté, et poser
    /// `activePostId` ferait taire les toasts d'un contenu que personne ne
    /// regarde — jusqu'à un `onPostClosed` qui ne viendrait jamais.
    public func onPostConsumed(_ postId: String) {
        if let toast = currentToast, toast.postId == postId {
            dismissToast()
        }

        consumePostLocally(postId)
    }

    /// Le pendant de `consumeConversationLocally` pour un post — même raison
    /// d'être un site unique, mêmes deux appelants jumeaux.
    private func consumePostLocally(_ postId: String) {
        postNotificationsRead.send(postId)
        applyReadToCache(.post(id: postId))
        markPostNotificationsRead(postId)
        deliveredBannerPurger?(.post(id: postId))
    }

    /// Relâche la déclaration de contenu actif — appelé à la fermeture du
    /// viewer. Conditionnel à l'identité pour rester correct sur un
    /// enchaînement rapide A→B où le `onDisappear` de A arrive après le
    /// `onAppear` de B.
    public func onPostClosed(_ postId: String? = nil) {
        guard postId == nil || postId == activePostId else { return }
        activePostId = nil
    }

    /// Même gate que `markConversationNotificationsRead` : au plus un POST par
    /// post et par fenêtre, jamais deux en vol.
    private func stampPostRead(_ postId: String) {
        lastPostReadAt = Self.stampingCooldown(lastPostReadAt, key: postId, at: Date(), window: Self.conversationReadMinInterval)
    }

    /// Pose l'horodatage de `key` et oublie ceux dont la fenêtre est passée : ils ne bloquent plus rien.
    /// Sans cet élagage, chaque conversation et chaque post jamais ouverts gardaient leur entrée jusqu'à la
    /// déconnexion — des milliers sur une session de plusieurs jours.
    nonisolated static func stampingCooldown(
        _ stamps: [String: Date], key: String, at now: Date, window: TimeInterval
    ) -> [String: Date] {
        var kept = stamps.filter { now.timeIntervalSince($0.value) < window }
        kept[key] = now
        return kept
    }

    private func markPostNotificationsRead(_ postId: String) {
        guard postReadTasks[postId] == nil else { return }
        if let last = lastPostReadAt[postId],
           Date().timeIntervalSince(last) < Self.conversationReadMinInterval {
            // #7000 — le cooldown protège le POST, jamais la LECTURE du
            // compteur. Sortir sec sautait aussi `refreshUnreadCount()` : une
            // réouverture dans les cinq secondes laissait la pastille sur sa
            // valeur d'avant, et rien d'autre ne la recalait tant qu'aucune
            // mutation ne provoquait de `notification:counts`.
            Task { [weak self] in await self?.refreshUnreadCount() }
            return
        }
        postReadTasks[postId] = Task { [weak self] in
            // Chaque slide de story est un post distinct : sans ce filtre, une
            // story de dix slides émettrait dix POST. Quand le cache de la
            // cloche est peuplé et ne référence AUCUNE notification non lue pour
            // ce post, il n'y a rien à marquer. Cache vide ou inconnu → on
            // appelle quand même, le serveur fait autorité.
            if await Self.hasNoKnownUnreadNotification(forPost: postId) {
                self?.stampPostRead(postId)
                self?.postReadTasks[postId] = nil
                return
            }
            do {
                try await NotificationService.shared.markPostRead(postId: postId)
            } catch {
                logger.error("Failed to mark post \(postId) read: \(error.localizedDescription)")
            }
            await self?.refreshUnreadCount()
            self?.stampPostRead(postId)
            self?.postReadTasks[postId] = nil
        }
    }

    /// `true` seulement quand on SAIT qu'il n'y a rien à marquer — c'est-à-dire
    /// quand le cache de la cloche est peuplé et ne contient aucune ligne non
    /// lue portant ce `postId`. Un cache vide répond `false` (« je ne sais
    /// pas »), ce qui laisse partir la requête.
    private static func hasNoKnownUnreadNotification(forPost postId: String) async -> Bool {
        guard let cached = await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: "all"),
              !cached.items.isEmpty else { return false }
        return !cached.items.contains { !$0.isRead && $0.context?.postId == postId }
    }

    /// Émet le `POST /notifications/conversation/:id/read` au plus une fois
    /// par conversation et par fenêtre de `conversationReadMinInterval`, et
    /// jamais deux fois en vol simultanément. Voir le commentaire des
    /// propriétés `conversationReadTasks` / `lastConversationReadAt`.
    private func markConversationNotificationsRead(_ conversationId: String) {
        guard conversationReadTasks[conversationId] == nil else { return }
        if let last = lastConversationReadAt[conversationId],
           Date().timeIntervalSince(last) < Self.conversationReadMinInterval {
            // #7000 — même correction que sur le chemin post : le cooldown
            // protège le POST, pas la LECTURE. `refreshUnreadCount()` est
            // lui-même coalescé (1,5 s + tâche partagée), donc le redemander
            // ici ne rouvre aucune rafale.
            Task { [weak self] in await self?.refreshUnreadCount() }
            return
        }
        conversationReadTasks[conversationId] = Task { [weak self] in
            do {
                try await NotificationService.shared.markConversationRead(conversationId: conversationId)
            } catch {
                logger.error("Failed to mark conversation \(conversationId) read: \(error.localizedDescription)")
            }
            await self?.refreshUnreadCount()
            if let self {
                self.lastConversationReadAt = Self.stampingCooldown(
                    self.lastConversationReadAt, key: conversationId, at: Date(), window: Self.conversationReadMinInterval)
            }
            self?.conversationReadTasks[conversationId] = nil
        }
    }

    /// **Ferme UNE conversation nommée — et seulement si c'est elle** (#5938).
    ///
    /// Elle effaçait `activeConversationId` sans savoir ce qu'elle fermait, et
    /// elle part d'un `deinit`, donc d'une `Task` DIFFÉRÉE. En passant d'une
    /// conversation à l'autre, l'ordre réel est : on quitte A (fermeture
    /// planifiée), on ouvre B (synchrone), puis la fermeture de A s'exécute —
    /// et remettait tout à `nil`. On était dans B pendant que l'app se croyait
    /// nulle part, si bien que le garde de `handleNewNotification` ne filtrait
    /// plus rien : chaque message de B s'affichait en toast par-dessus le fil
    /// qu'on lisait.
    ///
    /// Une fermeture arrivée après l'ouverture de la suivante devient donc un
    /// no-op, ce qu'elle aurait toujours dû être. Un `deinit` ne dit pas
    /// seulement SI l'on ferme : il doit dire QUOI.
    ///
    /// **Multi-fenêtre** : fermer la conversation active rend la main à celle
    /// qui reste affichée ailleurs (la plus récemment ouverte), au lieu de
    /// remettre l'app « nulle part ». Le moteur de synchro, lui, tient son
    /// propre ensemble de conversations ouvertes : celle qui reste à l'écran
    /// ne s'est jamais remise à compter ses messages comme non lus.
    public func onConversationClosed(_ conversationId: String) {
        if let count = openConversationCounts[conversationId] {
            if count > 1 {
                openConversationCounts[conversationId] = count - 1
            } else {
                openConversationCounts.removeValue(forKey: conversationId)
                openConversationStack.removeAll { $0 == conversationId }
            }
        }
        MessageSocketManager.shared.openConversationIds = openConversationIds
        guard conversationId == activeConversationId,
              !isConversationOpen(conversationId) else { return }
        let remaining = openConversationStack.last
        activeConversationId = remaining
        MessageSocketManager.shared.activeConversationId = remaining
        // Le moteur de synchro n'a plus à être relancé ici : il tient lui-même l'ENSEMBLE des conversations ouvertes
        // (`openConversation` / `closeConversation`), celle qui reste à l'écran n'en est jamais sortie.
    }
}
