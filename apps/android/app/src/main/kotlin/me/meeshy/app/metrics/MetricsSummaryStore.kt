package me.meeshy.app.metrics

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.metrics.PayloadSummary
import me.meeshy.sdk.model.metrics.SignpostInput
import me.meeshy.sdk.model.metrics.TrackedSignpostAggregate

/** Persistance locale brute du magasin (une chaîne JSON) : SharedPreferences en production, mémoire en test. */
interface MetricsPersistence {
    fun read(): String?
    fun write(value: String)
}

@Singleton
class SharedPrefsMetricsPersistence @Inject constructor(
    @ApplicationContext context: Context,
) : MetricsPersistence {
    private val prefs = context.getSharedPreferences("meeshy_metrics_summaries", Context.MODE_PRIVATE)
    override fun read(): String? = prefs.getString(KEY, null)
    override fun write(value: String) { prefs.edit().putString(KEY, value).apply() }

    private companion object { const val KEY = "state" }
}

@Serializable
internal data class MetricsState(
    val summaries: List<PayloadSummary> = emptyList(),
    val aggregates: List<TrackedSignpostAggregate> = emptyList(),
)

/**
 * Magasin LOCAL des résumés quotidiens et agrégats de sections suivies (miroir de l'état de
 * `MeeshyMetricsSubscriber`). Rien ne quitte l'appareil ici : l'envoi éventuel est conditionné à la préférence
 * de télémétrie, ailleurs. Accès sérialisés par le moniteur de l'instance ; l'horloge est injectée.
 */
@Singleton
class MetricsSummaryStore(
    private val persistence: MetricsPersistence,
    private val clock: () -> Long,
    private val trackedCategories: Set<String> = TrackedSignpostAggregate.MediaCategories,
) {
    @Inject constructor(persistence: SharedPrefsMetricsPersistence) :
        this(persistence, System::currentTimeMillis)

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private var state: MetricsState = load()

    val payloadSummaries: List<PayloadSummary> @Synchronized get() = state.summaries
    val aggregates: List<TrackedSignpostAggregate> @Synchronized get() = state.aggregates

    @Synchronized
    fun consume(summaries: List<PayloadSummary>): Int {
        if (summaries.isEmpty()) return 0
        state = state.copy(summaries = PayloadSummary.retain(state.summaries, summaries))
        save()
        return summaries.size
    }

    @Synchronized
    @JvmName("consumeSignposts")
    fun consume(signposts: List<SignpostInput>): Int {
        val kept = TrackedSignpostAggregate.fromInputs(signposts, trackedCategories, clock())
        if (kept.isEmpty()) return 0
        state = state.copy(aggregates = (state.aggregates + kept).takeLast(MAX_AGGREGATES))
        save()
        return kept.size
    }

    @Synchronized
    fun reset() {
        state = MetricsState()
        save()
    }

    private fun load(): MetricsState = runCatching {
        persistence.read()?.let { json.decodeFromString<MetricsState>(it) }
    }.getOrNull() ?: MetricsState()

    private fun save() = persistence.write(json.encodeToString(MetricsState.serializer(), state))

    private companion object { const val MAX_AGGREGATES = 200 }
}
