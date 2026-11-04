package me.meeshy.sdk.model.fullscreen

public data class AudioReplyCitation(val author: String, val durationLabel: String?) {
    public companion object {
        public fun of(authorName: String?, durationMs: Long): AudioReplyCitation = AudioReplyCitation("", null)
    }
}
