package me.meeshy.sdk.model.call

/**
 * P18.10 (`docs/product/appels-vue-finale.md`) — what the reduced call says of itself while I share my screen:
 * « name · duration ». Mirrors iOS `CallReducedRule.caption`; the banner only draws what this law decides.
 */
object CallReducedCaption {
    private const val SEPARATOR = " · "

    /** « name · duration »; without a known name, the duration alone. */
    fun caption(title: String?, duration: String): String {
        val name = title?.trim()?.takeIf { it.isNotEmpty() } ?: return duration
        return "$name$SEPARATOR$duration"
    }
}
