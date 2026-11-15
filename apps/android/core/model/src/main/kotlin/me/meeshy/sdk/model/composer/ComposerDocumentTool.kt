package me.meeshy.sdk.model.composer

/**
 * The canonical row of a post WITHOUT a scene (iOS `ComposerDocumentTool`, `ComposerDocumentSurface.toolRow`). The
 * document speaks of PATHS: photo library, camera and file are three ways of attaching a file to a text, so they are
 * three tools here — unlike the scene rail, whose single media door names what is placed, not where it comes from.
 *
 * [VIDEO] is the Android transposition of the iOS camera: the system camera serves photo and video through two
 * intents (`ACTION_IMAGE_CAPTURE` / `ACTION_VIDEO_CAPTURE`), not one capture screen with a mode switch.
 */
enum class ComposerDocumentTool {
    PHOTO, CAMERA, VIDEO, EMOJI, TEXT_SCENE, DOCUMENT, PLACE, MICROPHONE, MENTION;

    /** Does the tool attach a file, and so need a free media slot? A place or a mention qualifies the text instead. */
    val consumesMediaSlot: Boolean get() = this in mediaTools

    companion object {
        val canonicalRow: List<ComposerDocumentTool> =
            listOf(PHOTO, CAMERA, VIDEO, EMOJI, TEXT_SCENE, DOCUMENT, PLACE, MICROPHONE, MENTION)

        /** A tool the mounting site does not serve is ABSENT, never greyed (law 4); the canonical order is kept. */
        fun servedRow(served: Set<ComposerDocumentTool>): List<ComposerDocumentTool> = canonicalRow.filter { it in served }

        private val mediaTools = setOf(PHOTO, CAMERA, VIDEO, DOCUMENT, MICROPHONE)
    }
}
