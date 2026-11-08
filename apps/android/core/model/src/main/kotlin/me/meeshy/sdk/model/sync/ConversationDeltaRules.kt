package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Règles pures de fusion des lignes servies par `GET /sync` — miroir de `ConversationDeltaRules` (iOS).
 *
 * LA FUSION PAR CHAMPS SERVIS : ce que `/sync` sert avance, ce qu'il ne sert pas (aperçu et ses
 * traductions, non-lus, participants hors interlocuteur, préférences, rôle courant, étiquettes,
 * derniers messages) reste au cache. Un champ ajouté au `select` serveur doit s'ajouter ICI : le
 * témoin de préservation rougit si une ligne maigre efface ce qu'elle ne portait pas.
 */
object ConversationDeltaRules {

    /** Ce qu'un lot de lignes servies change dans le cache. */
    data class Merge(
        /** Les lignes du cache dont des champs ont avancé, à réécrire. */
        val upserts: List<ApiConversation>,
        /** Les conversations sorties de la vue (inactives ou tombstones) : à retirer, sans doublon. */
        val removedIds: List<String>,
        /**
         * Au moins une ligne ne s'explique pas par la ligne maigre : conversation inconnue du cache, ou
         * activité plus récente que l'aperçu gardé. Seule la route riche sert l'aperçu et les non-lus.
         */
        val needsRichRefresh: Boolean,
    )

    fun merge(
        existing: Map<String, ApiConversation>,
        rows: List<SyncConversationRow>,
        tombstoneIds: List<String> = emptyList(),
    ): Merge {
        val upserts = LinkedHashMap<String, ApiConversation>()
        val removed = LinkedHashSet<String>()
        var rich = false
        for (row in rows) {
            val known = existing[row.id]
            when {
                row.isActive == false -> removed += row.id
                known == null -> rich = true
                else -> {
                    upserts[row.id] = fuse(known, row)
                    if (activityMoved(known, row)) rich = true
                }
            }
        }
        // La SORTIE est le fait le plus spécifique : elle s'applique après les upserts.
        tombstoneIds.forEach { removed += it }
        removed.forEach { upserts.remove(it) }
        return Merge(upserts.values.toList(), removed.toList(), rich)
    }

    /** `lastMessageAt` ne s'avance PAS ici : l'activité voyage avec son aperçu, que seule la route riche sert. */
    fun fuse(existing: ApiConversation, row: SyncConversationRow): ApiConversation {
        val identity = existing.copy(
            type = row.type ?: existing.type,
            identifier = row.identifier ?: existing.identifier,
            title = servedTitle(existing, row),
            participants = servedParticipants(existing, row),
        )
        return identity.copy(
            description = row.description,
            avatar = row.avatar,
            banner = row.banner,
            communityId = row.communityId,
            serverMemberCount = row.memberCount ?: existing.serverMemberCount,
            memberCountCapped = if (row.memberCount != null) null else existing.memberCountCapped,
            isActive = row.isActive ?: existing.isActive,
            encryptionMode = row.encryptionMode,
            updatedAt = row.updatedAt ?: existing.updatedAt,
            slowModeSeconds = row.slowModeSeconds,
            autoTranslateEnabled = row.autoTranslateEnabled ?: existing.autoTranslateEnabled,
            defaultWriteRole = row.defaultWriteRole ?: existing.defaultWriteRole,
            isAnnouncementChannel = row.isAnnouncementChannel ?: existing.isAnnouncementChannel,
        )
    }

    /** Le titre d'un direct avance avec l'interlocuteur dont il dérive, jamais seul. */
    private fun servedTitle(existing: ApiConversation, row: SyncConversationRow): String? {
        if ((row.type ?: existing.type) != DIRECT) return row.title
        return if (row.participants.any { !it.userId.isNullOrBlank() }) row.title else existing.title
    }

    /** Seuls les pairs servis avancent (identité) ; le reste du roster, et son rôle, restent au cache. */
    private fun servedParticipants(existing: ApiConversation, row: SyncConversationRow): List<ApiParticipant> {
        if (row.participants.isEmpty()) return existing.participants
        val byUser = existing.participants.associateBy { it.userId }
        val served = row.participants.map { peer ->
            val name = peer.displayName ?: peer.user?.displayName
            val known = peer.userId?.let(byUser::get)
            known?.copy(
                displayName = name,
                username = peer.user?.username ?: known.username,
                avatar = peer.avatar ?: peer.user?.avatar,
            ) ?: ApiParticipant(
                id = peer.id,
                userId = peer.userId,
                displayName = name,
                username = peer.user?.username,
                avatar = peer.avatar ?: peer.user?.avatar,
            )
        }
        val servedUsers = served.mapNotNullTo(HashSet()) { it.userId }
        return served + existing.participants.filter { it.userId == null || it.userId !in servedUsers }
    }

    private fun activityMoved(known: ApiConversation, row: SyncConversationRow): Boolean {
        val served = isoToEpochMillisOrNull(row.lastMessageAt) ?: return false
        val cached = isoToEpochMillisOrNull(known.lastMessage?.createdAt) ?: return true
        return served > cached
    }

    private const val DIRECT = "direct"
}
