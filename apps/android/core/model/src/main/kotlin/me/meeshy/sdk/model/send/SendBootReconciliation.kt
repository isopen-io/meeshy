package me.meeshy.sdk.model.send

/** L'état local d'une bulle d'envoi, tel que la ligne Room le porte. */
enum class BootSendState { SENDING, FAILED }

/** Ce que la file durable sait d'un envoi : sa ligne est absente, vivante (à envoyer / en vol) ou épuisée. */
enum class OutboxPresence { ABSENT, LIVE, EXHAUSTED }

/** Une bulle d'envoi locale à confronter à la file. */
data class BootSendRow(val id: String, val state: BootSendState)

/** La bulle [id] passe à l'état [to]. */
data class BootSendTransition(val id: String, val to: BootSendState)

/**
 * Au démarrage, une bulle et sa ligne d'outbox peuvent s'être séparées (arrêt du processus entre l'insertion
 * de la bulle et l'enfilage, ou entre l'épuisement de la ligne et la marque de la bulle). La bulle ne ment alors
 * jamais : un envoi sans file passe en échec (renvoyable), un envoi en échec dont la file repart revient à
 * l'envoi. Miroir du rattrapage au démarrage d'iOS.
 */
object SendBootReconciliation {

    fun plan(rows: List<BootSendRow>, outbox: (String) -> OutboxPresence): List<BootSendTransition> =
        rows.mapNotNull { row ->
            val target = when (row.state) {
                BootSendState.SENDING -> if (outbox(row.id) == OutboxPresence.LIVE) null else BootSendState.FAILED
                BootSendState.FAILED -> if (outbox(row.id) == OutboxPresence.LIVE) BootSendState.SENDING else null
            }
            target?.let { BootSendTransition(row.id, it) }
        }
}
