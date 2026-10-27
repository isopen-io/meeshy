package me.meeshy.sdk.model.reading.river

import kotlin.math.floor

/**
 * La Rivière — géométrie des couloirs. Miroir EXACT de `resolveRiverLanes`
 * (`packages/shared/utils/river-lanes.ts`) et de `RiverLaneResolver.swift`.
 *
 * Une branche NAÎT à la première interaction de son propriétaire, COURT tant que la conversation
 * l'entretient, MEURT [RiverLawConstants.LANE_SILENCE_WINDOW_MS] après sa dernière interaction, et
 * RENAÎT plus tard dans LA MÊME COLONNE. Un avis système n'est la voix de personne : il descend
 * l'axe du temps (il a son rang) et n'entre dans aucun des deux autres (ni voix, ni couloir, ni
 * connecteur, ni groupe).
 *
 * Hors de `[minVoices, maxLanes]` la loi rend un verdict `SERIALIZED` : la rivière redevient un fil.
 */
object RiverLaneResolver {

    private const val DAY_MS = 24.0 * 60.0 * 60.0 * 1000.0

    private data class Placed(
        val id: String,
        val senderId: String,
        val timeMs: Double,
        val replyToMessageId: String?,
        val isSystem: Boolean,
        val rank: Int,
    )

    /** Un nœud PLUS son horodatage : le temps sert à découper les segments, il ne ressort pas. */
    private data class Event(val rank: Int, val kind: RiverNodeKind, val messageId: String, val timeMs: Double) {
        fun toNode(): RiverNode = RiverNode(rank, kind, messageId)
    }

    /** Écarte les horodatages illisibles, trie par temps puis identifiant : deux plateformes dessinent la MÊME rivière. */
    private fun place(messages: List<RiverMessageInput>): List<Placed> =
        messages
            .filter { !it.createdAtMs.isNaN() }
            .sortedWith(compareBy<RiverMessageInput> { it.createdAtMs }.thenBy { it.id })
            .mapIndexed { rank, message ->
                Placed(message.id, message.senderId, message.createdAtMs, message.replyToMessageId, message.isSystem, rank)
            }

    /** « On vit tant qu'on parle — ou qu'on vous parle » : écrire (bubble) et se voir répondre (addressed). */
    private fun collectEngagements(spoken: List<Placed>): Map<String, List<Event>> {
        val senderById = spoken.associate { it.id to it.senderId }
        return spoken
            .flatMap { message ->
                val own = message.senderId to Event(message.rank, RiverNodeKind.BUBBLE, message.id, message.timeMs)
                val addressee = message.replyToMessageId?.let { senderById[it] }
                if (addressee == null || addressee == message.senderId) {
                    listOf(own)
                } else {
                    listOf(own, addressee to Event(message.rank, RiverNodeKind.ADDRESSED, message.id, message.timeMs))
                }
            }
            .groupBy({ it.first }, { it.second })
    }

    /**
     * Découpe les interactions d'un participant en segments. Un segment se coupe après plus de
     * [silenceWindowMs] de silence ; il SURVIT à ses propres bulles jusqu'au dernier rang encore
     * contenu dans la fenêtre qui suit sa dernière interaction.
     */
    private fun toSpans(events: List<Event>, rankTimes: List<Double>, silenceWindowMs: Double): List<RiverLaneSpan> {
        val sorted = events.sortedBy { it.rank }
        // Une rafale s'ouvre au premier événement, et après tout silence plus long que la fenêtre :
        // découpe en une passe, sans recopier les rafales déjà formées.
        val starts = sorted.indices.filter { it == 0 || sorted[it].timeMs - sorted[it - 1].timeMs > silenceWindowMs }
        val bursts = starts.mapIndexed { order, start -> sorted.subList(start, starts.getOrNull(order + 1) ?: sorted.size) }
        val lastRank = rankTimes.size - 1
        return bursts.map { burst ->
            val deathTime = burst.last().timeMs + silenceWindowMs
            val reachedRank = countAtMost(rankTimes, deathTime) - 1
            val endRank = maxOf(burst.last().rank, reachedRank)
            RiverLaneSpan(burst.first().rank, endRank, endRank == lastRank, burst.map(Event::toNode))
        }
    }

    /** Combien de rangs (triés par le temps) tombent au plus tard à [limit] : une recherche dichotomique. */
    private fun countAtMost(rankTimes: List<Double>, limit: Double): Int {
        var low = 0
        var high = rankTimes.size
        while (low < high) {
            val middle = (low + high) ushr 1
            if (rankTimes[middle] <= limit) low = middle + 1 else high = middle
        }
        return low
    }

