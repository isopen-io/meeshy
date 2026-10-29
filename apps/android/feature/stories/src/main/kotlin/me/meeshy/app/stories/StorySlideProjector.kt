package me.meeshy.app.stories

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.SceneObjectNumbers
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * LA projection d'une publication en scène jouable : fond, médias posés, textes, stickers, sons, filtres.
 * Le lecteur de stories et le lecteur de réels l'appellent tous deux, si bien qu'une même charge
 * se peint à l'identique dans l'un et l'autre (iOS : un seul `MeeshyScenePlayer`).
 */
class StorySlideProjector(private val apiBaseUrl: String?) {

    fun project(
        item: StoryItem,
        accentHex: String,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): StorySlideView = item.toSlideView(accentHex, prefs)

    private fun StoryItem.toSlideView(
        accentHex: String,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): StorySlideView {
        val resolved = StoryContentResolver.resolve(this, prefs)
        val background = resolveBackgroundMedia()
        val clipTransitions = storyEffects?.clipTransitions.orEmpty()
        val foreground = storyEffects?.mediaObjects.orEmpty()
            .filterNot { it.isBackground }
            .mapNotNull { it.toForegroundMediaView(clipTransitions, media) }
            .let(SceneObjectNumbers::capped)
        val preferredLanguages = LanguageResolver.preferredContentLanguages(prefs)
        val textObjects = SceneObjectNumbers.capped(storyEffects?.textObjects.orEmpty())
            .map { StoryTextObjectProjection.project(it, preferredLanguages) }
        // UNE lecture par piste, deux faits chacune (#5129).
        val backgroundTrack = resolveAudioTrack(preferBackground = true)
        val foregroundTrack = resolveAudioTrack(preferBackground = false)
        return StorySlideView(
            id = id,
            text = resolved.content,
            isTranslated = resolved.isTranslated,
            imageUrl = background.imageUrl,
            accentHex = accentHex,
            reactionCount = reactionCount,
            languageCode = resolved.languageCode,
            backgroundVideoUrl = background.videoUrl,
            backgroundVideoWindow = background.window,
            backgroundLoop = background.loop,
            backgroundTransform = background.transform,
            backgroundThumbHash = StorySlidePlaceholder.resolve(this)
                ?: StorySlidePlaceholder.resolve(effectsThumbHash = null, backgroundImageThumbHash = background.posterThumbHash),
            backgroundPosterUrl = background.posterUrl,
            foregroundMedia = foreground,
            textObjects = textObjects,
            backgroundAudioUrl = backgroundTrack?.url,
            backgroundAudioWindow = backgroundTrack?.window,
            foregroundAudioUrl = foregroundTrack?.url,
            foregroundAudioWindow = foregroundTrack?.window,
            autoAdvanceMillis = StorySlideDuration.computeMillis(storyEffects),
            background = storyEffects?.background
                ?.takeIf { it.isNotBlank() }
                ?.let { StoryBackgroundValue.parse(it) },
            repostAttribution = StoryRepostAttribution.resolve(this),
            // Un dessin compte légitimement des centaines de traits : seule leur épaisseur est bornée.
            strokes = storyEffects?.drawingStrokes.orEmpty()
                .map { it.copy(width = SceneObjectNumbers.strokeWidth(it.width)) },
            lookRecipe = SceneLookRecipe.forEffects(storyEffects),
            stickers = StorySceneObjectsProjection.stickers(storyEffects) { mediaId ->
                media.firstOrNull { it.id == mediaId }?.url?.let { resolveMediaUrl(it, apiBaseUrl) }
            },
            audioChips = StorySceneObjectsProjection.audioChips(storyEffects),
            isViewed = isViewed,
            createdAtMillis = isoToEpochMillis(createdAt).takeIf { it > 0L },
        )
    }

    private data class BackgroundMedia(
        val imageUrl: String?,
        val videoUrl: String?,
        val loop: Boolean,
        val transform: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform.IDENTITY,
        /** Fenêtre de lecture d'un fond VIDÉO (#5129) ; une image n'en a pas. */
        val window: StorySourceWindowMs? = null,
        /** L'affiche d'un fond VIDÉO : la vignette du serveur, son ThumbHash à défaut (la scène au repos n'a pas de lecteur). */
        val posterUrl: String? = null,
        val posterThumbHash: String? = null,
    )

