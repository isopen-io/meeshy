package me.meeshy.sdk.media.scene

import android.net.Uri
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
 */
internal object Media3SceneComposition {

    fun of(job: SceneExportJob): Composition {
        val planned = SceneCompositionPlanner.of(job)
        val video = EditedMediaItemSequence(planned.video.map { videoItem(it, job.format) })
        val sounds = planned.audio.map { sequence -> EditedMediaItemSequence(sequence.map(::audioItem)) }
        val objects = job.overlays.takeIf { it.isNotEmpty() }?.let { TimedBitmapOverlay(it) }
        val overlays = listOfNotNull<TextureOverlay>(objects) + planned.brandLayers.map { BrandCardOverlay(it.file, it.alphaAt) }
        return Composition.Builder(listOf(video) + sounds)
            .apply { if (overlays.isNotEmpty()) setEffects(Effects(emptyList(), listOf(OverlayEffect(ImmutableList.copyOf(overlays))))) }
            .build()
    }

    /**
     * Une plage d'une vidéo de fond (sans son : sa piste, quand elle joue, est une séquence audio du plan), ou une image tenue.
     * Une image porte sa durée sur l'[EditedMediaItem] (`setDurationUs`) et sa cadence : Media3 1.4.1 ne lit pas
     * `MediaItem.imageDurationMs` et son `ImageAssetLoader` refuse une image sans l'une ou l'autre (#13986).
     */
    private fun videoItem(item: SceneVideoItem, format: StoryExportVideoFormat): EditedMediaItem {
        val fit = Effects(emptyList(), listOf(Presentation.createForWidthAndHeight(format.width, format.height, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)))
        val clip = item.clip
        if (clip == null) {
            val millis = checkNotNull(item.imageMillis) { "image tenue sans durée : ${item.file.name}" }
            return EditedMediaItem.Builder(MediaItem.Builder().setUri(Uri.fromFile(item.file)).setImageDurationMs(millis).build())
                .setDurationUs(Util.msToUs(millis))
                .setFrameRate(format.fps)
                .setEffects(fit)
                .build()
        }
        return EditedMediaItem.Builder(clipped(item.file, clip))
            .setRemoveAudio(true)
            .setEffects(fit)
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
