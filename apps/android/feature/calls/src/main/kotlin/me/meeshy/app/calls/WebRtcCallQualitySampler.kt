package me.meeshy.app.calls

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onCompletion
import me.meeshy.sdk.call.CallQualityStatsFeed
import me.meeshy.sdk.call.CallStatsCollector
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallQualityThresholds
import me.meeshy.sdk.model.call.CallQualityTick
import me.meeshy.sdk.model.call.CallStats
import javax.inject.Inject
import javax.inject.Singleton

/**
 * L'échantillonneur réel : toutes les 5 s, une lecture des statistiques du pair, réduite en
 * [CallQualitySample] (perte DELTA, jamais le compteur cumulé) et relayée au [CallQualityStatsFeed].
 * Il ne décide rien — seuils et lois sont dans `:core:model`. À l'arrêt de la collecte (fin d'appel,
 * média coupé), la dernière lecture est effacée : aucune barre fantôme.
 */
@Singleton
class WebRtcCallQualitySampler internal constructor(
    private val collector: suspend () -> CallStats?,
    private val feed: CallQualityStatsFeed,
    private val clock: CallClock,
    private val intervalMs: Long,
) : CallQualitySampler {
    @Inject
    constructor(
        collector: CallStatsCollector,
        feed: CallQualityStatsFeed,
        clock: CallClock,
    ) : this(collector::collect, feed, clock, CallQualityThresholds.STATS_INTERVAL_SECONDS * 1_000L)

    private suspend fun readOrNull(): CallStats? = try {
        collector()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    override val samples: Flow<CallQualitySample> = flow {
        var previous: CallStats? = null
        while (true) {
            delay(intervalMs)
            val stats = readOrNull() ?: continue
            val interval = stats.intervalQualitySample(previous)
            previous = stats
            feed.record(
                CallQualityTick(
                    atMs = clock.nowMs(),
                    rttMs = stats.roundTripTimeMs,
                    packetLossPercent = interval.packetLoss * 100.0,
                    jitterMs = stats.jitterMs,
                    inboundAudioBytes = stats.inboundAudioBytes.toLong(),
                    inboundVideoBytes = stats.inboundVideoBytes.toLong(),
                    relayed = stats.relayed,
                ),
            )
            emit(
                interval.copy(
                    jitterMs = stats.jitterMs,
                    bytesSent = stats.bandwidth.toLong(),
                    bytesReceived = stats.bytesReceived.toLong(),
                    availableOutgoingBitrateBps = stats.availableOutgoingBitrateBps,
                ),
            )
        }
    }.onCompletion { feed.reset() }
}
