package me.meeshy.sdk.model

/**
 * **Les vocaux qui ARRIVENT pendant l'écoute d'un fil** — port d'`AudioQueueAppendTracker` d'iOS : fonction pure,
 * immuable. Chaque émission du fil est confrontée à la mémoire des messages déjà vus ; seuls les INSERTIONS nouvelles
 * d'un autre auteur, dans la conversation JOUÉE, rejoignent la fin de la file.
 *
 * La première émission, et toute émission pendant laquelle aucune lecture n'est active DANS CETTE conversation, ne font
 * que rebaser la mémoire : l'arriéré ne se rejoue jamais comme « nouveau » quand une lecture démarre ensuite. Un message
 * plus ANCIEN que le plus ancien déjà vu (l'historique que le fil pagine par le haut pendant l'écoute) n'est pas une
 * arrivée non plus : un ajout par rapport à iOS, qui y rejoue l'arriéré. La borne est le plus ANCIEN vu, jamais le plus
 * récent : une arrivée livrée après une plus récente (deux auteurs, deux trajets) ou après mon propre message horodaté
 * par une horloge d'appareil en avance reste une arrivée. Une pièce déjà écoutée (session) ou consommée jusqu'au bout
 * (servie) n'est pas une arrivée. La protection du message et de la pièce et la piste servie voyagent avec chaque entrée,
 * exactement comme pour [AudioQueueBuilder].
 */
public class AudioQueueAppendTracker private constructor(
    private val seenMessageIds: Set<String>,
    private val oldestSeenAtEpochMs: Long?,
    private val didSeed: Boolean,
) {
    public constructor() : this(emptySet(), null, false)

    public fun next(
        snapshot: List<AudioQueueMessage>,
        activeConversationId: String?,
        conversationId: String,
        currentUserId: String,
        listenedAttachmentIds: Set<String>,
    ): Pair<List<QueuedAudio>, AudioQueueAppendTracker> {
        val snapshotOldest = snapshot.minOfOrNull { it.createdAtEpochMs }
        if (!didSeed || activeConversationId == null || activeConversationId != conversationId) {
            val rebased = AudioQueueAppendTracker(snapshot.mapTo(HashSet()) { it.messageId }, snapshotOldest, didSeed = true)
            return emptyList<QueuedAudio>() to rebased
        }

        val arrivals = snapshot
            .filter {
                it.messageId !in seenMessageIds && !it.isOlderThan(oldestSeenAtEpochMs) &&
                    it.senderId != currentUserId && it.conversationId == conversationId
            }
            .flatMap { message ->
                message.audios
                    .filter { it.attachmentId !in listenedAttachmentIds && !it.listenedComplete }
                    .map { message.queued(it) }
            }
        val oldest = listOfNotNull(oldestSeenAtEpochMs, snapshotOldest).minOrNull()
        return arrivals to AudioQueueAppendTracker(seenMessageIds + snapshot.map { it.messageId }, oldest, didSeed = true)
    }

    private fun AudioQueueMessage.isOlderThan(bound: Long?): Boolean = bound != null && createdAtEpochMs < bound
}
