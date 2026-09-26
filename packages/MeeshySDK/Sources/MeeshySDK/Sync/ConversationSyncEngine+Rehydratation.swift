import Combine
import Foundation
import os

/// LA LIGNE DE LISTE NE S'ÉCRIT QUE RICHE (#7787).
///
/// `/sync` sert des lignes MAIGRES (`syncConversationSelect`) : ni l'aperçu du
/// dernier message, ni sa carte du Prisme, ni les non-lus. Ces trois-là, avec
/// la protection de l'aperçu (vue unique, éphémère, flouté), ne sont composés
/// qu'à UN endroit : `GET /conversations` (`routes/conversations/core-list.ts`).
///
/// D'où la règle : l'ACTIVITÉ d'une ligne (`lastMessageAt`) et son aperçu
/// voyagent ENSEMBLE. `/sync` dit QUELLES lignes ont bougé ; la route riche
/// les réécrit. Une ligne que `/sync` découvre n'entre dans la liste que par
/// la route riche — jamais sans aperçu.
///
/// Sans elle, une conversation qui avait reçu des messages pendant
/// l'arrière-plan remontait en tête avec l'ANCIEN texte, et le watermark
/// avançait par-dessus : la fenêtre n'était plus jamais relue.
extension ConversationSyncEngine {

    enum IssueDeLaRehydratation: Equatable {
        case faite(resteAuServeur: Bool)
        case echouee
    }

    /// Au-delà, la fenêtre est confiée au plein (`mayHaveMore`).
    static let rehydratationMaxPages = 20

    /// Une ligne servie par `/sync` que la liste ne peut pas peindre juste :
    /// inconnue du cache, ou dont l'activité a bougé (message reçu, ou dernier
    /// message supprimé — `lastMessageAt` recule alors).
    static func doitEtreRehydratee(_ recue: MeeshyConversation, existante: MeeshyConversation?) -> Bool {
        guard recue.isActive else { return false }
        guard let existante else { return true }
        return recue.lastMessageAt != existante.lastMessageAt
    }

    /// La borne `updatedSince` qui couvre toutes les lignes à réhydrater. La
    /// borne serveur est STRICTE (`updatedAt > since`) : une milliseconde en
    /// deçà de la plus ancienne. `nil` quand rien n'est à réhydrater.
    static func fenetreDeRehydratation(
        servies: [MeeshyConversation],
        cache parId: [String: MeeshyConversation]
    ) -> Date? {
        servies
            .filter { doitEtreRehydratee($0, existante: parId[$0.id]) }
            .map(\.updatedAt)
            .min()?
            .addingTimeInterval(-0.001)
    }

    /// Relit la fenêtre par la route riche et réécrit ses lignes EN ENTIER —
    /// la route riche est la vérité de la ligne de liste.
    func rehydrateDepuisLaRouteRiche(depuis since: Date) async -> IssueDeLaRehydratation {
        let userId = await currentUserId()
        var recues: [MeeshyConversation] = []
        var resteAuServeur = false

        for page in 0..<Self.rehydratationMaxPages {
            let response: OffsetPaginatedAPIResponse<[APIConversation]>
            do {
                response = try await api.request(
                    ConversationsEndpoint.root,
                    method: "GET",
                    body: nil,
                    queryItems: [
                        URLQueryItem(name: "limit", value: String(Self.deltaPageLimit)),
                        URLQueryItem(name: "offset", value: String(page * Self.deltaPageLimit)),
                        URLQueryItem(name: "updatedSince", value: WireDate.string(from: since))
                    ]
                )
            } catch {
                Self.logger.error("[SyncEngine] réhydratation des lignes en retard : \(error.localizedDescription, privacy: .public)")
                return .echouee
            }
            recues += await Self.mapConversationsOffMain(response.data, userId: userId)
            resteAuServeur = response.pagination?.hasMore ?? (response.data.count >= Self.deltaPageLimit)
            guard resteAuServeur, !response.data.isEmpty else { break }
        }

        guard !recues.isEmpty else { return .faite(resteAuServeur: resteAuServeur) }

        let existing = await cache.conversations.load(for: "list").snapshot() ?? []
        let (merged, removedIds) = Self.mergeDeltaConversations(existing: existing, deltas: recues)
        let removedSet = Set(removedIds)
        for removedId in removedIds {
            await cache.messages.invalidate(for: removedId)
            await cache.invalidateConversationMedia(conversationId: removedId)
            await SearchIndex.shared.removeConversation(id: removedId)
        }
        await saveSorted(merged, to: "list", baseline: existing)
        await SearchIndex.shared.indexConversations(
            recues.filter { $0.isActive && !removedSet.contains($0.id) }
        )
        _conversationsDidChange.send()
        return .faite(resteAuServeur: resteAuServeur)
    }

    /// Les messages que l'extension de notification a PRÉCHARGÉS pendant
    /// l'arrière-plan peignent leur ligne dès le réveil, avant tout réseau :
    /// même facette que `message:new` (`LastMessageFacet`), même garde d'ordre
    /// (`ConversationListLastMessage.applying`). Une conversation inconnue du
    /// cache attend la réhydratation — elle n'entre que riche. Les non-lus
    /// viennent de la réhydratation, la seule à les compter.
    public func peintLesMessagesPrecharges(_ apiMessages: [APIMessage]) async {
        guard !apiMessages.isEmpty else { return }
        let userId = await currentUserId()
        let username = await currentUsername()
        let displayName = await currentUserDisplayName()
        let preferredLanguages = await currentPreferredLanguages()
        let facettes = apiMessages
            .sorted { $0.createdAt < $1.createdAt }
            .map { apiMessage in
                let message = apiMessage.toMessage(
                    currentUserId: userId, currentUsername: username,
                    currentUserDisplayName: displayName, preferredLanguages: preferredLanguages
                )
                let facet = LastMessageFacet(
                    message: message,
                    preview: message.content,
                    translations: Self.previewTranslations(from: apiMessage, viewerLanguages: preferredLanguages)
                )
                return (facet: facet, conversationId: apiMessage.conversationId)
            }
        await cache.conversations.update(for: "list") { conversations in
            facettes.reduce(conversations) { liste, entree in
                ConversationListLastMessage.applying(entree.facet, conversationId: entree.conversationId, to: liste) ?? liste
            }
        }
        _conversationsDidChange.send()
    }
}
