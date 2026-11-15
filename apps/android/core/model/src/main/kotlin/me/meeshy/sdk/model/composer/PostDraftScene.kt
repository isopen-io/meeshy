package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftAnnotations
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.UploadedMedia

/**
 * Un brouillon du compositeur de post d'avant (#13863 § 3) se rouvre sur la scène SANS PERTE : son texte devient le texte
 * du post, chaque photo ou vidéo une diapo dont elle est le fond, un son la piste de la première diapo, un autre fichier
 * une pièce de la première diapo ; le fond, le lieu, les descriptions et l'audience suivent. Un post composé SUR la scène
 * et rouvert après un échec porte sa scène entière ([PostComposerDraftSnapshot.scene]) : elle revient telle quelle.
 */
object PostDraftScene {
    /**
     * La scène à ouvrir, et si le brouillon de post y est entré (il se vide alors, la scène le porte désormais). Un brouillon
     * de scène qui attend la confirmation de sa publication n'est jamais réécrit : le brouillon de post attend son tour.
     */
    data class Opening(val snapshot: StoryComposerDraftSnapshot?, val adoptsPostDraft: Boolean)

    /** Le plafond de diapos d'une scène (miroir de `StorySlideDeck.MAX_SLIDES`). */
    const val MAX_SLIDES: Int = 10

    fun opening(story: StoryComposerDraftSnapshot?, post: PostComposerDraftSnapshot?, slideId: (Int) -> String): Opening {
        if (post == null || !post.isWorthRestoring || story?.isAwaitingPublication == true) return Opening(story, adoptsPostDraft = false)
        val scene = scene(post, slideId)
        val kept = story?.takeIf { it.isWorthRestoring }
            ?: return Opening(scene, adoptsPostDraft = true)
        return Opening(merged(kept, scene), adoptsPostDraft = true)
    }

    fun scene(post: PostComposerDraftSnapshot, slideId: (Int) -> String): StoryComposerDraftSnapshot {
        post.scene?.takeIf { it.isStructurallyValid }?.let { composed ->
            return composed.copy(postText = post.text, visibility = post.visibility, awaitingPublication = emptyList())
        }
        val visuals = post.media.filter { it.isVisual }
        val sounds = post.media.filter { it.mimeType.lowercase().startsWith("audio/") }
        val files = post.media - visuals.toSet() - sounds.toSet()
        val slides = visuals.mapIndexed { index, item ->
            StoryDraftSlideSnapshot(id = slideId(index), mediaIds = listOf(item.id), backgroundMediaId = item.id)
        }.ifEmpty { listOf(StoryDraftSlideSnapshot(id = slideId(0))) }
        val first = slides.first().let { head ->
            head.copy(
                mediaIds = head.mediaIds + files.map { it.id },
                background = post.background,
                audio = sounds.map(::soundOf),
                places = listOfNotNull(post.location?.let { StoryLocationObject(id = "place-${head.id}", place = it) }),
            )
        }
        val kinds = post.media.map { ReelComposition.MediaKind(it.mimeType, it.durationMs) }
        return StoryComposerDraftSnapshot(
            slides = listOf(first) + slides.drop(1),
            selectedId = first.id,
            visibility = post.visibility,
            annotations = StoryDraftAnnotations(mediaAlt = post.mediaAlt, mediaCaption = post.mediaCaption),
            postText = post.text,
            format = ReelComposition.defaultType(kinds, post.forcePlainPost).name,
            media = post.media,
        )
    }

    private fun merged(story: StoryComposerDraftSnapshot, scene: StoryComposerDraftSnapshot): StoryComposerDraftSnapshot {
        val taken = story.slides.map { it.id }.toSet()
        val incoming = scene.slides.filter { it.hasContent || it.background != null }.filterNot { it.id in taken }
        val room = (MAX_SLIDES - story.slides.size).coerceAtLeast(0)
        val (fits, overflow) = incoming.take(room) to incoming.drop(room)
        val slides = (story.slides + fits).let { all ->
            if (overflow.isEmpty()) all else all.dropLast(1) + all.last().copy(mediaIds = all.last().mediaIds + overflow.flatMap { it.mediaIds })
        }
        return story.copy(
            slides = slides,
            annotations = story.annotations.copy(
                mediaAlt = story.annotations.mediaAlt + scene.annotations.mediaAlt,
                mediaCaption = story.annotations.mediaCaption + scene.annotations.mediaCaption,
            ),
            postText = listOf(story.postText, scene.postText).filter { it.isNotBlank() }.joinToString("\n\n"),
            format = story.format ?: scene.format,
            media = (story.media + scene.media).distinctBy { it.id },
        )
    }

    private fun soundOf(media: UploadedMedia) = StoryAudioPlayerObject(
        id = "sound-${media.id}",
        postMediaId = media.id,
        duration = media.durationMs?.let { it / MILLIS_PER_SECOND },
    )

    private val UploadedMedia.isVisual: Boolean
        get() = mimeType.lowercase().let { it.startsWith("image/") || it.startsWith("video/") }

    private const val MILLIS_PER_SECOND = 1000f
}
