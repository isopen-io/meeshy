package me.meeshy.sdk.conversation

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi

/**
 * La greffe d'un fan-out de partage : le message d'une cible 2..N porte, en `copyAttachmentsFromMessageId`, le
 * `clientMessageId` de l'origine (son id serveur n'existe pas encore) ; à l'accusé de l'origine, le drainer le remplace
 * par l'id réel. Jumelle de [MessageMediaWriteBack] pour un autre champ : `null` quand rien ne change (charge illisible,
 * autre champ, autre placeholder), pour que le combinateur passe à la greffe suivante.
 */
public object ShareFanoutWriteBack {
    public fun graft(payload: String, placeholder: String, realId: String): String? {
        val request = runCatching { MeeshyApi.json.decodeFromString<SendMessageRequest>(payload) }.getOrNull() ?: return null
        if (request.copyAttachmentsFromMessageId != placeholder || placeholder == realId) return null
        return MeeshyApi.json.encodeToString(request.copy(copyAttachmentsFromMessageId = realId))
    }
}
