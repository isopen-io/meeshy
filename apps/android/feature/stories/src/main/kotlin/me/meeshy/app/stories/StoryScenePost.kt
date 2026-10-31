package me.meeshy.app.stories

import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.ComposerFormat
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
        )
    }

    /** Ce que « Rouvrir » rend d'un post qui n'est pas parti : son texte, ses médias (même en attente), leurs descriptions. */
    fun parked(state: StoryComposerUiState, request: CreatePostRequest): PostComposerDraftSnapshot = PostComposerDraftSnapshot(
        text = state.postText,
        visibility = request.visibility,
        media = state.sceneMedia(),
        language = request.originalLanguage,
        mediaAlt = request.mediaAlt.orEmpty(),
        mediaCaption = request.mediaCaption.orEmpty(),
    )
}

/** Le post part par le chemin du fil, avec ce que « Rouvrir » lui rendra s'il ne part pas. */
internal suspend fun PublicationOutbox.enqueueScene(state: StoryComposerUiState, plans: List<PublishPlan>, language: String): String {
    val request = ScenePostRequest.of(state, plans, language)
    return enqueuePost(request, ScenePostRequest.parked(state, request))
}

/** Une diapo qui fait une scène du post : un objet, un média, un son, un lieu ou un fond — jamais sa seule légende. */
internal val StorySlide.composesPostScene: Boolean
    get() = mediaIds.isNotEmpty() || elements.any { it.isPublishable } || stickers.any { it.isPublishable } || strokes.isNotEmpty() ||
        audio.isNotEmpty() || places.isNotEmpty() || background != null || backgroundMediaId != null

/** Les diapos que le post publie, dans l'ordre : ses scènes. */
internal val StoryComposerUiState.postSceneSlides: List<StorySlide>
    get() = deck.slides.filter { it.composesPostScene }

/** Une scène vierge, dans le format que l'hôte compose : abandonner ou publier ne change pas de format. */
internal fun StoryComposerUiState.blankKeepingFormat(): StoryComposerUiState = StoryComposerUiState(format = format, postLayout = postLayout)

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
    fun formatted(state: StoryComposerUiState, format: ComposerFormat, layout: MosaicLayoutMode?): StoryComposerUiState =
        state.copy(format = format, postLayout = layout)

    fun postTyped(state: StoryComposerUiState, text: String): StoryComposerUiState =
        state.copy(postText = ComposerPostTextPolicy.truncate(text))

    /** Le brouillon rouvert rend son texte du post, son format (à l'hôte de le choisir) et ses médias connus. */
    fun restored(state: StoryComposerUiState, snapshot: StoryComposerDraftSnapshot): StoryComposerUiState {
        val onDeck = state.deck.slides.flatMap { it.mediaIds + listOfNotNull(it.backgroundMediaId) }.toSet()
        val known = state.attachments.map { it.id }.toSet()
        return state.copy(
            postText = snapshot.postText,
            restoredFormat = snapshot.format?.let { name -> ComposerFormat.entries.firstOrNull { it.name == name } },
            attachments = state.attachments + snapshot.media.filter { it.id in onDeck && it.id !in known && it.url.isNotBlank() },
        )
    }
}

/** Ce que le brouillon garde du format (#13863) : le texte du post, le format, et les médias connus de la scène. */
internal fun StoryComposerUiState.formatDraft(): StoryDraftFormat = StoryDraftFormat(
    postText = postText,
    format = format.name.takeIf { format != ComposerFormat.STORY },
    media = sceneMedia().filter { it.url.isNotBlank() },
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
