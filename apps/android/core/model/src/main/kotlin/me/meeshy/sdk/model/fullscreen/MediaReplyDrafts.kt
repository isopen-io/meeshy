package me.meeshy.sdk.model.fullscreen

public data class MediaReplyDrafts(val byPiece: Map<String, String> = emptyMap()) {
    public fun draft(pieceId: String): String = ""

    public fun editing(pieceId: String, text: String): MediaReplyDrafts = this

    public fun sent(pieceId: String): MediaReplyDrafts = this
}
