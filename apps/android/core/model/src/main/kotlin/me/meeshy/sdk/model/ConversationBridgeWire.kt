package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import me.meeshy.sdk.model.serialization.TolerantSerializer

/** Le pont d'une ligne : malformé, il vaut `null` — la ligne se décode quand même, sans pont. */
internal object TolerantConversationBridgeSerializer :
    KSerializer<ConversationBridge?> by TolerantSerializer(ConversationBridge.serializer())
