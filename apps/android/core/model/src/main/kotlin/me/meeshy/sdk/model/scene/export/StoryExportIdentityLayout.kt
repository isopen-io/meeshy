package me.meeshy.sdk.model.scene.export

import kotlin.math.sqrt
import me.meeshy.sdk.model.PresenceState

/** Le point de présence posé sur l'avatar : centre et diamètre en pixels, liseré sombre d'épaisseur [ringWidth], teinte de l'état. */
public data class StoryExportPresenceDot(val centerX: Float, val centerY: Float, val diameter: Float, val ringWidth: Float, val state: PresenceState)

/**
 * **LA GÉOMÉTRIE DE LA CARTE D'IDENTITÉ D'UN EXPORT** (#13997 ; miroir de `StoryExportIntro.drawIdentity` iOS) en pixels du format
 * de la vidéo : l'avatar rond centré, le nom — suivi du logo de cercle, sur la même ligne et à la même taille de police —,
 * le @username, la capsule de mood. Pure : la peinture applique ces nombres, elle n'en décide aucun.
 *
 * Le point de présence se pose sur le bord bas-droit de l'avatar (à 45° sur le cercle), à 22 % de son diamètre, cerclé d'un
 * liseré sombre. Absent de la projection ⇒ aucun point.
 */
public data class StoryExportIdentityLayout(
    val avatarLeft: Float,
    val avatarTop: Float,
    val avatarSide: Float,
    val presenceDot: StoryExportPresenceDot?,
    /** Ce qui suit le nom sur sa ligne : ` 🔥`, ` 🩸`, ou rien — la peinture abrège le nom, jamais ce suffixe. */
    val nameSuffix: String,
    /** La ligne du nom : `Nom` ou `Nom 🔥` — le logo est collé à droite du nom, même police, même taille. */
    val nameLine: String,
    val nameTextSize: Float,
    val nameTop: Float,
    val handleText: String?,
    val handleTextSize: Float,
    val handleTop: Float,
    val moodCenterY: Float?,
    val moodEmojiSize: Float,
    val moodMessageSize: Float,
) {
    public companion object {
        public const val AVATAR_WIDTH_FRACTION: Float = 0.28f
        public const val PRESENCE_DOT_FRACTION: Float = 0.22f
        public const val PRESENCE_RING_FRACTION: Float = 0.12f
        private const val NAME_FRACTION = 0.058f
        private const val HANDLE_FRACTION = 0.036f
        private const val MOOD_EMOJI_FRACTION = 0.040f
        private const val MOOD_MESSAGE_FRACTION = 0.032f
        private const val AVATAR_TOP_OF_CENTER = 0.9f
        private const val HALF = 0.5f
        private val QUARTER_DIAGONAL: Float = (1f / sqrt(2.0)).toFloat()

        public fun of(identity: StoryExportIdentity, width: Float, height: Float): StoryExportIdentityLayout {
            val side = width * AVATAR_WIDTH_FRACTION
            val left = (width - side) / 2f
            val top = height * HALF - side * AVATAR_TOP_OF_CENTER
            val nameSize = width * NAME_FRACTION
            val handleSize = width * HANDLE_FRACTION
            val nameTop = top + side + nameSize * AVATAR_TOP_OF_CENTER
            val handleTop = nameTop + nameSize * 1.4f
            val suffix = identity.badge?.let { " $it" }.orEmpty()
            return StoryExportIdentityLayout(
                avatarLeft = left,
                avatarTop = top,
                avatarSide = side,
                presenceDot = identity.presence?.let { dot(it, left, top, side) },
                nameSuffix = suffix,
                nameLine = identity.displayName + suffix,
                nameTextSize = nameSize,
                nameTop = nameTop,
                handleText = "@${identity.username}".takeUnless { identity.username.isBlank() || identity.username.equals(identity.displayName, ignoreCase = true) },
                handleTextSize = handleSize,
                handleTop = handleTop,
                moodCenterY = (handleTop + handleSize * 2.6f).takeIf { !identity.moodEmoji.isNullOrBlank() },
                moodEmojiSize = width * MOOD_EMOJI_FRACTION,
                moodMessageSize = width * MOOD_MESSAGE_FRACTION,
            )
        }

        private fun dot(state: PresenceState, left: Float, top: Float, side: Float): StoryExportPresenceDot {
            val radius = side / 2f
            val diameter = side * PRESENCE_DOT_FRACTION
            return StoryExportPresenceDot(
                centerX = left + radius + radius * QUARTER_DIAGONAL,
                centerY = top + radius + radius * QUARTER_DIAGONAL,
                diameter = diameter,
                ringWidth = diameter * PRESENCE_RING_FRACTION,
                state = state,
            )
        }
    }
}