    /**
     * Resolves the slide's single background layer. `storyEffects.mediaObjects`
     * (the modern, RAW-publish wire shape) is authoritative when present: the
     * object flagged `isBackground` is read at its own `mediaURL`, else at the
     * story piece its `postMediaId` names (#13605 : un fond publié depuis la file
     * hors ligne n'a pas d'adresse, seulement l'identifiant que la greffe lui a
     * donné — iOS et le web le lisent de même). An object that names a piece the
     * story does not carry never lends its framing, loop or window to another one.
     * Legacy stories without `storyEffects.mediaObjects` fall back to the flat list,
     * preferring a VIDEO item over an IMAGE one — critically, a video's own
     * `.url` is only ever assigned to [BackgroundMedia.videoUrl], never to
     * [BackgroundMedia.imageUrl] (the historical bug: Coil can't decode a video
     * file as an image, so the slide painted nothing and no video ever played).
     */
    private fun StoryItem.resolveBackgroundMedia(): BackgroundMedia {
        val backgroundObject = storyEffects?.mediaObjects?.firstOrNull { it.isBackground }
        val designatedId = backgroundObject?.postMediaId?.takeIf { it.isNotBlank() }
        val ownUrl = backgroundObject?.mediaURL ?: designatedId?.let { id -> media.firstOrNull { it.id == id }?.url }
        val governing = backgroundObject?.takeIf { ownUrl != null || designatedId == null }
        val designatedPieces = canvasDesignatedPieceIds()
        val undesignated = media.filterNot { it.id in designatedPieces }
        val fallbackMedia = undesignated.firstOrNull { it.type == FeedMediaType.VIDEO }
            ?: undesignated.firstOrNull { it.type == FeedMediaType.IMAGE && it.url != null }

        val isVideo = governing?.let { it.mediaType == "video" } ?: (fallbackMedia?.type == FeedMediaType.VIDEO)
        val resolvedUrl = (ownUrl ?: fallbackMedia?.url)?.let { resolveMediaUrl(it, apiBaseUrl) }

        if (isVideo) {
            // La pièce qui porte la vidéo de fond : celle que l'objet désigne (ou dont il porte l'adresse), sinon le repli plat.
            val piece = if (governing == null) fallbackMedia else {
                designatedId?.let { id -> media.firstOrNull { it.id == id } }
                    ?: ownUrl?.let { url -> media.firstOrNull { it.url == url } }
            }
            // The framing rides only on a modern `isBackground` object whose OWN
            // address (its mediaURL, or the piece it names) produced the resolved url;
            // a legacy/flat fallback video never carries one, so it stays a plain
            // aspect-fill (IDENTITY). The viewer applies the projection to the player
            // surface via `graphicsLayer`, the exact mirror of the image branch.
            val videoTransform = governing
                ?.takeIf { ownUrl != null && resolvedUrl != null }
                ?.let { StoryBackgroundObjectTransform.from(it) }
                ?: StoryBackgroundObjectTransform.IDENTITY
            return BackgroundMedia(
                imageUrl = null,
                videoUrl = resolvedUrl,
                loop = governing?.loop ?: true,
                transform = videoTransform,
                // La fenêtre ne vient QUE d'un objet moderne : un fond hérité
                // (plat, sans objet) n'a jamais porté de bornes, et lui en
                // fabriquer une serait inventer une coupe.
                window = StorySourceWindow.clippingMs(
                    governing?.sourceStart, governing?.sourceEnd,
                ),
                posterUrl = piece?.thumbnailUrl?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(it, apiBaseUrl) },
                posterThumbHash = piece?.thumbHash,
            )
        }
        val imageUrl = resolvedUrl
            ?: undesignated.firstOrNull { it.thumbnailUrl != null }?.thumbnailUrl?.let { resolveMediaUrl(it, apiBaseUrl) }
        // The framing rides only on a modern `isBackground` object; a legacy/flat
        // fallback image never carries one, so it stays a plain aspect-fill (IDENTITY).
        val transform = governing
            ?.takeIf { imageUrl == resolvedUrl && resolvedUrl != null }
            ?.let { StoryBackgroundObjectTransform.from(it) }
            ?: StoryBackgroundObjectTransform.IDENTITY
        return BackgroundMedia(imageUrl = imageUrl, videoUrl = null, loop = true, transform = transform)
    }

    /**
     * Les pièces que le canevas désigne (médias posés, fond, sons et leurs variantes) — jamais un fond statique de
     * repli, comme `StoryItem.toRenderableSlide` sur iOS : une story faite des seuls médias posés n'a pas de photo de
     * fond, et la pièce posée ne se peint pas deux fois. Sans `mediaObjects`, rien n'est désigné (forme héritée).
     */
    private fun StoryItem.canvasDesignatedPieceIds(): Set<String> {
        val objects = storyEffects?.mediaObjects.orEmpty()
        if (objects.isEmpty()) return emptySet()
        val sounds = storyEffects?.audioPlayerObjects.orEmpty()
        return (
            objects.map { it.postMediaId } +
                sounds.map { it.postMediaId } +
                sounds.flatMap { sound -> sound.backgroundAudioVariants.orEmpty().map { it.postMediaId } }
            ).filterTo(mutableSetOf()) { it.isNotBlank() }
    }

    /**
     * Un média posé se lit à sa propre adresse, sinon à la pièce que son `postMediaId` désigne — un média publié
     * depuis la file hors ligne n'a que l'identifiant que la greffe lui a donné (#13630, comme le fond #13605). Son
     * ratio non mesuré se reprend des dimensions de cette pièce, comme iOS l'hydrate à la lecture.
     */
    private fun StoryMediaObject.toForegroundMediaView(
        clipTransitions: List<StoryClipTransition>,
        pieces: List<FeedMedia>,
    ): StoryForegroundMediaView? {
        val piece = postMediaId.takeIf { it.isNotBlank() }?.let { id -> pieces.firstOrNull { it.id == id } }
        val url = (mediaURL ?: piece?.url)?.let { resolveMediaUrl(it, apiBaseUrl) } ?: return null
        return StoryForegroundMediaView(
            id = id,
            url = url,
            isVideo = mediaType == "video",
            x = x,
            y = y,
            scale = scale,
            rotation = rotation,
            aspectRatio = aspectRatio ?: ForegroundMediaFrame.measuredAspectRatio(piece?.width, piece?.height) ?: servedAspectRatio,
            startTime = startTime ?: 0.0,
            duration = duration ?: 0.0,
            fadeIn = fadeIn ?: 0.0,
            fadeOut = fadeOut ?: 0.0,
            keyframes = keyframes.orEmpty(),
            clipTransitions = clipTransitions,
            sourceWindow = StorySourceWindow.clippingMs(sourceStart, sourceEnd),
            lookRecipe = SceneLookRecipe.forMedia(this),
            posterUrl = piece?.thumbnailUrl?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(it, apiBaseUrl) },
            thumbHash = piece?.thumbHash,
        ).bounded()
    }

    /**
     * Resolves the URL of the slide's background (voice/library/effects track)
     * or foreground (non-background) audio, per [preferBackground].
     * `storyEffects.audioPlayerObjects` only carry a `postMediaId`, so the
     * playable URL is cross-referenced from the flat `media[]` list by id. When
     * no `audioPlayerObjects` exist at all, the background slot falls back to
     * the story's direct `audioUrl` (voice attachment) then its library
     * `backgroundAudio` entry — both already resolved URLs, no lookup needed.
     */
    /**
     * L'URL d'une piste ET sa fenêtre de lecture, résolues d'UNE SEULE lecture
     * (#5129).
     *
     * **Deux fonctions auraient dû s'accorder sur l'objet élu**, et rien ne
     * l'aurait garanti : `firstOrNull` sur une liste dont l'ordre n'est pas
     * contractuel peut rendre deux objets différents à deux appels si la liste
     * change entre-temps. Un seul parcours, deux faits.
     *
     * La fenêtre ne vient QUE de l'objet moderne : les replis hérités
     * (`audioUrl`, `backgroundAudio.fileUrl`) n'ont jamais porté de bornes.
     */
    private fun StoryItem.resolveAudioTrack(preferBackground: Boolean): AudioTrack? {
        val match = storyEffects?.audioPlayerObjects.orEmpty()
            .firstOrNull { (it.isBackground == true) == preferBackground }
        // Un son EMPRUNTÉ à la bibliothèque n'a aucun média de post (`postMediaId` vide) : il voyage par son
        // `mediaURL` (#13428), comme iOS (`StoryAudioSourceResolver`) et le web le lisent — mais cette adresse est
        // écrite par l'AUTEUR : seule la forme canonique d'un son de la bibliothèque est jouée.
        val fromObject = match?.postMediaId
            ?.let { mediaId -> media.firstOrNull { it.id == mediaId }?.url }
            ?.let { resolveMediaUrl(it, apiBaseUrl) }
            ?: MediaRequestCredential.libraryAudioUrl(match?.mediaURL, apiBaseUrl)
        if (fromObject != null) {
            return AudioTrack(
                url = fromObject,
                window = StorySourceWindow.clippingMs(match?.sourceStart, match?.sourceEnd),
            )
        }
        if (!preferBackground) return null
        val legacy = audioUrl?.let { resolveMediaUrl(it, apiBaseUrl) }
            ?: backgroundAudio?.fileUrl?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(it, apiBaseUrl) }
        return legacy?.let { AudioTrack(url = it, window = null) }
    }

    private data class AudioTrack(val url: String, val window: StorySourceWindowMs?)
}

/** Aucune préférence de langue : le lecteur n'est pas connu, la scène se sert dans sa langue d'origine. */
object NoContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
