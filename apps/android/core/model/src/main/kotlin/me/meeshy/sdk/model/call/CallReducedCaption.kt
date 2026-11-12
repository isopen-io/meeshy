package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.frames.CallFrameTextsRule

/**
 * P18.10 (`docs/product/appels-vue-finale.md`) — what the reduced call says of itself while I share my screen:
 * « name · duration ». Mirrors iOS `CallReducedRule`; the banner only draws what this law decides.
 */
object CallReducedCaption {
    private const val SEPARATOR = " · "

    /**
     * The name heading the caption, the same names as the header capsule ([CallHeaderNames]): the group name in a group,
     * otherwise the name I gave the person, otherwise their display name.
     */
    fun title(givenName: String?, groupName: String?, displayName: String?): String? =
        CallFrameTextsRule.meaningful(groupName)
            ?: CallFrameTextsRule.meaningful(givenName)
            ?: CallFrameTextsRule.meaningful(displayName)

    /** « name · duration »; without a known name, the duration alone. */
    fun caption(title: String?, duration: String): String {
        val name = CallFrameTextsRule.meaningful(title) ?: return duration
        return "$name$SEPARATOR$duration"
    }
}
