package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ongoing.OutboxActivityItem
import me.meeshy.sdk.model.ongoing.OutboxActivityKind

/**
 * Ce que la notification d'envoi lit de la file (`OutboxActivityLaw`) : le TYPE de chaque ligne
 * et ses prérequis, jamais le `payload` — le texte d'un message ne quitte pas la base.
 * Un message qui dépend d'un autre envoi porte un média (le prérequis est son téléversement).
 */
public object OutboxActivityProjection {

    public fun project(rows: List<OutboxEntity>): List<OutboxActivityItem> = rows.mapNotNull(::item)

    private fun item(row: OutboxEntity): OutboxActivityItem? {
        val kind = row.kindEnum ?: return null
        val dependsOn = OutboxDependencyKey.decode(row.dependsOn).toSet()
        return OutboxActivityItem(
            id = row.cmid,
            kind = when (kind) {
                OutboxKind.PUBLISH_STORY -> OutboxActivityKind.Story
                OutboxKind.UPLOAD_MEDIA -> OutboxActivityKind.Media
                OutboxKind.SEND_MESSAGE ->
                    if (dependsOn.isEmpty()) OutboxActivityKind.Text else OutboxActivityKind.MessageWithMedia
                else -> OutboxActivityKind.Other
            },
            isTerminal = row.stateEnum == OutboxState.EXHAUSTED,
            dependsOnIds = dependsOn,
        )
    }
}