    /**
     * Ordre des colonnes, RÉSERVÉ : le lecteur d'abord (la rive), puis les autres par ordre de
     * naissance, l'identifiant tranchant les naissances simultanées.
     */
    private fun orderLaneIds(engagements: Map<String, List<Event>>, viewerId: String): List<String> =
        engagements.keys
            .sortedWith(
                compareByDescending<String> { it == viewerId }
                    .thenBy { laneId -> engagements.getValue(laneId).minOf { it.rank } }
                    .thenBy { it },
            )

    private fun dayIndex(timeMs: Double, offsetMinutes: Double): Double =
        floor((timeMs + offsetMinutes * 60.0 * 1000.0) / DAY_MS)

    /** Deux rangs voisins appartiennent-ils à la même suite ? Un avis système ne continue personne. */
    private fun continues(earlier: Placed, later: Placed, offsetMinutes: Double): Boolean =
        !earlier.isSystem && !later.isSystem &&
            earlier.senderId == later.senderId &&
            dayIndex(earlier.timeMs, offsetMinutes) == dayIndex(later.timeMs, offsetMinutes)

    /** Tête de groupe, règle d'iOS : le rang PRÉCÉDENT change d'expéditeur, de jour, ou l'un des deux est un avis. */
    private fun isGroupHead(placed: List<Placed>, index: Int, offsetMinutes: Double): Boolean {
        val previous = placed.getOrNull(index - 1) ?: return true
        return !continues(previous, placed[index], offsetMinutes)
    }

    private fun connectors(spoken: List<Placed>, columnOf: (String) -> Int): List<RiverConnector> {
        val byId = spoken.associateBy { it.id }
        return spoken.mapNotNull { message ->
            val target = message.replyToMessageId?.let { byId[it] } ?: return@mapNotNull null
            RiverConnector(
                fromMessageId = message.id,
                toMessageId = target.id,
                fromLaneIndex = columnOf(message.senderId),
                toLaneIndex = columnOf(target.senderId),
                fromRank = message.rank,
                toRank = target.rank,
            )
        }
    }

    fun resolveRiverLanes(input: ResolveRiverLanesInput): RiverGeometry {
        val silenceWindowMs = input.silenceWindowMs ?: RiverLawConstants.LANE_SILENCE_WINDOW_MS
        val maxLanes = input.maxLanes ?: RiverLawConstants.MAX_LANES
        val minVoices = input.minVoices ?: RiverLawConstants.MIN_VOICES
        val offsetMinutes = input.dayBoundaryOffsetMinutes ?: 0.0
        val placed = place(input.messages)
        val spoken = placed.filter { !it.isSystem }
        // Les rangs restent ceux de TOUTE la fenêtre, avis compris : une branche survit à un avis qui passe.
        val rankTimes = placed.map { it.timeMs }
        val engagements = collectEngagements(spoken)
        val seedByParticipantId = input.participants.associate { it.id to it.displayName }

        val seeds = orderLaneIds(engagements, input.viewerId).map { laneId ->
            RiverColumnPacking.Seed(laneId, laneId == input.viewerId, toSpans(engagements.getValue(laneId), rankTimes, silenceWindowMs))
        }
        // Une VOIX est une personne entendue : au moins une bulle. Ni une interpellation, ni une annonce.
        val voiceCount = spoken.map { it.senderId }.toSet().size
        val assignment = RiverColumnPacking.assign(seeds, maxLanes)

        val reason = when {
            assignment.overflowed -> RiverSerializationReason.ABOVE_MAXIMUM
            voiceCount < minVoices -> RiverSerializationReason.BELOW_MINIMUM
            else -> null
        }
        val layout = if (reason == null) RiverLayout.LANES else RiverLayout.SERIALIZED
        val columnOf = { laneId: String -> if (layout == RiverLayout.SERIALIZED) 0 else assignment.indexByLaneId[laneId] ?: 0 }

        val lanes = seeds.map { seed ->
            RiverLane(seed.laneId, columnOf(seed.laneId), seed.isViewer, seedByParticipantId[seed.laneId] ?: seed.laneId, seed.spans)
        }
        val bubbles = placed.mapIndexed { index, message ->
            RiverBubble(
                messageId = message.id,
                laneId = message.senderId,
                laneIndex = columnOf(message.senderId),
                rank = message.rank,
                createdAtMs = message.timeMs,
                isViewer = message.senderId == input.viewerId,
                replyToMessageId = message.replyToMessageId,
                isFirstInGroup = isGroupHead(placed, index, offsetMinutes),
                isSystem = message.isSystem,
            )
        }
        return RiverGeometry(
            lanes = lanes,
            bubbles = bubbles,
            connectors = connectors(spoken, columnOf),
            rankCount = placed.size,
            laneCount = lanes.map { it.laneIndex }.toSet().size,
            voiceCount = voiceCount,
            layout = layout,
            serializationReason = reason,
            silenceWindowMs = silenceWindowMs,
            maxLanes = maxLanes,
            minVoices = minVoices,
        )
    }
}
