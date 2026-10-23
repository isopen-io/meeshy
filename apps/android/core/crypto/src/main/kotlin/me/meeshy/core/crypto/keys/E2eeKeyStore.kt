package me.meeshy.core.crypto.keys

import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.core.crypto.primitives.CryptoException
import me.meeshy.core.crypto.primitives.Ed25519Signer
import me.meeshy.core.crypto.primitives.RandomSource
import me.meeshy.core.crypto.primitives.SecureRandomSource
import me.meeshy.core.crypto.primitives.X25519Agreement
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore

/**
 * Le coffre porte (ou a pu porter) une identité E2EE qu'on ne sait pas relire. Rien n'est régénéré
 * ni écrasé : la publication est bloquée jusqu'à [E2eeKeyStore.resetIdentity], décision consciente.
 */
public class E2eeIdentityUnreadableException : Exception("Identité E2EE illisible : réinitialisation explicite requise")

/** Une paire X25519. [toString] n'imprime rien : la clé privée ne doit jamais atteindre un journal. */
public class X25519KeyPair(internal val privateKey: ByteArray, public val publicKey: ByteArray) {
    override fun toString(): String = "X25519KeyPair"
}

/**
 * Les clés E2EE de CET appareil, dans le coffre sous le préfixe `me.meeshy.e2ee.` (parité
 * `E2EEService` iOS). Chaque `getOrGenerate*` est idempotent : la clé naît une fois, est écrite
 * dans le coffre, puis relue à l'identique. Une clé qu'on ne peut pas persister n'est jamais
 * rendue — la publier ferait un bundle dont la clé privée est perdue.
 *
 * Seul un coffre qui répond « absent » autorise la naissance d'une clé : une valeur illisible,
 * indécodable ou de taille inattendue lève [E2eeIdentityUnreadableException] sans rien écrire.
 *
 * La clé de signature Ed25519 est DISTINCTE des clés d'accord X25519.
 */
public class E2eeKeyStore(
    private val vault: SecureStore,
    private val account: String?,
    private val random: RandomSource = SecureRandomSource,
    private val ids: StableIdSource = RandomStableIdSource(random),
) {
    private val lock = Any()

    init {
        require(!account.isNullOrBlank()) { "Un compte est requis : une clé nue sortirait de l'espace du compte" }
    }

    public fun getOrGenerateIdentityKey(): X25519KeyPair = agreementKey(IDENTITY_KEY)

    public fun getOrGenerateSignedPreKey(): X25519KeyPair = agreementKey(SIGNED_PRE_KEY)

    public fun getOrGenerateOneTimePreKey(): X25519KeyPair = agreementKey(ONE_TIME_PRE_KEY)

    public fun getOrGenerateSigningKey(): Ed25519Signer = synchronized(lock) {
        val seed = readSeed(SIGNING_KEY)
        if (seed != null) return Ed25519Signer.fromSeed(seed)
        val fresh = random.nextBytes(SEED_LENGTH)
        persist(SIGNING_KEY, fresh)
        Ed25519Signer.fromSeed(fresh)
    }

    public fun registrationId(): Int = stableId(REGISTRATION_ID)

    public fun preKeyId(): Int = stableId(PRE_KEY_ID)

    public fun signedPreKeyId(): Int = stableId(SIGNED_PRE_KEY_ID)

    /** Sortie CONSENTIE d'une identité illisible ou revendiquée ailleurs : efface tout et reconnaît le coffre. */
    public fun resetIdentity() {
        clearAll()
        vault.acknowledgeRecovery(account)
    }

    /** Efface toutes les clés E2EE de ce compte — sans toucher au reste du coffre. */
    public fun clearAll() {
        synchronized(lock) { ALL_KEYS.forEach { vault.remove(it, account) } }
    }

    private fun agreementKey(name: String): X25519KeyPair = synchronized(lock) {
        val existing = readSeed(name)
        if (existing != null) return X25519KeyPair(existing, X25519Agreement.publicKey(existing))
        val fresh = X25519Agreement.generatePrivateKey()
        persist(name, fresh)
        X25519KeyPair(fresh, X25519Agreement.publicKey(fresh))
    }

    private fun stableId(name: String): Int = synchronized(lock) {
        when (val stored = vault.read(name, account)) {
            SecureRead.Unreadable -> throw E2eeIdentityUnreadableException()
            is SecureRead.Present -> StableIdCodec.decode(stored.value)?.let { return it }
            SecureRead.Absent -> Unit
        }
        val fresh = ids.nextId()
        if (!vault.put(name, StableIdCodec.encode(fresh), account)) throw CryptoException("Identifiant E2EE non persisté")
        fresh
    }

    private fun readSeed(name: String): ByteArray? = when (val stored = vault.read(name, account)) {
        SecureRead.Absent -> null
        SecureRead.Unreadable -> throw E2eeIdentityUnreadableException()
        is SecureRead.Present -> CanonicalBase64.decode(stored.value)?.takeIf { it.size == SEED_LENGTH }
            ?: throw E2eeIdentityUnreadableException()
    }

    private fun persist(name: String, bytes: ByteArray) {
        if (!vault.put(name, CanonicalBase64.encode(bytes), account)) throw CryptoException("Clé E2EE non persistée")
    }

    public companion object {
        private const val SEED_LENGTH = 32
        public const val PREFIX: String = "me.meeshy.e2ee."
        private const val IDENTITY_KEY = PREFIX + "identityKey"
        private const val SIGNED_PRE_KEY = PREFIX + "signedPreKey"
        private const val SIGNING_KEY = PREFIX + "signingKey"
        private const val ONE_TIME_PRE_KEY = PREFIX + "otpk.1"
        private const val REGISTRATION_ID = PREFIX + "registrationId"
        private const val PRE_KEY_ID = PREFIX + "preKeyId"
        private const val SIGNED_PRE_KEY_ID = PREFIX + "signedPreKeyId"
        private val ALL_KEYS = listOf(
            IDENTITY_KEY, SIGNED_PRE_KEY, SIGNING_KEY, ONE_TIME_PRE_KEY, REGISTRATION_ID, PRE_KEY_ID, SIGNED_PRE_KEY_ID,
        )
    }
}
