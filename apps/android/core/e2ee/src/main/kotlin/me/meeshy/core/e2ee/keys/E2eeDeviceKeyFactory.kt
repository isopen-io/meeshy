package me.meeshy.core.e2ee.keys

import kotlinx.serialization.KSerializer
import me.meeshy.core.e2ee.store.E2eeLocalIdentity
import me.meeshy.core.e2ee.store.MeeshySignalProtocolStore
import me.meeshy.core.e2ee.store.base64
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordTransaction
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.wire.E2eeDeviceBindingProof
import me.meeshy.core.e2ee.wire.E2eeEnrollDeviceRequest
import me.meeshy.core.e2ee.wire.E2eeJson
import me.meeshy.core.e2ee.wire.E2eeOneTimeKey
import me.meeshy.core.e2ee.wire.E2eePlatform
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eePublishKeysRequest
import me.meeshy.core.e2ee.wire.E2eeSignedKey
import org.signal.libsignal.protocol.ecc.ECKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyType
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord

/**
 * Un lot de clés à présenter à la passerelle. [republished] : il lui a déjà été présenté sans réponse probante — elle a pu le
 * ranger et en remettre des clés à des pairs (audit de #19077, P2) —, donc il ne quitte jamais le coffre avec ses clés privées.
 */
public class E2eeKeyBatch<T>(public val request: T, public val republished: Boolean)

/** Les bornes de réapprovisionnement de la spec (§ 3.2), celles d'iOS (`E2EEPreKeyPolicy`). */
public object E2eePreKeyPolicy {
    public const val BATCH_SIZE: Int = 100
    public const val REFILL_BELOW: Int = 20
    public const val ROTATION_INTERVAL_MILLIS: Long = 7L * 24 * 60 * 60 * 1000
}

/**
 * Ce qu'un appareil publie (spec § 3.2, PQXDH § 2.4) et la preuve de liaison de son identité (§ 3.3), miroir de
 * `E2EEDeviceKeyFactory` (iOS). Les parties PRIVÉES sont rangées dans le coffre, dans la MÊME transaction que la
 * composition de ce qui part : une pré-clé publiée a toujours sa clé privée sur l'appareil. Rien de privé ne sort d'ici.
 *
 * Un lot composé reste EN ATTENTE au coffre tant que la passerelle ne l'a pas accepté (#18974) : la tentative suivante le
 * republie (la passerelle écarte un `keyId` qu'elle tient déjà), au lieu d'en tirer un autre — jamais deux cents clés de
 * plus par refus. Un lot DÉJÀ présenté a pu être rangé puis remis, clé par clé, à des pairs (audit de #19077, P2) : il ne
 * quitte jamais le coffre avec ses clés privées, il ne republie que celles que le coffre tient encore, et il ne se republie
 * plus après un (ré)enrôlement, qui efface à la passerelle les pré-clés de la génération et leurs réservations.
 */
public class E2eeDeviceKeyFactory(private val identity: E2eeLocalIdentity, private val vault: RecordVault) {

    public fun enrollment(userId: String, platform: E2eePlatform, label: String?, nowMillis: Long): E2eeKeyBatch<E2eeEnrollDeviceRequest> =
        enrollment(userId, platform, label, nowMillis, E2eePreKeyPolicy.BATCH_SIZE, PENDING_ENROLLMENT)

    /** L'enrôlement d'une installation qui REVIENT (session nouvelle) : sans pré-clés uniques, le réapprovisionnement suit. */
    public fun reenrollment(userId: String, platform: E2eePlatform, label: String?, nowMillis: Long): E2eeKeyBatch<E2eeEnrollDeviceRequest> =
        enrollment(userId, platform, label, nowMillis, 0, PENDING_REENROLLMENT)

    /** La preuve de liaison est toujours celle de l'instant ; les clés d'un enrôlement en attente se représentent telles quelles. */
    private fun enrollment(
        userId: String,
        platform: E2eePlatform,
        label: String?,
        nowMillis: Long,
        oneTimeBatch: Int,
        pending: String,
    ): E2eeKeyBatch<E2eeEnrollDeviceRequest> {
        val identityKey = identity.identityKeyBase64
        val message = E2eeDeviceBindingProof.message(userId, identity.registrationId, identityKey, nowMillis)
        val binding = E2eeDeviceBindingProof(nowMillis, sign(message.toByteArray(Charsets.UTF_8)))
        return vault.write { transaction ->
            val kept = pendingBatch(transaction, pending, E2eeEnrollDeviceRequest.serializer())
                ?.takeIf { it.identityKey == identityKey && it.registrationId == identity.registrationId }
            if (kept != null) return@write E2eeKeyBatch(kept.copy(platform = platform, label = label, binding = binding), republished = true)
            val store = MeeshySignalProtocolStore(identity, transaction)
            val request = E2eeEnrollDeviceRequest(
                registrationId = identity.registrationId,
                identityKey = identityKey,
                signedPreKey = newSignedPreKey(store, transaction, nowMillis),
                kyberLastResort = newKyberPreKey(store, transaction, nowMillis, lastResort = true),
                platform = platform,
                label = label,
                binding = binding,
                oneTimePreKeys = newOneTimePreKeys(store, transaction, oneTimeBatch),
                kyberPreKeys = List(oneTimeBatch) { newKyberPreKey(store, transaction, nowMillis, lastResort = false) },
            )
            keepPending(transaction, pending, E2eeEnrollDeviceRequest.serializer(), request)
            E2eeKeyBatch(request, republished = false)
        }
    }

