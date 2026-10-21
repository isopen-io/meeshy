import Foundation

/// Règles pures de fusion des conversations servies par `/sync` et par les deltas.
/// Aucune lecture d'état : ce que `ConversationSyncEngine` appelle en façade.
enum ConversationDeltaRules {
    /// LA FUSION PAR CHAMPS SERVIS — l'exact miroir de `syncConversationSelect`
    /// (`routes/sync/conversations.ts`) : ce que `/sync` sert avance, ce qu'il
    /// ne sert pas (aperçu, traductions, non-lus, participants, préférences,
    /// rôle courant) reste au cache. Un champ ajouté au select serveur doit
    /// s'ajouter ICI — le témoin de préservation
    /// (`ConversationSyncEngineTests`) rougit si une ligne maigre efface ce
    /// qu'elle ne portait pas.
    static func fusionneLigneDeSync(existante: MeeshyConversation?, recue: MeeshyConversation) -> MeeshyConversation {
        guard let existante else { return recue }
        // Ce que `/sync` SERT avance — verbatim, y compris ses `nil` (un titre
        // effacé côté serveur est une valeur, pas une absence). Le titre d'un
        // DIRECT avance avec l'interlocuteur dont il dérive, jamais seul (#11164).
        var fusion = existante.adoptingServedIdentity(of: recue)
        fusion.description = recue.description
        fusion.avatar = recue.avatar
        fusion.banner = recue.banner
        fusion.communityId = recue.communityId
        fusion.isActive = recue.isActive
        fusion.memberCount = recue.memberCount
        fusion.encryptionMode = recue.encryptionMode
        fusion.updatedAt = recue.updatedAt
        fusion.slowModeSeconds = recue.slowModeSeconds
        fusion.autoTranslateEnabled = recue.autoTranslateEnabled
        fusion.closedAt = recue.closedAt
        // `lastMessageAt` NE s'avance PAS ici (#7787) : l'activité voyage avec
        // son aperçu, que seule la route riche sert. Une ligne dont l'activité
        // a bougé est réhydratée (`doitEtreRehydratee`) ; si la réhydratation
        // échoue, l'ancienne activité reste, et le prochain delta la redétecte.
        // Ce que `/sync` NE SERT PAS ne bouge pas : `userState` (non-lus, nom
        // personnalisé), l'aperçu et ses traductions, les pièces, les
        // participants, le rôle courant, les vignettes — et la palette (`let`),
        // qui reste celle de la ligne existante par construction.
        return fusion
    }

    /// #11164 — les directs gravés sous le LECTEUR, rendus à un nom générique,
    /// et l'horizon depuis lequel `/sync` doit les resservir pour que leur vrai
    /// interlocuteur revienne. `nil` quand aucune ligne n'est gravée ainsi.
    static func reparationDesInterlocuteurs(
        _ conversations: [MeeshyConversation],
        readerId: String
    ) -> (liste: [MeeshyConversation], horizon: Date)? {
        let gravees = conversations.filter { $0.isInterlocutorTheReader(readerId) }
        guard let plusAncienne = gravees.map(\.updatedAt).min() else { return nil }
        let liste = conversations.map { $0.isInterlocutorTheReader(readerId) ? $0.withoutInterlocutor() : $0 }
        return (liste, plusAncienne.addingTimeInterval(-0.001))
    }

    /// Applique la réparation au cache de la liste et rend son horizon.
    static func repareLesInterlocuteurs(dans cache: CacheCoordinator, lecteur readerId: String) async -> Date? {
        let liste = await cache.conversations.load(for: "list").snapshot() ?? []
        guard let reparation = reparationDesInterlocuteurs(liste, readerId: readerId) else { return nil }
        await cache.conversations.update(for: "list") { conversations in
            reparationDesInterlocuteurs(conversations, readerId: readerId)?.liste ?? conversations
        }
        return reparation.horizon
    }

    /// Merge a batch of delta conversations into `existing` by id. Active deltas
    /// upsert (replace-or-insert); inactive deltas remove. Returns the merged
    /// list plus every inactive delta id (so the caller can invalidate their
    /// message caches, exactly as the previous per-delta loop did). The merged
    /// order is intentionally unspecified — callers re-sort via `saveSorted`.
    /// O(existing + deltas) instead of O(deltas × existing).
    ///
    /// `tombstoneIds` (`meta.deletedConversationIds`) est le TROISIÈME canal, et
    /// le seul par lequel une SORTIE de vue parvient au client : `deltas` ne
    /// porte que des lignes servies, et la clause serveur exclut précisément une
    /// conversation fermée, quittée, bannie ou supprimée-pour-moi depuis un
    /// autre appareil. Un `isActive: false` ne suffisait donc pas — il ne décrit
    /// que les sorties que la page peut encore SERVIR.
    ///
    /// Les tombstones s'appliquent APRÈS les upserts, jamais avant : quand les
    /// deux flux du même lot se contredisent (la page a servi une ligne encore
    /// visible à la lecture, le stream des sorties la déclare partie), la SORTIE
    /// est le fait le plus spécifique. La garder affichée rendrait la purge
    /// inatteignable jusqu'à la réconciliation complète (24 h).
    static func mergeDeltaConversations(
        existing: [MeeshyConversation],
        deltas: [MeeshyConversation],
        tombstoneIds: [String] = []
    ) -> (merged: [MeeshyConversation], removedIds: [String]) {
        var byId = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        var removedIds: [String] = []
        // `removedIds` pilote une invalidation par id chez l'appelant : un même
        // retrait annoncé par les DEUX canaux ne doit la déclencher qu'une fois.
        var alreadyRemoved = Set<String>()
        for delta in deltas {
            if delta.isActive {
                // Une ligne qui n'a pas élu l'interlocuteur d'un direct n'efface
                // pas celui que le cache connaît (#11164).
                byId[delta.id] = byId[delta.id].map(delta.keepingInterlocutor(of:)) ?? delta
            } else {
                byId.removeValue(forKey: delta.id)
                if alreadyRemoved.insert(delta.id).inserted { removedIds.append(delta.id) }
            }
        }
        // Un id inconnu de la liste est rapporté quand même — même règle que
        // pour un delta inactif inconnu : la liste et le cache des messages sont
        // deux magasins DISTINCTS, et une conversation absente de l'une peut
        // très bien laisser un fil dans l'autre. (Divergence assumée avec le
        // web, dont le cache dérivé est indexé par la même clé que la liste.)
        for tombstoneId in tombstoneIds {
            byId.removeValue(forKey: tombstoneId)
            if alreadyRemoved.insert(tombstoneId).inserted { removedIds.append(tombstoneId) }
        }
        return (Array(byId.values), removedIds)
    }
}
