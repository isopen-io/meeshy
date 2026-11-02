package me.meeshy.app.stories

import java.time.Instant
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerMosaicChoice
import me.meeshy.sdk.model.composer.ComposerPostTextPolicy
import me.meeshy.sdk.model.composer.ComposerSceneReferences
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.PostDraftScene
import me.meeshy.sdk.model.composer.ScenePostDocument
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.publication.PublicationOutbox

/**
 * Le post et le réel composés sur la scène (#13863 R3) : UNE publication, par le chemin du fil
 * (`PublicationOutbox.enqueuePost`). Un post qui ne porte que son texte part comme le post texte d'avant ; avec une scène,
 * il porte son document v3. Rien de neuf ne part vers le serveur.
 */
internal object ScenePostRequest {
    fun of(state: StoryComposerUiState, plans: List<PublishPlan>, language: String): CreatePostRequest {
        val draft = state.draft
        val mediaIds = plans.flatMap { it.request.mediaIds.orEmpty() }.distinct()
        val mentions = ComposerSceneReferences.declaredFor(draft.mentions, state.deck.slides.flatMap { it.badges })
        return CreatePostRequest(
            content = state.postText.ifBlank { null },
            type = state.format.postType.name,
            visibility = draft.visibility.wire,
            mediaIds = mediaIds.ifEmpty { null },
            originalLanguage = language,
            mobileTranscription = plans.firstNotNullOfOrNull { it.request.mobileTranscription },
            mediaAlt = MediaDescriptionLaw.wire(draft.mediaAlt, mediaIds),
            visibilityUserIds = ComposerAudienceSelection.wireUserIds(draft.visibility, draft.visibilityUserIds),
            storyEffects = ScenePostDocument.effects(plans.map { it.request.storyEffects }, state.postLayout, state.format),
            allowSoundExtraction = draft.allowSoundExtraction,
            mentions = mentions.ifEmpty { null },
            mediaCaption = MediaDescriptionLaw.wire(draft.mediaCaption, mediaIds),
            repostOfId = draft.repostOfId,
        )
    }

    /**
     * Ce que « Rouvrir » rend d'un post qui n'est pas parti : son texte, sa scène ENTIÈRE (textes, stickers, médias posés,
     * sons, dessin, look), ses médias et leurs descriptions. Les médias suivent l'ordre de la requête, pièce pour pièce : c'est
     * par cet ordre que la file leur rend les identifiants servis, dans la scène comme dans la liste.
     */
    fun parked(state: StoryComposerUiState, request: CreatePostRequest, nowIso: String): PostComposerDraftSnapshot {
        val known = state.sceneMedia().associateBy { it.id }
        return PostComposerDraftSnapshot(
            text = state.postText,
            visibility = request.visibility,
            media = request.mediaIds.orEmpty().map { id -> known[id] ?: UploadedMedia(id, "", "", 0L, null, null, null, null) },
            language = request.originalLanguage,
            mediaAlt = request.mediaAlt.orEmpty(),
            mediaCaption = request.mediaCaption.orEmpty(),
            scene = state.deck.toDraftSnapshot(
                visibility = state.draft.visibility,
                repostOfId = state.draft.repostOfId,
                nowIso = nowIso,
                visibilityUserIds = state.draft.visibilityUserIds,
                annotations = state.draft.annotations(),
                format = state.formatDraft(),
            ),
        )
    }
}

/** Le post part par le chemin du fil, avec ce que « Rouvrir » lui rendra s'il ne part pas. */
internal suspend fun PublicationOutbox.enqueueScene(state: StoryComposerUiState, plans: List<PublishPlan>, language: String): String {
    val request = ScenePostRequest.of(state, plans, language)
    return enqueuePost(request, ScenePostRequest.parked(state, request, Instant.now().toString()))
}

/** Une diapo qui fait une scène du post : un objet, un média, un son, un lieu ou un fond — jamais sa seule légende. */
internal val StorySlide.composesPostScene: Boolean
    get() = mediaIds.isNotEmpty() || elements.any { it.isPublishable } || stickers.any { it.isPublishable } || strokes.isNotEmpty() ||
        audio.isNotEmpty() || places.isNotEmpty() || background != null || backgroundMediaId != null

/** Les diapos que le post publie, dans l'ordre : ses scènes. */
internal val StoryComposerUiState.postSceneSlides: List<StorySlide>
    get() = deck.slides.filter { it.composesPostScene }

/**
 * Les scènes que le post publie, chacune avec son FOND (#13921, miroir du document qu'iOS publie, `post-photo-scenes-2`) :
 * là où la disposition voyage, le média que le plateau peint en fond d'une scène part comme son fond désigné. Sans cela, une
 * scène faite d'une seule photo ne porte aucun objet, le post repart en galerie et la disposition choisie se perd.
 */