    /**
     * Le lot en attente, réduit aux clés dont la clé privée est ENCORE au coffre (une clé consommée ne se republie jamais) ;
     * sinon le complément d'un stock passé sous [E2eePreKeyPolicy.REFILL_BELOW] ; `null` s'il n'en manque pas.
     */
    public fun replenishment(stock: E2eePreKeyStock, nowMillis: Long): E2eeKeyBatch<E2eePublishKeysRequest>? = vault.write { transaction ->
        val pending = pendingBatch(transaction, PENDING_REPLENISHMENT, E2eePublishKeysRequest.serializer())?.stillPrivate(transaction)
        if (pending != null) return@write E2eeKeyBatch(pending, republished = true)
        transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_REPLENISHMENT)
        freshReplenishment(stock, nowMillis, transaction)?.let { E2eeKeyBatch(it, republished = false) }
    }

    /** Ce qu'un lot en attente peut encore servir : ses clés que le coffre tient encore ; `null` s'il n'en reste aucune. */
    private fun E2eePublishKeysRequest.stillPrivate(reader: RecordReader): E2eePublishKeysRequest? {
        val oneTime = oneTimePreKeys.orEmpty().filter { reader.load(RecordKind.PRE_KEY, it.keyId.toString()) != null }
        val kyber = kyberPreKeys.orEmpty().filter { reader.load(RecordKind.KYBER_PRE_KEY, it.keyId.toString()) != null }
        if (oneTime.isEmpty() && kyber.isEmpty()) return null
        return copy(oneTimePreKeys = oneTime.ifEmpty { null }, kyberPreKeys = kyber.ifEmpty { null })
    }

    private fun freshReplenishment(stock: E2eePreKeyStock, nowMillis: Long, transaction: RecordTransaction): E2eePublishKeysRequest? {
        val refillEc = stock.oneTimePreKeys < E2eePreKeyPolicy.REFILL_BELOW
        val refillKyber = stock.kyberPreKeys < E2eePreKeyPolicy.REFILL_BELOW
        if (!refillEc && !refillKyber) return null
        val store = MeeshySignalProtocolStore(identity, transaction)
        return E2eePublishKeysRequest(
            oneTimePreKeys = if (refillEc) newOneTimePreKeys(store, transaction, E2eePreKeyPolicy.BATCH_SIZE) else null,
            kyberPreKeys = if (refillKyber) List(E2eePreKeyPolicy.BATCH_SIZE) { newKyberPreKey(store, transaction, nowMillis, lastResort = false) } else null,
        ).also { keepPending(transaction, PENDING_REPLENISHMENT, E2eePublishKeysRequest.serializer(), it) }
    }

    /** La passerelle a rangé le complément : il n'est plus en attente, ses clés privées restent. */
    public fun published() {
        vault.write { it.remove(RecordKind.PENDING_PUBLICATION, PENDING_REPLENISHMENT) }
    }

    /**
     * La passerelle a (ré)enrôlé l'appareil : aucun enrôlement n'est plus en attente, et le complément en attente ne se
     * republie plus — une reprise de place efface à la passerelle les pré-clés de la génération, réservations comprises
     * (audit de #19077, P2). Toutes leurs clés privées restent : un pair peut en tenir une.
     */
    public fun enrolled() {
        vault.write { transaction ->
            transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_ENROLLMENT)
            transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_REENROLLMENT)
            transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_REPLENISHMENT)
        }
    }

    /**
     * Un complément que la passerelle a refusé SANS le ranger. Présenté pour la première fois, il quitte le coffre avec ses
     * clés privées ; déjà présenté sans réponse probante, il ne se republie plus, mais ses clés privées restent.
     */
    public fun replenishmentRefused(batch: E2eeKeyBatch<E2eePublishKeysRequest>) {
        vault.write { transaction ->
            if (!batch.republished) withdrawOneTime(transaction, batch.request.oneTimePreKeys.orEmpty(), batch.request.kyberPreKeys.orEmpty())
            transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_REPLENISHMENT)
        }
    }

    /** Un enrôlement que la passerelle a refusé SANS le ranger : la même règle que [replenishmentRefused]. */
    public fun enrollmentRefused(batch: E2eeKeyBatch<E2eeEnrollDeviceRequest>) {
        vault.write { transaction ->
            if (!batch.republished) withdrawEnrollment(transaction, batch.request)
            transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_ENROLLMENT)
            transaction.remove(RecordKind.PENDING_PUBLICATION, PENDING_REENROLLMENT)
        }
    }

    private fun withdrawEnrollment(transaction: RecordTransaction, request: E2eeEnrollDeviceRequest) {
        withdrawOneTime(transaction, request.oneTimePreKeys, request.kyberPreKeys)
        transaction.remove(RecordKind.SIGNED_PRE_KEY, request.signedPreKey.keyId.toString())
        transaction.remove(RecordKind.KYBER_PRE_KEY, request.kyberLastResort.keyId.toString())
        transaction.remove(RecordKind.KYBER_LAST_RESORT_MARKER, request.kyberLastResort.keyId.toString())
    }

    private fun withdrawOneTime(transaction: RecordTransaction, oneTime: List<E2eeOneTimeKey>, kyber: List<E2eeSignedKey>) {
        oneTime.forEach { transaction.remove(RecordKind.PRE_KEY, it.keyId.toString()) }
        kyber.forEach { transaction.remove(RecordKind.KYBER_PRE_KEY, it.keyId.toString()) }
    }

    /** Un lot en attente illisible (format d'une autre version) se recompose : il ne bloque jamais la préparation. */
    private fun <T> pendingBatch(reader: RecordReader, key: String, serializer: KSerializer<T>): T? {
        val raw = reader.load(RecordKind.PENDING_PUBLICATION, key) ?: return null
        return try {
            E2eeJson.decodeFromString(serializer, raw.decodeToString())
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun <T> keepPending(transaction: RecordTransaction, key: String, serializer: KSerializer<T>, batch: T) {
        transaction.save(RecordKind.PENDING_PUBLICATION, key, E2eeJson.encodeToString(serializer, batch).toByteArray(Charsets.UTF_8))
    }

    private fun sign(message: ByteArray): String = base64(identity.keyPair.privateKey.calculateSignature(message))

    /** Un identifiant neuf par nature de clé, jamais réutilisé sur cet appareil. */
    private fun nextKeyId(transaction: RecordTransaction, counter: String): Int {
        val current = transaction.load(RecordKind.KEY_ID_COUNTER, counter)?.decodeToString()?.toIntOrNull() ?: 0
        val next = if (current >= MAX_KEY_ID) 1 else current + 1
        transaction.save(RecordKind.KEY_ID_COUNTER, counter, next.toString().toByteArray())
        return next
    }

    private fun newSignedPreKey(store: MeeshySignalProtocolStore, transaction: RecordTransaction, nowMillis: Long): E2eeSignedKey {
        val id = nextKeyId(transaction, "signedPreKey")
        val pair = ECKeyPair.generate()
        val publicKey = pair.publicKey.serialize()
        val signature = identity.keyPair.privateKey.calculateSignature(publicKey)
        store.storeSignedPreKey(id, SignedPreKeyRecord(id, nowMillis, pair, signature))
        return E2eeSignedKey(id, base64(publicKey), base64(signature))
    }

    private fun newKyberPreKey(store: MeeshySignalProtocolStore, transaction: RecordTransaction, nowMillis: Long, lastResort: Boolean): E2eeSignedKey {
        val id = nextKeyId(transaction, "kyberPreKey")
        val pair = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
        val publicKey = pair.publicKey.serialize()
        val signature = identity.keyPair.privateKey.calculateSignature(publicKey)
        store.storeKyberPreKey(id, KyberPreKeyRecord(id, nowMillis, pair, signature))
        if (lastResort) store.markKyberPreKeyLastResort(id)
        return E2eeSignedKey(id, base64(publicKey), base64(signature))
    }

    private fun newOneTimePreKeys(store: MeeshySignalProtocolStore, transaction: RecordTransaction, count: Int): List<E2eeOneTimeKey> =
        List(count) {
            val id = nextKeyId(transaction, "preKey")
            val pair = ECKeyPair.generate()
            store.storePreKey(id, PreKeyRecord(id, pair))
            E2eeOneTimeKey(id, base64(pair.publicKey.serialize()))
        }

    private companion object {
        const val MAX_KEY_ID = 0x7FFF_FFFF
        const val PENDING_ENROLLMENT = "enrollment"
        const val PENDING_REENROLLMENT = "reenrollment"
        const val PENDING_REPLENISHMENT = "replenishment"
    }
}
