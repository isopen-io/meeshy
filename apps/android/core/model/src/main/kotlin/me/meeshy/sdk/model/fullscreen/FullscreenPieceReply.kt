package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ApiMessage

public object FullscreenPieceReply {

    public data class Admission(val replyToId: String, val attachmentReplyToId: String, val text: String)

    public fun admit(text: String, carrier: ApiMessage?, pieceId: String, conversationIsEncrypted: Boolean): Admission? = null
}
