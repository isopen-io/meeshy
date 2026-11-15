import Foundation
import Combine
import os

// ConversationSyncEngine — le delta par `/sync` : client, créance, fusion des lignes servies.
// Voir la note d'extraction en tête de `ConversationSyncEngine.swift` (#4172).

extension ConversationSyncEngine {
    // MARK: - Delta via /sync (#4172 tranche 2b)

    /// POURQUOI le repli est une ÉNUMÉRATION : le critère 2 de #4172 interdit le
    /// `try?` silencieux — chaque retour au chemin historique DIT sa raison au
    /// journal, et un futur drapeau de bascule s'y ajoutera comme un cas, pas
    /// comme un booléen anonyme.
    enum RaisonDuRepliDeSync: String, Sendable {
        case creanceAbsente = "creance-absente"
        case survolMuet = "survol-muet"
        case syncRefuse = "sync-refuse"
        case cacheVide = "cache-vide"
    }

    enum CheminDuDelta {
        /// `rehydrater` : la fenêtre des lignes que `/sync` a laissées en
        /// retard (#7787), à relire par la route riche.
        case traite(DeltaOutcome, rehydrater: Date?)
        case repli(RaisonDuRepliDeSync)
    }

    func clientDeSync() -> SyncDeltaClientProviding {
        syncDeltaOverride ?? SyncDeltaClient(baseURL: api.baseURL)
    }

    /// #10927 — le jeton RAFRAÎCHI s'il était échu : `/sync` part par son propre
    /// transport, que la garde d'expiration d'`APIClient` ne couvre pas.
    func creanceDeSync() async -> SyncDeltaCredential? {
        if let jeton = await api.freshAuthToken() { return .membre(jeton: jeton) }
        if let session = api.anonymousSessionToken { return .invite(session: session) }
        return nil
    }

    /// LE DELTA PAR `/sync` — la collection `conversations`, le `seq` ANNONCÉ
    /// (sans lui la passerelle ne calcule jamais de trou, `routes/sync/index.ts`),
    /// et le curseur SERVEUR (`checkpoint`) comme watermark.
    ///
    /// LES LIGNES SERVIES SONT PLUS MAIGRES QUE CELLES DU CACHE
    /// (`syncConversationSelect` : ~21 colonnes, ni aperçu, ni non-lus, ni
    /// participants). Les REMPLACER détruirait ce que le cache sait — le motif
    /// « modèle plus strict que le fil » à l'envers. Chaque ligne reçue est donc
    /// FUSIONNÉE dans l'existante : les champs que `/sync` sert avancent, le
    /// reste ne bouge pas (`fusionneLigneDeSync`).
    func deltaViaSync() async -> CheminDuDelta {
        guard let creance = await creanceDeSync() else { return .repli(.creanceAbsente) }

        let demande = SyncDeltaRequest(
            since: WireDate.string(from: lastSyncTimestamp),
            collections: ["conversations"],
            seq: await SyncSeqTracker.shared.lastSeq.flatMap { Int(exactly: $0) }
        )
        let issue: SyncDeltaOutcome<APIConversation> = await clientDeSync()
            .demandeLeDelta(demande, creance: creance, rangeant: APIConversation.self)

        switch issue {
        case .muet:
            return .repli(.survolMuet)
        case .refuse:
            // Le serveur a DIT NON (collection non servie par ce déploiement,
            // requête refusée) : même repli nommé — le chemin historique sait
            // rejouer le delta, et le refus est journalisé par l'appelant.
            return .repli(.syncRefuse)
        case .inchange:
            // La fenêtre n'a pas bougé : rien à peindre, rien à avancer.
            return .traite(.complete, rehydrater: nil)
        case let .delta(delta, _):
            let collection = delta.collections["conversations"]
            let recues = (collection?.added ?? []) + (collection?.modified ?? [])
            let supprimees = collection?.deleted ?? []

            let existing = await cache.conversations.load(for: "list").snapshot() ?? []
            let parId = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

            let userId = await currentUserId()
            let mappees = await Self.mapConversationsOffMain(recues, userId: userId)
            let fenetre = Self.fenetreDeRehydratation(servies: mappees, cache: parId)
            // Une ligne NEUVE et active n'entre que riche : la réhydratation
            // l'ajoute. Une neuve INACTIVE passe — elle ne fait que retirer.
            let deltaConversations = mappees
                .filter { parId[$0.id] != nil || !$0.isActive }
                .map { Self.fusionneLigneDeSync(existante: parId[$0.id], recue: $0) }

            let (merged, removedIds) = Self.mergeDeltaConversations(
                existing: existing,
                deltas: deltaConversations,
                tombstoneIds: supprimees
            )
            let removedSet = Set(removedIds)
            for removedId in removedIds {
                await cache.messages.invalidate(for: removedId)
                await cache.invalidateConversationMedia(conversationId: removedId)
                await SearchIndex.shared.removeConversation(id: removedId)
            }
            guard await saveSorted(merged, to: "list", baseline: existing) else {
                return .traite(.failed, rehydrater: nil)
            }
            await SearchIndex.shared.indexConversations(
                deltaConversations.filter { $0.isActive && !removedSet.contains($0.id) }
            )
            _conversationsDidChange.send()

            // LE WATERMARK EST LE CURSEUR SERVEUR. `checkpoint` est l'horloge de
            // la passerelle — jamais celle de l'appareil (R15b) — et il n'avance
            // que sur une fenêtre PROUVÉE complète : `hasMore` laisse le curseur
            // en place pour que la fenêtre reste rejouable, `hasGap` dit que
            // l'absence dépasse ce que le serveur sait rejouer — les deux
            // escaladent vers `fullSync` par le chemin existant de l'appelant.
            let incomplet = delta.hasMore || delta.hasGap
            if !incomplet, let checkpoint = delta.checkpoint,
               let date = WireDate.date(from: checkpoint) {
                lastSyncTimestamp = max(lastSyncTimestamp, date)
            }
            return .traite(DeltaOutcome(succeeded: true, mayHaveMore: incomplet), rehydrater: fenetre)
        }
    }

    /// Façade : la fusion par champs servis vit dans `ConversationDeltaRules`.
    static func fusionneLigneDeSync(existante: MeeshyConversation?, recue: MeeshyConversation) -> MeeshyConversation {
        ConversationDeltaRules.fusionneLigneDeSync(existante: existante, recue: recue)
    }

    /// Façade : la fusion des deltas (upserts, inactifs, tombstones) vit dans `ConversationDeltaRules`.
    static func mergeDeltaConversations(
        existing: [MeeshyConversation],
        deltas: [MeeshyConversation],
        tombstoneIds: [String] = []
    ) -> (merged: [MeeshyConversation], removedIds: [String]) {
        ConversationDeltaRules.mergeDeltaConversations(existing: existing, deltas: deltas, tombstoneIds: tombstoneIds)
    }
}
