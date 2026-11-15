package me.meeshy.sdk.model.call

/** Les textes qu'un participant partage avec le cadre : son prénom, sa ville s'il l'autorise. */
data class CallLiveFrameTexts(
    val name: String? = null,
    val city: String? = null,
) {
    /** La forme envoyée : seuls les textes non vides, rognés puis bornés comme la passerelle les borne. */
    fun payload(): Map<String, String> =
        listOf("name" to name, "city" to city).mapNotNull { (key, value) ->
            value?.trim()?.take(MAX_LENGTH)?.takeIf { it.isNotEmpty() }?.let { key to it }
        }.toMap()

    companion object {
        const val MAX_LENGTH = 64
    }
}

/** La réponse à une proposition : le cadre ne s'impose jamais à l'autre. */
enum class CallLiveFrameReply(val wire: String) {
    ACCEPTED("accepted"),
    DECLINED("declined"),
    ;

    companion object {
        fun fromWire(raw: String?): CallLiveFrameReply? = entries.firstOrNull { it.wire == raw }
    }
}

/** `call:frame-selected` — l'autre participant PROPOSE un cadre (ou le retire, `frameId == null`), ou répond. */
data class CallLiveFrameSelected(
    val callId: String,
    val userId: String,
    val frameId: String?,
    val texts: CallLiveFrameTexts? = null,
    val reply: CallLiveFrameReply? = null,
)
