package me.meeshy.sdk.model.composer

/** What the author has composed, independent of the format it is currently shaped as. */
data class ComposerWorkingState(
    val format: ComposerFormat,
    val text: String = "",
    val sceneIds: List<String> = emptyList(),
    val mediaIds: List<String> = emptyList(),
    val audience: String? = null,
)

/** Pure format switch: only the format changes, never text, scenes, media or audience. */
object ComposerFormatSwitch {
    fun switchTo(state: ComposerWorkingState, format: ComposerFormat, profile: ComposerProfile): ComposerWorkingState =
        if (format in profile.offeredFormats) state.copy(format = format) else state
}
