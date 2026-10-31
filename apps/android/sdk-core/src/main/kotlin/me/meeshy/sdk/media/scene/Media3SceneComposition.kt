package me.meeshy.sdk.media.scene

import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.Util
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import com.google.common.collect.ImmutableList
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import java.io.File

/**
 * **Ce que Media3 reçoit d'un export** : le plan pur ([SceneCompositionPlanner]) traduit en [Composition] — la séquence
 * vidéo des slides, une séquence par son, les calques des objets et les cartes de marque. À part du moteur pour que la
 * composition RÉELLE se vérifie contre les exigences de Media3 sans encodeur.
 *
 * **Les calques voyagent sur CHAQUE item, jamais sur la composition** (#13986) : Media3 1.4.1 n'applique, des effets de
 * la composition, que sa `Presentation` (`TransformerSingleInputVideoGraph`) — un `OverlayEffect` posé là était ignoré
 * sans un mot, et l'export rendait les fonds noirs des slides sans leurs calques peints : un fichier tout noir. Un item
 * voit ses images à l'heure de la séquence (`FrameInfo.offsetToAddUs`), l'horloge commune des calques ; et la MÊME liste
 * d'effets sur chaque item garde la chaîne GL configurée une fois (`DefaultVideoFrameProcessor` ne la refait que si les
 * effets changent), d'une image à une vidéo comme d'une slide à l'autre.
 *
 * **Une vidéo posée est un calque de cette même liste** (#13897), à sa place dans la pile : Media3 1.4.1 ne compose pas
 * plusieurs séquences vidéo sous Transformer sans le graphe expérimental à plusieurs entrées, alors qu'un calque daté passe
 * par la chaîne que le S8 rend déjà — il lit l'image de la source à l'instant que l'horloge de la vidéo désigne.
 */
internal object Media3SceneComposition {

    fun of(
        job: SceneExportJob,
        planned: SceneComposition = SceneCompositionPlanner.of(job),
        frames: (SceneExportPlacedVideo) -> PlacedVideoFrames = { RetrieverVideoFrames(it.file) },
    ): Composition {
        val frame = frameEffects(job.format, overlaysOf(job, planned, frames))
        val video = EditedMediaItemSequence(planned.video.map { videoItem(it, job.format, frame) })
        val sounds = planned.audio.map { sequence -> EditedMediaItemSequence(sequence.map(::audioItem)) }
        return Composition.Builder(listOf(video) + sounds).build()
    }

    /**
     * Les calques de la vidéo, du plus bas au plus haut : à chaque profondeur, les objets à leur instant puis les vidéos
     * posées au-dessus d'eux ; enfin les cartes de marque qui se fondent.
     */
    fun overlaysOf(
        job: SceneExportJob,
        planned: SceneComposition,
        frames: (SceneExportPlacedVideo) -> PlacedVideoFrames = { RetrieverVideoFrames(it.file) },
    ): List<TextureOverlay> {
        val deepest = (job.overlays.map { it.depth } + job.placedVideos.map { it.depth }).maxOrNull() ?: 0
        val stack = (0..deepest).flatMap { depth ->
            val layers = job.overlays.filter { it.depth == depth }
            listOfNotNull<TextureOverlay>(layers.takeIf { it.isNotEmpty() }?.let { TimedBitmapOverlay(it, gaps = depth > 0) }) +
                job.placedVideos.filter { it.depth == depth }.map { PlacedVideoOverlay(it, job.format, frames) }
        }
        return stack + planned.brandLayers.map { BrandCardOverlay(it.file, it.alphaAt) }
    }

    /** Le cadrage au format, puis les calques : UNE instance partagée par tous les items. */
    private fun frameEffects(format: StoryExportVideoFormat, overlays: List<TextureOverlay>): Effects {
        val fit = Presentation.createForWidthAndHeight(format.width, format.height, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)
        val layers = overlays.takeIf { it.isNotEmpty() }?.let { OverlayEffect(ImmutableList.copyOf(it)) }
        return Effects(emptyList(), listOfNotNull<Effect>(fit, layers))
    }

    /**
     * Une plage d'une vidéo de fond (sans son : sa piste, quand elle joue, est une séquence audio du plan), ou une image tenue.
     * Une image porte sa durée sur l'[EditedMediaItem] (`setDurationUs`) et sa cadence : Media3 1.4.1 ne lit pas
     * `MediaItem.imageDurationMs` et son `ImageAssetLoader` refuse une image sans l'une ou l'autre (#13986).
     */
    private fun videoItem(item: SceneVideoItem, format: StoryExportVideoFormat, frame: Effects): EditedMediaItem {
        val clip = item.clip
        if (clip == null) {
            val millis = checkNotNull(item.imageMillis) { "image tenue sans durée : ${item.file.name}" }
            return EditedMediaItem.Builder(MediaItem.Builder().setUri(Uri.fromFile(item.file)).setImageDurationMs(millis).build())
                .setDurationUs(Util.msToUs(millis))
                .setFrameRate(format.fps)
                .setEffects(frame)
                .build()
        }
        return EditedMediaItem.Builder(clipped(item.file, clip))
            .setRemoveAudio(true)
            .setEffects(frame)
            .build()
    }

    private fun audioItem(item: SceneAudioItem): EditedMediaItem {
        val processors = buildList<AudioProcessor> {
            if (item.leadMillis > 0) add(LeadingSilenceAudioProcessor(item.leadMillis))
            if (item.gain != 1f || item.envelope.isNotEmpty()) add(EnvelopeGainAudioProcessor(item.gain, item.envelope, item.originMillis))
        }
        return EditedMediaItem.Builder(clipped(item.file, item.clip))
            .setRemoveVideo(true)
            .setEffects(Effects(processors, emptyList()))
            .build()
    }

    private fun clipped(file: File, clip: StoryExportClipRange): MediaItem =
        MediaItem.Builder()
            .setUri(Uri.fromFile(file))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(clip.startMillis)
                    .setEndPositionMs(clip.endMillis)
                    .build(),
            )
            .build()
}
