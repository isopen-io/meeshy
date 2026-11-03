package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.SyncWatermark
import me.meeshy.sdk.model.WatermarkCandidate
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Le repère de rattrapage d'une fenêtre locale : le plus récent `createdAt` d'ORIGINE SERVEUR. Un message
 * propre encore optimiste ([LocalSendState.SENDING]) ou en échec ([LocalSendState.FAILED]) porte l'horloge
 * de l'appareil et n'est jamais un repère ([SyncWatermark]).
 */
public fun List<LocalMessage>.syncWatermarkMillis(ownUserId: String?): Long? =
    SyncWatermark.newest(
        mapNotNull { local ->
            val at = isoToEpochMillisOrNull(local.message.createdAt) ?: return@mapNotNull null
            WatermarkCandidate(
                createdAtMillis = at,
                isOwn = ownUserId != null && local.message.senderId == ownUserId,
                isServerConfirmed = local.sendState == LocalSendState.SYNCED,
            )
        },
    )
