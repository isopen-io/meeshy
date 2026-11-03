package me.meeshy.sdk.model.call

/**
 * Ce que rend un [HalfOpenMonitorState.evaluate] : le verdict (`null` une fois l'époque réglée) et
 * l'état suivant, à garder pour le prochain tick.
 */
data class HalfOpenStep(val outcome: HalfOpenOutcome?, val state: HalfOpenMonitorState)

/**
 * Détection du lien à moitié ouvert à travers les ÉPOQUES de connexion — port de iOS
 * `HalfOpenMonitorState` (#8270). Valeur immuable.
 *
 * Deux défauts du drapeau local à la boucle de scrutation sont corrigés : il n'était réarmé que si la
 * boucle OBSERVAIT la reconnexion (un cycle bouclé entre deux ticks laissait l'auto-guérison gelée), et
 * il comparait des compteurs RTP CUMULÉS au seuil (le trafic d'avant le restart déclarait « sain » un
 * lien de nouveau à moitié ouvert). Le propriétaire incrémente l'époque à chaque passage en Connected ;
 * l'état se réarme au changement d'époque, photographie les compteurs comme base et n'évalue que des
 * DELTAS par époque.
 *
 * L'auto-guérison est UNIQUE par appel, pas par époque : un pair qui n'envoie jamais de RTP (son unité
 * audio arrêtée) bouclerait sinon guérison → reconnexion → rattrapage toutes les quelques secondes.
 * Une fois la guérison dépensée, une époque figée reste en attente (et dit « sain » si le média revient).
 */
data class HalfOpenMonitorState(
    private val observedEpoch: Int = Int.MIN_VALUE,
    private val settled: Boolean = false,
    private val epochStartMs: Long = 0L,
    private val baselineInbound: Int = 0,
    private val baselineOutbound: Int = 0,
    private val healSpent: Boolean = false,
) {
    /** Pré-contrôle bon marché : une fois l'époque réglée, la lecture (coûteuse) des statistiques est sautée. */
    fun needsEvaluation(epoch: Int): Boolean = epoch != observedEpoch || !settled

    fun evaluate(
        epoch: Int,
        inboundPackets: Int,
        outboundPackets: Int,
        nowMs: Long,
        requiredInboundPackets: Int = CallQualityThresholds.RTP_GATE_REQUIRED_PACKETS,
        graceSeconds: Double = CallQualityThresholds.HALF_OPEN_HEAL_GRACE_SECONDS,
    ): HalfOpenStep {
        val armed = if (epoch != observedEpoch) {
            copy(
                observedEpoch = epoch,
                settled = false,
                epochStartMs = nowMs,
                baselineInbound = inboundPackets,
                baselineOutbound = outboundPackets,
            )
        } else {
            this
        }
        if (armed.settled) return HalfOpenStep(null, armed)
        val outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets = inboundPackets - armed.baselineInbound,
            outboundPackets = outboundPackets - armed.baselineOutbound,
            secondsInConnected = (nowMs - armed.epochStartMs) / MS_PER_SECOND,
            requiredInboundPackets = requiredInboundPackets,
            graceSeconds = graceSeconds,
        )
        return when {
            outcome == HalfOpenOutcome.Healthy -> HalfOpenStep(outcome, armed.copy(settled = true))
            outcome == HalfOpenOutcome.HealHalfOpen && armed.healSpent -> HalfOpenStep(HalfOpenOutcome.Waiting, armed)
            outcome == HalfOpenOutcome.HealHalfOpen -> HalfOpenStep(outcome, armed.copy(settled = true, healSpent = true))
            else -> HalfOpenStep(outcome, armed)
        }
    }

    private companion object {
        const val MS_PER_SECOND = 1_000.0
    }
}
