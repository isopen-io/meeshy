package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A published story item — port of StoryItem (StoryModels.swift). */
@Serializable
data class StoryItem(
    val id: String,
    val content: String? = null,
    val media: List<FeedMedia> = emptyList(),
    val storyEffects: StoryEffects? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val repostOfId: String? = null,
    val originalRepostOfId: String? = null,
    val repostAuthorName: String? = null,
    /**
     * `@handle` of the original author of a repost — shown after the author's name
     * in the viewer header (repost icon + `@handle`, no "via"). Optional: older
     * payloads decode as null and the UI falls back to [repostAuthorName]. Port of
     * `StoryItem.repostAuthorUsername` (StoryModels.swift).
     */
    val repostAuthorUsername: String? = null,
    val visibility: String? = null,
    val audioUrl: String? = null,
    val isViewed: Boolean = false,
    val translations: List<StoryTranslation>? = null,
    val backgroundAudio: StoryBackgroundAudioEntry? = null,
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
    /** Ids ciblés (`ONLY`) ou exclus (`EXCEPT`) ; `null` d'un ancien cache ou d'une ancienne passerelle. */
    val visibilityUserIds: List<String>? = null,
    /** Horodatage ISO du « vu » posé côté client ; `null` tant que la story n'est pas vue localement. */
    val viewedAt: String? = null,
    /** Dernière écriture serveur (compteurs inclus) — curseur du delta-sync `?updatedSince`. */
    val updatedAt: String? = null,
    /** Dernière édition de CONTENU (texte, effets, médias) ; seule à faire céder la garde « vu monotone ». */
    val contentEditedAt: String? = null,
    val shareCount: Int? = null,
    val viewCount: Int? = null,
    val impressionCount: Int? = null,
    /** Part ANONYME de [viewCount] (« et N visiteurs »). */
    val anonymousViewCount: Int? = null,
    val repostCount: Int? = null,
    /** Emojis posés par le lecteur ; `null` = charge antérieure à l'enrichissement. */
    val currentUserReactions: List<String>? = null,
    /** Droit d'ouvrir cette story passé son `expiresAt` parce qu'on y est nommé — lu tel que servi, jamais recalculé. */
    val referenceAccess: ReferenceAccess? = null,
    /** Les personnes nommées ; `null` = la charge n'en disait rien (différent de `[]`). */
    @Serializable(with = TolerantPostReferencesSerializer::class)
    val mentions: List<PostReference>? = null,
    /** Liens suivis de la légende ; `null` = adresses laissées brutes. */
    @Serializable(with = TolerantTrackedLinksSerializer::class)
    val trackingLinks: List<TrackedLink>? = null,
) {
    /** `[urlBrute: jeton]` que lit le rendu du texte. */
    val trackedLinkMap: Map<String, String> get() = trackingLinks.orEmpty().trackedLinkMap()

    /** Pseudos valides pour le rendu du texte ; `null` quand [mentions] est `null`. */
    val validMentionUsernames: Set<String>?
        get() = mentions?.map { it.username.lowercase() }?.toSet()

    /** Le lecteur a-t-il réagi à cette story (distinct de `reactionCount > 0`). */
    val currentUserHasReacted: Boolean get() = !currentUserReactions.isNullOrEmpty()

    public companion object {
        /**
         * Durée de vie d'une story SANS `expiresAt` : 20 h, alignée sur la constante serveur
         * `EPHEMERAL_POST_TTL_HOURS.STORY` (était 21 h, puis 24 h au repli du lecteur).
         */
        public const val DEFAULT_EXPIRY_MILLIS: Long = 20L * 60L * 60L * 1000L
    }
}

/** A story content translation — port of StoryTranslation (StoryModels.swift). */
@Serializable
data class StoryTranslation(
    val language: String = "",
    val content: String = "",
)

/** A grouping of one author's stories — port of StoryGroup (StoryModels.swift). */
@Serializable
data class StoryGroup(
    val id: String,
    val username: String = "",
    val avatarColor: String = "",
    val avatarURL: String? = null,
    val stories: List<StoryItem> = emptyList(),
    /** Présence de l'auteur servie avec le fil ; `null` = aucun point (jamais fabriquée par le client). */
    val authorPresence: UserPresence? = null,
    /** Contour d'avatar équipé de l'auteur ; `null` sans contour ou sur un ancien cache. */
    @Serializable(with = TolerantPostServedRingSerializer::class)
    val authorRing: PostServedRing? = null,
)

/** A mood/status entry — port of StatusEntry (StoryModels.swift). */
@Serializable
data class StatusEntry(
    val id: String,
    val userId: String = "",
    val username: String = "",
    val avatarColor: String = "",
    val moodEmoji: String = "",
    val content: String? = null,
    val audioUrl: String? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val visibility: String? = null,
    val reactionSummary: Map<String, Int>? = null,
    val viaUsername: String? = null,
)