internal fun StoryComposerUiState.postScenesWithBackdrops(): List<StorySlide> {
    val slides = postSceneSlides
    if (ComposerMosaicChoice.offered(slides.size, format).isEmpty()) return slides
    return slides.map { slide -> StoryPublishBackground.designated(slide, this) }
}

/** Une scène vierge, dans le format que l'hôte compose : abandonner ou publier ne change pas de format. */
internal fun StoryComposerUiState.blankKeepingFormat(): StoryComposerUiState =
    StoryComposerUiState(format = format, checkedFormats = checkedFormats, postLayout = postLayout)

/** Les médias de la scène, téléversés ou encore en attente (sous leur `cmid`), dans l'ordre des diapos. */
internal fun StoryComposerUiState.sceneMedia(): List<UploadedMedia> {
    val onDeck = deck.slides.flatMap { it.mediaIds + listOfNotNull(it.backgroundMediaId) }.distinct()
    return onDeck.mapNotNull { id ->
        attachments.firstOrNull { it.id == id }
            ?: pendingUploads.firstOrNull { it.cmid == id }?.let { UploadedMedia(id, "", it.item.mimeType, 0L, null, null, it.item.durationMs, null) }
    }
}

/** Ce qui qualifie un réel : les médias de la scène et les sons qu'elle emprunte, avec leur durée. */
internal fun StoryComposerUiState.sceneMediaKinds(): List<ReelComposition.MediaKind> =
    sceneMedia().map { ReelComposition.MediaKind(it.mimeType, it.durationMs) } +
        deck.slides.flatMap { it.audio }.filter { it.postMediaId.isBlank() }
            .map { ReelComposition.MediaKind(BORROWED_SOUND_MIME, it.duration?.let { seconds -> (seconds * MILLIS).toLong() }) }

private const val BORROWED_SOUND_MIME = "audio/mpeg"
private const val MILLIS = 1000f

/** Ce que l'hôte pose sur la scène : le format, la disposition armée, et le texte du post qu'on écrit. */
internal object StoryComposerFormatReducer {
    /** Les formats cochés que l'hôte pose (#13919) : la scène suit le premier, la publication les prend tous. */
    fun formatted(state: StoryComposerUiState, formats: List<ComposerFormat>, layout: MosaicLayoutMode?): StoryComposerUiState {
        val format = formats.firstOrNull() ?: return state
        return state.copy(format = format, checkedFormats = formats.drop(1), postLayout = layout)
    }

    fun postTyped(state: StoryComposerUiState, text: String): StoryComposerUiState =
        state.copy(postText = ComposerPostTextPolicy.truncate(text))

    /** Le brouillon rouvert rend son texte du post, ses formats cochés (à l'hôte de les poser) et ses médias connus. */
    fun restored(state: StoryComposerUiState, snapshot: StoryComposerDraftSnapshot): StoryComposerUiState {
        val onDeck = state.deck.slides.flatMap { it.mediaIds + listOfNotNull(it.backgroundMediaId) }.toSet()
        val known = state.attachments.map { it.id }.toSet()
        return state.copy(
            postText = snapshot.postText,
            restoredFormats = (snapshot.formats.ifEmpty { listOfNotNull(snapshot.format) })
                .mapNotNull { name -> ComposerFormat.entries.firstOrNull { it.name == name } }
                .takeIf { it.isNotEmpty() },
            attachments = state.attachments + snapshot.media.filter { it.id in onDeck && it.id !in known && it.url.isNotBlank() },
        )
    }
}

/**
 * Ce que le brouillon garde du format (#13863, #13919) : le texte du post, le format que la scène suit — seul champ qu'un
 * client d'avant lit —, tous les formats cochés dès qu'il y en a plusieurs, et les médias connus de la scène.
 */
internal fun StoryComposerUiState.formatDraft(): StoryDraftFormat = StoryDraftFormat(
    postText = postText,
    format = format.name.takeIf { format != ComposerFormat.STORY },
    media = sceneMedia().filter { it.url.isNotBlank() },
    formats = publishedFormats.takeIf { it.size > 1 }?.map { it.name }.orEmpty(),
)

/**
 * Un brouillon du compositeur de post d'avant entre dans la scène à l'ouverture (#13863 § 3) : converti, fusionné avec le
 * brouillon de scène s'il y en a un, écrit, et le créneau du fil se vide. Une porte qui pose sa propre matière n'adopte rien.
 */
internal object StoryPostDraftAdoption {
    suspend fun adopted(
        story: StoryComposerDraftSnapshot?,
        postDrafts: PostComposerDraftStore?,
        write: suspend (StoryComposerDraftSnapshot) -> Unit,
    ): StoryComposerDraftSnapshot? {
        val post = postDrafts?.let { runCatching { it.loadEditing() }.getOrNull() } ?: return story
        val opening = PostDraftScene.opening(story, post) { newSlideId() }
        val snapshot = opening.snapshot?.takeIf { opening.adoptsPostDraft } ?: return opening.snapshot
        write(snapshot)
        postDrafts.clearEditing()
        return snapshot
    }
}
