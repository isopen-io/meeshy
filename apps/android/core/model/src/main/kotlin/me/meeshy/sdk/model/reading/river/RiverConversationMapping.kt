package me.meeshy.sdk.model.reading.river

/**
 * Le message d'une conversation tel que le pont de la Rivière le lit — le strict nécessaire de
 * `MeeshyMessage` côté iOS, sans type d'écran. [isSystem] : avis d'arrivée, résumé d'appel
 * (`messageSource == system`). [isDeleted] : supprimé, donc sans rang (une bulle vide ferait un rang vide).
 */
data class RiverConversationMessage(
    val id: String,
    val senderId: String,
    val senderName: String? = null,
    val senderUsername: String? = null,
    val createdAtMs: Double,
    val replyToId: String? = null,
    val isSystem: Boolean = false,
    val isDeleted: Boolean = false,
)

/**
 * Où une bulle se tient dans son GROUPE (messages consécutifs d'une même voix). Directive produit
 * 2026-08-22 : deux messages de suite ont LEUR BORDURE JOINTE en pointillé et partagée.
 */
enum class RiverGroupPosition {
    /** Seule dans son groupe : contour fermé des quatre côtés. */
    SOLO,

    /** Première d'un groupe qui continue : haut fermé, bas ouvert. */
    HEAD,

    /** Entre deux bulles du même groupe : haut partagé, bas ouvert. */
    MIDDLE,

    /** Dernière d'un groupe : haut partagé, bas fermé. */
    TAIL;

    /** Le bord haut est la JOINTURE pointillée avec la bulle précédente. */
    val joinsAbove: Boolean get() = this == MIDDLE || this == TAIL

    /** Le bord bas reste ouvert : la bulle suivante vient s'y coller. */
    val joinsBelow: Boolean get() = this == HEAD || this == MIDDLE
}

/**
 * Empreinte du fil : ne recalculer la géométrie que si les messages QUI ONT UN RANG ont changé.
 * Elle n'ALLOUE pas (aucune chaîne de N identifiants), porte le compte pour que deux fils distincts
 * ne se fient pas au seul hachage, et distingue l'ORDRE. Valable dans le processus qui l'a calculée.
 */
data class RiverThreadFingerprint(val count: Int, val digest: Int)

/**
 * Le pont PUR entre le fil d'une conversation et la loi de la Rivière — miroir des règles pures de
 * `RiverConversationMapping.swift`. Le texte Prisme, l'heure, la présence, l'anneau de story et la
 * protection d'un média sont résolus par l'appelant (écran) et ne passent pas ici.
 */
object RiverConversationMapping {

    /**
     * L'échelle des fenêtres de silence essayées, du plus large au plus serré : une conversation qui
     * s'étale sur des jours garde ses voix côte à côte, une conversation en rafale se resserre
     * jusqu'à la demi-minute. Le défaut de la loi y figure comme un barreau parmi d'autres.
     */
    val silenceWindowLadderMs: List<Double> = listOf(
        7.0 * 24 * 60 * 60 * 1000,
        24.0 * 60 * 60 * 1000,
        6.0 * 60 * 60 * 1000,
        60.0 * 60 * 1000,
        RiverLawConstants.LANE_SILENCE_WINDOW_MS,
        10.0 * 60 * 1000,
        5.0 * 60 * 1000,
        2.0 * 60 * 1000,
        60.0 * 1000,
        30.0 * 1000,
    )

    /** Un message est une VOIX s'il vient d'un humain ou d'un agent — jamais du système, jamais supprimé. */
    fun isVoice(message: RiverConversationMessage): Boolean = !message.isSystem && !message.isDeleted

    fun displayName(message: RiverConversationMessage): String =
        message.senderName ?: message.senderUsername ?: message.senderId

    /**
     * Ce que la loi doit voir : TOUT ce qui a un rang dans le temps — les voix ET les avis, ces
     * derniers MARQUÉS `isSystem` (un avis garde son rang mais n'est la voix de personne). Seuls les
     * supprimés restent dehors. Les participants sont les VOIX seules, dans l'ordre de première
     * apparition, avec leur dernier nom connu : un auteur d'avis qui n'a jamais parlé n'y figure pas.
     */
    fun lanesInput(
        messages: List<RiverConversationMessage>,
        viewerId: String,
        silenceWindowMs: Double? = null,
    ): ResolveRiverLanesInput {
        val ranked = messages.filter { !it.isDeleted }
        val voices = ranked.filter(::isVoice)
        val latestNameBySender = voices.associate { it.senderId to displayName(it) }
        return ResolveRiverLanesInput(
            messages = ranked.map {
                RiverMessageInput(it.id, it.senderId, it.createdAtMs, it.replyToId, it.isSystem)
            },
            participants = voices.map { it.senderId }.distinct()
                .map { RiverParticipantInput(it, latestNameBySender.getValue(it)) },
            viewerId = viewerId,
            silenceWindowMs = silenceWindowMs,
        )
    }

