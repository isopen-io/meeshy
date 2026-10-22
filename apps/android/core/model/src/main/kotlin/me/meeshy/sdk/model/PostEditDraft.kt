package me.meeshy.sdk.model

/**
 * Les champs d'une édition qu'une surface peut déclarer CONNUS — miroir de `PostEditField`
 * (iOS) et de `buildUpdatePayload` (`packages/shared/utils/composer-contract.ts`). Un champ
 * non déclaré est OMIS du corps, qu'il soit ou non présent dans le brouillon : la surface ne
 * l'a pas peint, ou sa charge est amputée par construction.
 */
enum class PostEditField {
    CONTENT,
    VISIBILITY,
    VISIBILITY_USER_IDS,
    MOOD_EMOJI,
    ORIGINAL_LANGUAGE,
    TYPE,
    REMOVE_MEDIA_IDS,
    STORY_EFFECTS,
    MEDIA_IDS,
    LOCATION,
    MENTIONS,
    ALLOW_SOUND_EXTRACTION,
    MEDIA_ALT,
    MEDIA_CAPTION,
    ;

    companion object {
        val ALL: Set<PostEditField> = entries.toSet()
    }
}

/**
 * Ce qu'un éditeur a en main. `null` = ABSENT (jamais « vide-le ») ; l'effacement s'écrit
 * `emptyList()` pour une liste ou [PostLocationUpdate.Remove] pour le lieu.
 */
data class PostEditDraft(
    val content: String? = null,
    val visibility: String? = null,
    val visibilityUserIds: List<String>? = null,
    val moodEmoji: String? = null,
    val originalLanguage: String? = null,
    val type: String? = null,
    val removeMediaIds: List<String>? = null,
    val storyEffects: StoryEffects? = null,
    val mediaIds: List<String>? = null,
    val location: PostLocationUpdate? = null,
    val mentions: List<PostMentionInput>? = null,
    val allowSoundExtraction: Boolean? = null,
    val mediaAlt: Map<String, String>? = null,
    val mediaCaption: Map<String, String>? = null,
)

/** Le SEUL filtre du corps d'une édition : seuls les champs [known] survivent. */
object PostEditPayload {
    fun build(known: Set<PostEditField>, draft: PostEditDraft): PostEditDraft =
        PostEditDraft(
            content = draft.content.takeIf { PostEditField.CONTENT in known },
            visibility = draft.visibility.takeIf { PostEditField.VISIBILITY in known },
            visibilityUserIds = draft.visibilityUserIds.takeIf { PostEditField.VISIBILITY_USER_IDS in known },
            moodEmoji = draft.moodEmoji.takeIf { PostEditField.MOOD_EMOJI in known },
            originalLanguage = draft.originalLanguage.takeIf { PostEditField.ORIGINAL_LANGUAGE in known },
            type = draft.type.takeIf { PostEditField.TYPE in known },
            removeMediaIds = draft.removeMediaIds.takeIf { PostEditField.REMOVE_MEDIA_IDS in known },
            storyEffects = draft.storyEffects.takeIf { PostEditField.STORY_EFFECTS in known },
            mediaIds = draft.mediaIds.takeIf { PostEditField.MEDIA_IDS in known },
            location = draft.location.takeIf { PostEditField.LOCATION in known },
            mentions = draft.mentions.takeIf { PostEditField.MENTIONS in known },
            allowSoundExtraction = draft.allowSoundExtraction.takeIf { PostEditField.ALLOW_SOUND_EXTRACTION in known },
            mediaAlt = draft.mediaAlt.takeIf { PostEditField.MEDIA_ALT in known },
            mediaCaption = draft.mediaCaption.takeIf { PostEditField.MEDIA_CAPTION in known },
        )
}

/** Verdict MOTIVÉ sur le choix « Réel » à l'édition. */
sealed interface ReelChoosability {
    val isChoosable: Boolean

    /** Les médias restants qualifient. */
    data object RemainingQualifies : ReelChoosability {
        override val isChoosable: Boolean = true
    }

    /** Le réel d'origine n'a perdu aucun média : le serveur l'a déjà accepté tel quel. */
    data object OriginalReelUntouched : ReelChoosability {
        override val isChoosable: Boolean = true
    }

    /** Un retrait de média a dé-qualifié la composition : le gateway refuserait le réel. */
    data object RefusedAfterRemoval : ReelChoosability {
        override val isChoosable: Boolean = false
    }

    /** Les médias restants ne qualifient pas (durée inconnue/courte, une seule image...). */
    data object RefusedNotQualifying : ReelChoosability {
        override val isChoosable: Boolean = false
    }
}

/** Le TYPE d'une publication éditée (#9178) : POST <-> REEL, le sélecteur est toujours offert. */
object PostEditTypeChoice {
    fun initialType(originalType: String?): String =
        if ((originalType ?: "POST").uppercase() == "REEL") "REEL" else "POST"

    fun reelIsChoosable(
        originalType: String?,
        remainingMedia: List<ReelComposition.MediaKind>,
        removedAny: Boolean,
    ): ReelChoosability = when {
        ReelComposition.qualifiesAsReel(remainingMedia) -> ReelChoosability.RemainingQualifies
        initialType(originalType) == "REEL" && !removedAny -> ReelChoosability.OriginalReelUntouched
        removedAny -> ReelChoosability.RefusedAfterRemoval
        else -> ReelChoosability.RefusedNotQualifying
    }

    fun selection(selected: String, reelIsChoosable: ReelChoosability): String =
        if (selected == "REEL" && !reelIsChoosable.isChoosable) "POST" else selected
}
