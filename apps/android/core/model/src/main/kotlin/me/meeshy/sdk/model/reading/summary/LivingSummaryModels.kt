package me.meeshy.sdk.model.reading.summary

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.ServedProfileDecorItem

/**
 * Modèles PURS du Résumé vivant — miroir de `LivingSummaryModels.swift` (iOS). Aucune
 * horloge murale, aucun fuseau implicite, aucun appel serveur : tout est injecté, donc le
 * calcul marche hors ligne et dans une conversation chiffrée de bout en bout.
 */
enum class DigestMediaKind { IMAGE, VIDEO, AUDIO, FILE, LOCATION }

/** Message vu par le segmenteur d'épisodes. */
data class EpisodeInputMessage(
    val id: String,
    val senderId: String,
    val createdAt: Instant,
    val replyToId: String?,
    val isSystem: Boolean,
)

/**
 * Message vu par [DeterministicDigestBuilder]. [content] ne sert qu'à détecter une question
 * finale ; [mentionsViewer] est pré-résolu par l'appelant ([LivingSummaryAssembly]).
 */
data class DigestInputMessage(
    val base: EpisodeInputMessage,
    val content: String,
    val languageCode: String?,
    val attachmentKinds: List<DigestMediaKind>,
    val linkCount: Int,
    val mentionsViewer: Boolean,
) {
    val id: String get() = base.id
    val senderId: String get() = base.senderId
    val createdAt: Instant get() = base.createdAt
    val replyToId: String? get() = base.replyToId
    val isSystem: Boolean get() = base.isSystem
}

/** Identité + présence d'un participant, jamais recalculées ici. */
data class DigestParticipant(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val colorHex: String,
    val presence: PresenceState,
    val ring: ServedProfileDecorItem? = null,
)

/**
 * Clés de libellé de jour d'un titre d'épisode — mêmes clés que iOS
 * (`focal.summary.day.*`), le rendu en chaîne appartient à l'écran.
 */
enum class DayLabelKey(val key: String) {
    TODAY("focal.summary.day.today"),
    YESTERDAY("focal.summary.day.yesterday"),
    DAY_BEFORE_YESTERDAY("focal.summary.day.day_before_yesterday"),
}

/** Un jour tel que le titre le dit : relatif (clé), jour de semaine ou date complète. */
sealed interface DayLabel {
    data class Relative(val key: DayLabelKey) : DayLabel
    data class Weekday(val day: DayOfWeek) : DayLabel
    data class FullDate(val date: LocalDate, val includeYear: Boolean) : DayLabel
}

/**
 * Titre déterministe d'un épisode : « Aujourd'hui · 12 messages » ou
 * « Lun–Mar · 174 messages ». Structuré (clés + nombre) pour rester traduisible.
 */
data class EpisodeTitle(val start: DayLabel, val end: DayLabel?, val messageCount: Int) {
    val messagesKey: String
        get() = if (messageCount == 1) MESSAGES_ONE_KEY else MESSAGES_OTHER_KEY

    companion object {
        const val MESSAGES_ONE_KEY = "focal.summary.episode.messages_one"
        const val MESSAGES_OTHER_KEY = "focal.summary.episode.messages_other"
    }
}

data class ConversationEpisode(
    val id: String,
    val start: Instant,
    val end: Instant,
    val messageIds: List<String>,
    val participantIds: List<String>,
    val deterministicTitle: EpisodeTitle,
    val agentTitle: String? = null,
) {
    val isAgentTitled: Boolean get() = agentTitle != null
}

data class SenderTally(val userId: String, val messageCount: Int, val lastAt: Instant)

data class LanguageTally(val code: String, val messageCount: Int)

data class MediaTally(
    val images: Int,
    val videos: Int,
    val audios: Int,
    val files: Int,
    val locations: Int,
    val links: Int,
) {
    companion object {
        val EMPTY = MediaTally(0, 0, 0, 0, 0, 0)
    }
}

enum class AwaitingKind { MENTION, DIRECT_REPLY, UNANSWERED_QUESTION }

/**
 * Une chose qui m'attend, TOUJOURS adossée à des messages réels : [evidenceMessageIds] est
 * non vide par construction ([of] rend `null` plutôt que de produire une ligne sans preuve).
 */
data class AwaitingItem(
    val id: String,
    val kind: AwaitingKind,
    val fromUserId: String,
    val evidenceMessageIds: List<String>,
    val at: Instant,
) {
    init {
        require(evidenceMessageIds.isNotEmpty()) { "AwaitingItem sans preuve" }
    }

    companion object {
        fun of(
            id: String,
            kind: AwaitingKind,
            fromUserId: String,
            evidenceMessageIds: List<String>,
            at: Instant,
        ): AwaitingItem? =
            if (evidenceMessageIds.isEmpty()) null else AwaitingItem(id, kind, fromUserId, evidenceMessageIds, at)
    }
}

data class DeterministicConversationDigest(
    val messageCount: Int,
    val participantCount: Int,
    val start: Instant?,
    val end: Instant?,
    val topSenders: List<SenderTally>,
    val languages: List<LanguageTally>,
    val media: MediaTally,
    val awaitingYou: List<AwaitingItem>,
    val episodes: List<ConversationEpisode>,
    /** `false` : la fenêtre chargée ne couvre PAS tout le non-lu, les chiffres sont partiels. */
    val isComplete: Boolean,
) {
    companion object {
        val EMPTY = DeterministicConversationDigest(
            messageCount = 0, participantCount = 0, start = null, end = null,
            topSenders = emptyList(), languages = emptyList(), media = MediaTally.EMPTY,
            awaitingYou = emptyList(), episodes = emptyList(), isComplete = true,
        )
    }
}

data class FaceRampEntry(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val colorHex: String,
    val presence: PresenceState,
    /** Ce qui est AFFICHÉ sur le badge : le nombre de messages qui m'attendent. */
    val awaitingCount: Int,
    /** Ce qui SERT AU TRI. Jamais affiché. */
    val needScore: Double,
    val evidenceMessageIds: List<String>,
    val ring: ServedProfileDecorItem? = null,
)

data class FaceRampRankingInput(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val colorHex: String,
    val presence: PresenceState,
    val mentionEvidence: List<String>,
    val directReplyEvidence: List<String>,
    val unansweredQuestionEvidence: List<String>,
    val mostRecentEvidenceAt: Instant?,
    val ring: ServedProfileDecorItem? = null,
)
