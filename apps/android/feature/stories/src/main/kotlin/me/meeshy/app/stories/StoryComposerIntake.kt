package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.media.MediaUploadProgress

/**
 * Le sticker image qui entre dans la scène (#15597, iOS `ComposerSceneIntake(kind: .sticker)`) : tant que ses octets
 * s'envoient il retient l'écran ; [failed] quand l'envoi n'a pas abouti — l'écran est libre, « Réessayer » le renvoie.
 */
@Immutable
data class StickerIntake(val stickerId: String, val failed: Boolean = false)

/**
 * Ce qui retient l'écran (R5 de #13863) : la PRÉPARATION d'un média sur l'appareil, ou l'arrivée d'un sticker image. Un
 * média posé qui s'envoie en arrière-plan ne retient rien (#15598, iOS `ComposerSceneIntake.blocksComposer`).
 */
internal val StoryComposerUiState.intakeBlocks: Boolean
    get() = isPreparingMedia || stickerIntake?.failed == false

/** Un sticker dont l'envoi a échoué propose « Réessayer » (#15597). */
val StoryComposerUiState.canRetrySticker: Boolean get() = stickerIntake?.failed == true

/** La part envoyée de [id] (un média en file, une piste de son), `null` hors envoi ou tant que rien n'est parti. */
internal fun StoryComposerUiState.sendingFraction(id: String): Float? =
    (uploadProgress[id] as? MediaUploadProgress.Uploading)?.fraction?.toFloat()?.coerceIn(0f, 1f)

/** Un son posé dont l'envoi n'est pas reçu : la publication l'attend (#15598) — un son part avec son adresse servie. */
internal val StoryComposerUiState.awaitsSoundUpload: Boolean
    get() = deck.slides.any { slide -> slide.audio.any { it.id in uploadProgress || it.id in failedSounds } }

/** L'espace réservé d'un sticker image qui entre : à la place du sticker, à son échelle (#15597). */
@Immutable
internal data class IncomingStickerPlaceholder(
    val stickerId: String,
    val x: Float,
    val y: Float,
    val scale: Float,
)

/** L'espace réservé du sticker en cours d'ajout, ou `null` : aucun, ou il n'est plus sur la diapo choisie. */
internal fun StoryComposerUiState.incomingSticker(): IncomingStickerPlaceholder? {
    val intake = stickerIntake?.takeUnless { it.failed } ?: return null
    val sticker = deck.selectedSlide.stickers.firstOrNull { it.id == intake.stickerId } ?: return null
    return IncomingStickerPlaceholder(sticker.id, sticker.x, sticker.y, sticker.scale)
}
