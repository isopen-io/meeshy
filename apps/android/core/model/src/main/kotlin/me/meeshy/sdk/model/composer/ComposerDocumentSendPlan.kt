package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.DiscoverabilityPrecision
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryVisibility

/** Par où un envoi de document part (miroir d'iOS `ComposerDocumentSendPath`). */
enum class ComposerDocumentSendPath {
    QUOTED_REPOST, TEXT_ONLY, DURABLE_OUTBOX, UPLOAD;

    val isDurable: Boolean get() = this == TEXT_ONLY || this == DURABLE_OUTBOX
}

/** Pourquoi un envoi est refusé, dit en clair (miroir d'iOS `ComposerDocumentSendRefusal`). */
sealed interface ComposerDocumentSendRefusal {
    data class WrongFormat(val format: ComposerFormat) : ComposerDocumentSendRefusal
    data object EmptyDraft : ComposerDocumentSendRefusal
    data object ReelWithoutQualifyingMedia : ComposerDocumentSendRefusal
    data class NonDurablePath(val path: ComposerDocumentSendPath) : ComposerDocumentSendRefusal
    data class PublisherRejected(val message: String) : ComposerDocumentSendRefusal
    data object PublisherSilent : ComposerDocumentSendRefusal
    data class IncompleteAudience(val visibility: StoryVisibility) : ComposerDocumentSendRefusal
}

/** Ce que le brouillon porte, vu des lois d'envoi. */
data class ComposerDocumentDraft(
    val format: ComposerFormat,
    val text: String?,
    val visibility: StoryVisibility,
    val visibilityUserIds: List<String>?,
    val repostOfId: String? = null,
    val localMedia: List<ComposerDocumentMedia> = emptyList(),
    val hasLocation: Boolean = false,
    val carriesSceneObject: Boolean = false,
    val originalLanguage: String? = null,
    val mentions: List<PostMentionInput>? = null,
    val location: SharedPlace? = null,
    val discoverabilityPrecision: DiscoverabilityPrecision? = null,
    val mobileTranscription: MobileTranscriptionPayload? = null,
    val storyEffects: StoryEffects? = null,
    val forcePlainPost: Boolean = false,
    val allowSoundExtraction: Boolean? = null,
    /** La publication naît commentaires fermés (#16541). */
    val commentsDisabled: Boolean = false,
    val mediaCaptions: Map<String, String> = emptyMap(),
    val mediaAlts: Map<String, String> = emptyMap(),
    val mediaObjectIds: Map<String, String> = emptyMap(),
)

/** Le brouillon devient l'intention d'envoi : UNE fabrique, la même pour la porte du fil et la porte sans fil. */
fun ComposerDocumentDraft.toPublishIntent(): PublishIntent = PublishIntent.document(
    localMedia = localMedia,
    declaredType = format.postType,
    forcePlainPost = forcePlainPost,
    content = text,
    visibility = visibility.wire,
    visibilityUserIds = visibilityUserIds,
    originalLanguage = originalLanguage,
    mentions = mentions,
    location = location,
    discoverabilityPrecision = discoverabilityPrecision,
    transcription = mobileTranscription,
    storyEffects = storyEffects,
    mediaCaptions = mediaCaptions,
    mediaAlts = mediaAlts,
    mediaObjectIds = mediaObjectIds,
    allowSoundExtraction = allowSoundExtraction,
    commentsDisabled = commentsDisabled.takeIf { it },
)

sealed interface ComposerDocumentSendPlan {
    data class Send(val path: ComposerDocumentSendPath) : ComposerDocumentSendPlan
    data class Refuse(val refusal: ComposerDocumentSendRefusal) : ComposerDocumentSendPlan

    companion object {
        /** Un document part par la voie durable ou ne part pas : jamais d'envoi direct qu'une panne perdrait. */
        fun plan(draft: ComposerDocumentDraft): ComposerDocumentSendPlan {
            if (draft.format != ComposerFormat.POST && draft.format != ComposerFormat.REEL) {
                return Refuse(ComposerDocumentSendRefusal.WrongFormat(draft.format))
            }
            val textBlank = draft.text.isNullOrBlank()
            if (textBlank && draft.localMedia.isEmpty() && !draft.hasLocation && !draft.carriesSceneObject) {
                return Refuse(ComposerDocumentSendRefusal.EmptyDraft)
            }
            if (!ComposerDocumentRules.audienceIsComplete(draft.visibility, draft.visibilityUserIds.orEmpty())) {
                return Refuse(ComposerDocumentSendRefusal.IncompleteAudience(draft.visibility))
            }
            val qualifies = ReelComposition.qualifiesAsReel(
                draft.localMedia.map { ReelComposition.MediaKind(it.mimeType, it.durationMs) },
            )
            if (draft.format == ComposerFormat.REEL && !qualifies) {
                return Refuse(ComposerDocumentSendRefusal.ReelWithoutQualifyingMedia)
            }
            val path = path(isQuote = draft.repostOfId != null, hasLocalMedia = draft.localMedia.isNotEmpty())
            return if (path.isDurable) Send(path) else Refuse(ComposerDocumentSendRefusal.NonDurablePath(path))
        }

        fun path(isQuote: Boolean, hasLocalMedia: Boolean): ComposerDocumentSendPath = when {
            isQuote -> ComposerDocumentSendPath.QUOTED_REPOST
            !hasLocalMedia -> ComposerDocumentSendPath.TEXT_ONLY
            else -> ComposerDocumentSendPath.DURABLE_OUTBOX
        }

        /** L'issue rapportée par l'éditeur : une erreur non vide refuse avec son message, un échec muet aussi. */
        fun reported(succeeded: Boolean, error: String?): ComposerDocumentSendRefusal? = when {
            !error.isNullOrEmpty() -> ComposerDocumentSendRefusal.PublisherRejected(error)
            succeeded -> null
            else -> ComposerDocumentSendRefusal.PublisherSilent
        }
    }
}
