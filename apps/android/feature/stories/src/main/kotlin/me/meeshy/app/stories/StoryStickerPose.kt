package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.sdk.net.NetworkResult

/**
 * Un sticker IMAGE à poser (#13847) — Mee, un sticker de pack, une vignette de Mes stickers : il se pose comme iOS les
 * pose (`SceneStickerPose`), une image téléversée sous `postMediaId`, sa [provider] (`mee`, `pack`, `library`) et son
 * [emoji] de repli pour un lecteur qui ne charge pas l'image. [preview] est ce que le canevas montre pendant l'envoi ;
 * [produce] rend les octets à téléverser, `null` quand l'image est illisible.
 */
class StickerImagePose(
    val provider: String,
    val emoji: String,
    val preview: String,
    val produce: suspend () -> MediaUploadItem?,
) {
    internal fun awaiting(id: String): StoryStickerElement =
        StoryStickerElement(id = id, emoji = emoji, provider = provider, imageUrl = preview)
}

/** Les octets du sticker téléversés ; `null` pour une image illisible, un refus ou une panne — jamais une exception. */
internal suspend fun StoryMediaUploader.uploadSticker(pose: StickerImagePose): UploadedMedia? = try {
    pose.produce()?.let { item -> (upload(listOf(item)) as? NetworkResult.Success)?.data?.firstOrNull() }
} catch (e: CancellationException) {
    throw e
} catch (_: Throwable) {
    null
}

/**
 * Le sort des images de sticker envoyées (#13847). Poser une image est UN cran d'annulation, pris à la pose ; son arrivée
 * ne crée pas de cran : elle se rejoue sur tout état que l'annulation ramène. Une image arrivée y reprend son média, une
 * image refusée n'y revient jamais — aucun sticker ne reste en attente d'un envoi qui n'a plus lieu.
 */
internal class StickerImageUploads {
    private val inFlight = mutableSetOf<String>()
    private val arrived = mutableMapOf<String, UploadedMedia>()

    fun started(id: String) {
        inFlight += id
    }

    fun settled(id: String, uploaded: UploadedMedia?) {
        inFlight -= id
        if (uploaded != null) arrived[id] = uploaded
    }

    fun reconciled(state: StoryComposerUiState): StoryComposerUiState =
        state.deck.slides.flatMap { it.stickers }
            .filter { it.isAwaitingImage && it.id !in inFlight }
            .fold(state) { acc, sticker ->
                arrived[sticker.id]?.let { StoryComposerStickerReducer.imageSettled(acc, sticker.id, it) }
                    ?: StoryComposerStickerReducer.removed(acc, sticker.id)
            }
}

/** Un sticker à GABARIT : son emoji de repli et son mouvement viennent du catalogue ; hors catalogue, rien ne se pose. */
internal object StickerTemplatePose {
    fun element(templateId: String, slots: Map<String, String>, id: String): StoryStickerElement? {
        val template = StickerTemplateCatalog.template(templateId) ?: return null
        return StoryStickerElement(
            id = id,
            emoji = template.fallbackEmoji,
            templateId = template.id,
            slots = slots,
            animation = template.animation?.wireName,
        )
    }
}
