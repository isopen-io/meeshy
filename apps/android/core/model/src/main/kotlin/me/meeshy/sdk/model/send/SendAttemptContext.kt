package me.meeshy.sdk.model.send

import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEncoder
import me.meeshy.sdk.model.MessageEffectsWire
import java.time.Instant

/**
 * Ce qui est figé au début d'un envoi et lu par chacune de ses étapes — miroir de `SendAttemptContext` (iOS).
 * [clientMessageId] est un `cid_` ; un renvoi depuis l'outbox le RÉUTILISE à l'identique ([reusesExistingRow]).
 */
data class SendAttemptContext(
    val clientMessageId: String,
    val startedAtMillis: Long,
    val effects: MessageEffects,
    val language: String,
    val reusesExistingRow: Boolean = false,
) {
    /** La projection fil des effets : durée éphémère et bits, jamais une échéance locale. */
    val wireEffects: MessageEffectsWire
        get() = MessageEffectsEncoder.encode(effects, Instant.ofEpochMilli(startedAtMillis))

    companion object {
        /** Un envoi neuf (identifiant tiré) ou un renvoi (identifiant [reusing] conservé). */
        fun begin(
            nowMillis: Long,
            effects: MessageEffects,
            language: String,
            reusing: String? = null,
        ): SendAttemptContext {
            require(reusing == null || ClientIdFormat.isValidCid(reusing)) { "clientMessageId must be a cid_ id" }
            return SendAttemptContext(
                clientMessageId = reusing ?: ClientIdFormat.newCid(),
                startedAtMillis = nowMillis,
                effects = effects,
                language = language,
                reusesExistingRow = reusing != null,
            )
        }
    }
}
