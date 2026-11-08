package me.meeshy.app.chat

import java.time.ZoneId

/**
 * Ce que la liste sait d'un message pour décider de ses entrées de cellule (iOS `MessageCellInputs`,
 * `MessageRowGrouping.candidate`) : sans contenu, sans ViewModel — l'identité, l'auteur, l'heure et
 * la nature de la ligne suffisent à poser la tête et la queue de suite et le dernier reçu.
 */
internal data class ChatRowCandidate(
    val id: String,
    val senderId: String?,
    val isOutgoing: Boolean,
    val createdAtMillis: Long?,
    val isSystem: Boolean = false,
    val isDeleted: Boolean = false,
)

/**
 * Les entrées PRIMITIVES d'une cellule, calculées UNE fois par la liste et remises à la bulle : la
 * bulle ne lit jamais le ViewModel (iOS #10758). Trois booléens, donc comparables à coût nul.
 */
internal data class ChatRowInputs(
    val isLastReceived: Boolean,
    val isFirstInGroup: Boolean,
    val isLastInGroup: Boolean,
) {
    companion object {
        val Standalone = ChatRowInputs(isLastReceived = false, isFirstInGroup = true, isLastInGroup = true)

        /**
         * Les entrées de chaque ligne d'une liste chronologique. Le dernier reçu est le dernier
         * message d'un AUTRE auteur, ni avis système ni supprimé (lui seul porte le smiley d'ajout
         * de réaction). Un avis système ferme et rouvre les suites autour de lui.
         */
        fun of(rows: List<ChatRowCandidate>, zone: ZoneId = ZoneId.systemDefault()): Map<String, ChatRowInputs> {
            val positions = MessageGrouping.positions(
                rows.map { MessageGroupInput(it.id, it.senderId, it.isOutgoing, it.createdAtMillis, it.isSystem) },
                zone,
            )
            val lastReceivedId = rows.lastOrNull { !it.isSystem && !it.isDeleted && !it.isOutgoing }?.id
            return rows.associate { row ->
                val position = positions[row.id]
                row.id to ChatRowInputs(
                    isLastReceived = row.id == lastReceivedId,
                    isFirstInGroup = position?.isFirstInGroup ?: true,
                    isLastInGroup = position?.isLastInGroup ?: true,
                )
            }
        }

        /**
         * Le nombre de destinataires d'un message (iOS `MessageCellInputs.recipientCount`) : un seul en
         * direct ; en groupe, le compte servi s'il existe, sinon les autres membres (deux membres par défaut).
         */
        fun recipientCount(isDirect: Boolean, serverRecipients: Int, memberCount: Int?): Int = when {
            isDirect -> 1
            serverRecipients > 0 -> serverRecipients
            else -> maxOf(1, (memberCount ?: 2) - 1)
        }
    }
}
