package me.meeshy.sdk.model.sync

import kotlinx.serialization.Serializable

/**
 * Le cadre que `GET /sync` rend sous `data` (`services/gateway/src/routes/sync/index.ts`) — miroir de
 * `SyncDelta` (iOS). Tout champ est optionnel : une passerelle plus ancienne ou plus récente ne casse
 * pas le décodage, un champ inconnu est ignoré par `MeeshyApi.json`.
 */
@Serializable
data class SyncResponse(
    /** L'horloge SERVEUR du tour : le point de reprise (`since`) du suivant, jamais celle de l'appareil. */
    val checkpoint: String? = null,
    val checkpointSeq: Long? = null,
    /** Le trou dépasse ce que le serveur sait rejouer : le delta ne prouve rien, on escalade. */
    val hasGap: Boolean = false,
    val hasMore: Boolean = false,
    val collections: Map<String, SyncCollectionPage<SyncConversationRow>> = emptyMap(),
) {
    val conversations: SyncCollectionPage<SyncConversationRow>?
        get() = collections[CONVERSATIONS]

    companion object {
        const val CONVERSATIONS: String = "conversations"
    }
}

/** UNE collection du delta : ajoutées, modifiées, disparues, et l'ancre de la page suivante. */
@Serializable
data class SyncCollectionPage<Row>(
    val added: List<Row> = emptyList(),
    val modified: List<Row> = emptyList(),
    val deleted: List<SyncTombstone> = emptyList(),
    /** L'ancre de la PAGE SUIVANTE, relayée verbatim en `cursor`. */
    val nextCursor: String? = null,
    /** La fenêtre a coupé cette collection (budget d'octets serveur) : la page est complète, la collection non. */
    val truncated: Boolean = false,
) {
    val rows: List<Row> get() = added + modified
}

/** Une disparition : seul `id` compte au client (pour une conversation, `id == conversationId`). */
@Serializable
data class SyncTombstone(
    val id: String,
    val conversationId: String? = null,
    val deletedAt: String? = null,
)

/**
 * Une conversation telle que `/sync` la SERT (`syncConversationSelect`) : ~21 colonnes, ni aperçu, ni
 * non-lus, ni préférences, ni rôle courant. Tous les champs sont nullables — c'est ce qui permet de
 * savoir ce qui a réellement été servi quand `?fields=` rétrécit la ligne.
 */
@Serializable
data class SyncConversationRow(
    val id: String,
    val identifier: String? = null,
    val type: String? = null,
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val communityId: String? = null,
    val isActive: Boolean? = null,
    val closedAt: String? = null,
    val memberCount: Int? = null,
    val lastMessageAt: String? = null,
    val defaultWriteRole: String? = null,
    val isAnnouncementChannel: Boolean? = null,
    val slowModeSeconds: Int? = null,
    val encryptionMode: String? = null,
    val encryptionProtocol: String? = null,
    val autoTranslateEnabled: Boolean? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    /** L'AUTRE participant d'un direct seulement (jamais le roster), sans aucune présence. */
    val participants: List<SyncPeerRow> = emptyList(),
)

@Serializable
data class SyncPeerRow(
    val id: String,
    val userId: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val user: SyncPeerUser? = null,
)

@Serializable
data class SyncPeerUser(
    val id: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
)
