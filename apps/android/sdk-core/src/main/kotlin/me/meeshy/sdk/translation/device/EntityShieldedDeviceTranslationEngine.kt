package me.meeshy.sdk.translation.device

import me.meeshy.sdk.model.translation.DeviceTranslationPair
import me.meeshy.sdk.model.translation.TranslationShieldedBatch

/**
 * Le masquage des identités devant n'importe quel moteur (#14333) : nom de l'auteur d'une phrase
 * de partage, adresses, e-mails, @mentions, #hashtags, pseudos nus et émojis ne sont jamais donnés
 * au moteur, et une sortie qui en a perdu un n'est jamais servie — la règle du translator (#14327),
 * portée par [TranslationShieldedBatch]. Miroir de `EntityShieldedDeviceTranslationEngine` (iOS).
 */
class EntityShieldedDeviceTranslationEngine(
    val inner: DeviceTranslationEngine,
) : DeviceTranslationEngine {

    override val engineName: String get() = inner.engineName

    override suspend fun availability(pair: DeviceTranslationPair): DeviceTranslationAvailability =
        inner.availability(pair)

    override suspend fun translate(
        requests: List<DeviceTranslationRequest>,
        pair: DeviceTranslationPair,
    ): List<DeviceTranslationResult> {
        val batch = TranslationShieldedBatch(requests.map { TranslationShieldedBatch.Piece(it.id, it.text) })
        val settlement = batch.settle(engineOutput(batch.requests, pair))
        val retried = settlement.retry?.let { it.settle(engineOutput(it.requests, pair)) }.orEmpty()
        val served = retried + settlement.served
        return requests.mapNotNull { request -> served[request.id]?.let { DeviceTranslationResult(request.id, it) } }
    }

    override fun cancelPending() = inner.cancelPending()

    private suspend fun engineOutput(
        pieces: List<TranslationShieldedBatch.Piece>,
        pair: DeviceTranslationPair,
    ): Map<String, String> {
        if (pieces.isEmpty()) return emptyMap()
        return inner.translate(pieces.map { DeviceTranslationRequest(it.id, it.text) }, pair)
            .associate { it.id to it.text }
    }
}