    /**
     * **La fenêtre de silence ne peut être ni une constante ni devinée.** Trop large, l'axe déborde
     * (`ABOVE_MAXIMUM`) ; trop courte, il se vide (`BELOW_MINIMUM`) : les deux rabattent le plan sur
     * une colonne. On rejoue la loi (pure) sur [silenceWindowLadderMs] et on garde la fenêtre qui
     * aligne le PLUS de voix sans déborder (la première à égalité). Aucune ne donne un plan à
     * couloirs : on rend la géométrie de la fenêtre par défaut, qui prononce elle-même sa sérialisation.
     */
    fun resolveGeometry(messages: List<RiverConversationMessage>, viewerId: String): RiverGeometry {
        var best: RiverGeometry? = null
        for (window in silenceWindowLadderMs) {
            val candidate = RiverLaneResolver.resolveRiverLanes(lanesInput(messages, viewerId, window))
            if (candidate.layout != RiverLayout.LANES) continue
            if (best == null || candidate.laneCount > best.laneCount) best = candidate
            if (candidate.laneCount >= RiverLawConstants.MAX_LANES) break
        }
        return best ?: RiverLaneResolver.resolveRiverLanes(lanesInput(messages, viewerId, null))
    }

    /** Une citation tient sur UNE ligne : retours à la ligne et blancs répétés repliés en un espace. */
    fun singleLine(text: String): String = text.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")

    /**
     * Position de groupe de CHAQUE bulle, déduite de la loi seule : la tête est `isFirstInGroup` ;
     * la bulle est suivie si le rang SUIVANT n'ouvre pas de groupe. Un avis système ouvre toujours un
     * groupe, donc coupe celui qui le précède. Un identifiant en double (écho socket et REST) ne fait
     * pas échouer : la première position fait foi.
     */
    fun groupPositions(bubbles: List<RiverBubble>): Map<String, RiverGroupPosition> {
        val positions = LinkedHashMap<String, RiverGroupPosition>()
        bubbles.forEachIndexed { index, bubble ->
            val next = bubbles.getOrNull(index + 1)
            val isFollowed = next != null && !next.isFirstInGroup && !next.isSystem
            val position = position(opensGroup = bubble.isFirstInGroup || bubble.isSystem, isFollowed = isFollowed)
            positions.putIfAbsent(bubble.messageId, position)
        }
        return positions
    }

    private fun position(opensGroup: Boolean, isFollowed: Boolean): RiverGroupPosition = when {
        opensGroup && !isFollowed -> RiverGroupPosition.SOLO
        opensGroup -> RiverGroupPosition.HEAD
        isFollowed -> RiverGroupPosition.MIDDLE
        else -> RiverGroupPosition.TAIL
    }

    /** R-6 — la citation mène à sa cible : couloir et rang servis par la loi. `null` si hors fenêtre ou avis système. */
    fun cursorForMessage(messageId: String, geometry: RiverGeometry): RiverCursor? =
        geometry.bubbles.firstOrNull { it.messageId == messageId }
            ?.takeIf { !it.isSystem }
            ?.let { RiverCursor(it.laneIndex, it.rank) }

    /** Curseur d'ouverture : la bulle la plus RÉCENTE, sinon la rive du lecteur au premier rang. */
    fun initialCursor(geometry: RiverGeometry): RiverCursor =
        geometry.bubbles.maxByOrNull { it.rank }?.let { RiverCursor(it.laneIndex, it.rank) } ?: RiverCursor(0, 0)

    /** « Au présent » : le curseur porte le rang de la bulle la plus RÉCENTE. Un fil sans bulle n'a rien à rattraper. */
    fun isAtPresent(cursor: RiverCursor, geometry: RiverGeometry): Boolean =
        geometry.bubbles.maxOfOrNull { it.rank }?.let { it == cursor.rank } ?: false

    fun fingerprint(messages: List<RiverConversationMessage>): RiverThreadFingerprint {
        val ranked = messages.filter { !it.isDeleted }
        return RiverThreadFingerprint(ranked.size, ranked.fold(1) { hash, message -> 31 * hash + message.id.hashCode() })
    }

    /** Une ou deux lettres majuscules : initiale du premier mot et du second. Typographique seulement. */
    fun initials(displayName: String): String {
        val letters = displayName.split(' ').filter { it.isNotEmpty() }.take(2).map { it.first() }
        return if (letters.isEmpty()) "?" else letters.joinToString("").uppercase()
    }
}

/**
 * R-8 — une pile paresseuse ne pose que les rangs visibles. Un rang sans cadre est AU-DESSUS s'il
 * précède le premier rang connu, AU-DESSOUS s'il suit le dernier ; entre deux rangs connus (ou sans
 * aucun rang connu), rien n'est supposé. Générique sur le cadre : la toile y met son rectangle.
 */
sealed interface RiverRankPlacement<out T> {
    data class Known<T>(val frame: T) : RiverRankPlacement<T>
    data object Above : RiverRankPlacement<Nothing>
    data object Below : RiverRankPlacement<Nothing>
    data object Unknown : RiverRankPlacement<Nothing>

    companion object {
        fun <T> resolve(rank: Int, known: Map<Int, T>): RiverRankPlacement<T> {
            known[rank]?.let { return Known(it) }
            val first = known.keys.minOrNull() ?: return Unknown
            val last = known.keys.max()
            return when {
                rank < first -> Above
                rank > last -> Below
                else -> Unknown
            }
        }
    }
}
