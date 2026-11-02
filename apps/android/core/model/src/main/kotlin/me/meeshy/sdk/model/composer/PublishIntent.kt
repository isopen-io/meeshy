package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.DiscoverabilityPrecision
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryEffects

/** Un fichier local du brouillon : chemin, MIME déclaré à la source, durée connue éventuelle. */
data class ComposerDocumentMedia(
    val path: String,
    val mimeType: String,
    val durationMs: Long? = null,
)

/**
 * Ce que l'auteur a produit, composé UNE fois — miroir de `PublishIntent` (iOS). On y entre
 * par une fabrique NOMMÉE ([document], [audioRecording]) dont AUCUN paramètre n'a de valeur
 * par défaut : chaque geste déclare tout ce qu'il publie, `null` compris. Le constructeur est
 * privé. [type] est la chaîne SERVEUR (`POST` / `REEL` / `STORY`).
 *
 * [clientMutationId] est tiré à chaque envoi ([ClientIdFormat.newCmid]) et ne dérive jamais
 * du contenu : deux intentions identiques partent sous deux clés.
 *
 * Les tableaux [mediaCaptions], [mediaAlts], [mediaObjectIds] sont alignés index pour index
 * sur [localMedia] : la carte (par chemin) devient un tableau ICI et nulle part ailleurs.
 */
class PublishIntent private constructor(
    val clientMutationId: String,
    val type: String,
    val localMedia: List<ComposerDocumentMedia>,
    val content: String?,
    val visibility: String,
    val visibilityUserIds: List<String>?,
    val originalLanguage: String?,
    val mentions: List<PostMentionInput>?,
    val location: SharedPlace?,
    val discoverabilityPrecision: DiscoverabilityPrecision?,
    val mobileTranscription: MobileTranscriptionPayload?,
    val storyEffects: StoryEffects?,
    val mediaCaptions: List<String?>,
    val mediaAlts: List<String?>,
    val mediaObjectIds: List<String?>,
    val allowSoundExtraction: Boolean?,
) {
    val localMediaPaths: List<String> get() = localMedia.map { it.path }
    val localMediaMimeTypes: List<String> get() = localMedia.map { it.mimeType }

    companion object {
        /**
         * Un type DÉCLARÉ gagne sur un type déduit : [ReelComposition] ne tranche que POST/REEL
         * quand l'auteur n'a rien choisi ([declaredType] `null`). Quand le contenu texte est
         * absent, la langue PARLÉE de la transcription est celle du contenu ; sinon le texte
         * garde sa langue déclarée et le média la sienne (sur [transcription]).
         */
        fun document(
            localMedia: List<ComposerDocumentMedia>,
            declaredType: PostType?,
            forcePlainPost: Boolean,
            content: String?,
            visibility: String,
            visibilityUserIds: List<String>?,
            originalLanguage: String?,
            mentions: List<PostMentionInput>?,
            location: SharedPlace?,
            discoverabilityPrecision: DiscoverabilityPrecision?,
            transcription: MobileTranscriptionPayload?,
            storyEffects: StoryEffects?,
            mediaCaptions: Map<String, String>,
            mediaAlts: Map<String, String>,
            mediaObjectIds: Map<String, String>,
            allowSoundExtraction: Boolean?,
        ): PublishIntent {
            val type = declaredType ?: ReelComposition.defaultType(
                media = localMedia.map { ReelComposition.MediaKind(it.mimeType, it.durationMs) },
                forcePlainPost = forcePlainPost,
            )
            return PublishIntent(
                clientMutationId = ClientIdFormat.newCmid(),
                type = type.name,
                localMedia = localMedia,
                content = content,
                visibility = visibility,
                visibilityUserIds = visibilityUserIds,
                originalLanguage = if (content == null) transcription?.language ?: originalLanguage else originalLanguage,
                mentions = mentions,
                location = location,
                discoverabilityPrecision = discoverabilityPrecision,
                mobileTranscription = transcription,
                storyEffects = storyEffects,
                mediaCaptions = localMedia.map { mediaCaptions[it.path] },
                mediaAlts = localMedia.map { mediaAlts[it.path] },
                mediaObjectIds = localMedia.map { mediaObjectIds[it.path] },
                allowSoundExtraction = allowSoundExtraction,
            )
        }

        /** Un vocal : ni scène, ni légende, ni alternative, ni objet à adopter, ni extraction. */
        fun audioRecording(
            filePath: String,
            mimeType: String,
            durationMs: Long,
            transcription: MobileTranscriptionPayload?,
            forcePlainPost: Boolean,
            content: String?,
            visibility: String,
            visibilityUserIds: List<String>?,
            mentions: List<PostMentionInput>?,
            location: SharedPlace?,
            discoverabilityPrecision: DiscoverabilityPrecision?,
        ): PublishIntent {
            val media = ComposerDocumentMedia(filePath, mimeType, durationMs)
            return PublishIntent(
                clientMutationId = ClientIdFormat.newCmid(),
                type = ReelComposition.defaultType(
                    media = listOf(ReelComposition.MediaKind(mimeType, durationMs)),
                    forcePlainPost = forcePlainPost,
                ).name,
                localMedia = listOf(media),
                content = content,
                visibility = visibility,
                visibilityUserIds = visibilityUserIds,
                originalLanguage = transcription?.language,
                mentions = mentions,
                location = location,
                discoverabilityPrecision = discoverabilityPrecision,
                mobileTranscription = transcription,
                storyEffects = null,
                mediaCaptions = listOf(null),
                mediaAlts = listOf(null),
                mediaObjectIds = listOf(null),
                allowSoundExtraction = null,
            )
        }
    }
}
