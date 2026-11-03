package me.meeshy.sdk.e2ee.libsignal

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.device.E2eeDeviceRegistrar
import me.meeshy.core.e2ee.open.E2eeEnvelopeOpener
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.seal.E2eeMessageSealer
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eeLocalDevice
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.store.E2eePlaintextVault
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.RecordSealer
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.vault.SealedRecordBackend
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eePlatform
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.E2eeServedEnvelope
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import me.meeshy.sdk.model.ApiMessage
import timber.log.Timber

/**
 * L'E2EE libsignal de l'app (#14591, miroir de `EndToEndMessagingRuntime`, iOS) vu par ses consommateurs : l'envoi d'une
 * conversation chiffrée, qui scelle pour chaque appareil de la directe, et le fil, qui lit le clair que CET appareil a
 * déchiffré ou envoyé. Le serveur ne voit jamais ce clair : il ne vit que dans le coffre scellé.
 *
 * Une installation se prépare une fois par compte (enrôlement ou relecture du stock de pré-clés), sous un verrou : deux
 * préparations concurrentes ne tirent jamais deux identités. Tout le travail cryptographique et disque se fait sur IO.
 * Journal : jamais de clair, de clé ni d'identifiant de message — des classes d'erreur et des compteurs.
 */
@Singleton
public class EndToEndMessagingRuntime @Inject internal constructor(
    @ApplicationContext private val context: Context,
    private val directory: RetrofitE2eeDirectoryClient,
) {
    private class Ready(val device: E2eeLocalDevice, val sealer: E2eeMessageSealer, val opener: E2eeEnvelopeOpener)

    private val preparation = Mutex()
    @Volatile private var ready: Ready? = null

    @Volatile private var vaultOpened = false

    /** Un coffre verrouillé (#14634) lève ici ; la prochaine lecture réessaie, rien n'est effacé. */
    private val vault: RecordVault by lazy(LazyThreadSafetyMode.SYNCHRONIZED) { openVault().also { vaultOpened = true } }

    private val _opened = MutableSharedFlow<E2eeOpenOutcome>(extraBufferCapacity = 64)

    /** Chaque enveloppe ouverte, par la socket ou le rattrapage. */
    public val opened: SharedFlow<E2eeOpenOutcome> = _opened.asSharedFlow()

    private val _plaintextVersion = MutableStateFlow(0L)

    /** Avance à chaque clair rangé au coffre : le fil relit sa projection. */
    public val plaintextVersion: StateFlow<Long> = _plaintextVersion.asStateFlow()

    /** L'installation de ce compte, enrôlée une fois ; celle d'un autre compte est oubliée. */
    private suspend fun ready(userId: String): Ready = preparation.withLock {
        ready?.takeIf { it.device.userId == userId }?.let { return@withLock it }
        withContext(Dispatchers.IO) {
            val registrar = E2eeDeviceRegistrar(vault, directory, E2eePlatform.ANDROID, label = DEVICE_LABEL)
            val enrolled = registrar.ensureEnrolled(userId)
            val cipher = E2eeSessionCipher(enrolled.device.address, enrolled.identity, vault)
            Ready(
                enrolled.device,
                E2eeMessageSealer(enrolled.device, cipher, directory, vault),
                E2eeEnvelopeOpener(enrolled.device, cipher, directory, vault),
            ).also { ready = it }
        }
    }

    /** Prépare l'installation (enrôlement, réapprovisionnement) sans rien envoyer : à l'ouverture de session. */
    public suspend fun prepare(userId: String): Boolean = runCatching { ready(userId) }
        .onFailure { Timber.w("e2ee device not prepared: %s", it.javaClass.simpleName) }
        .isSuccess

    /**
     * Scelle [content] pour les appareils de [peerUserId] et mes appareils approuvés, puis le remet par l'envoi
     * libsignal ; un 409 Sesame rechiffre. Le message servi ne porte que le littéral `[Encrypted]`.
     */
    public suspend fun deliver(
        userId: String,
        conversationId: String,
        peerUserId: String,
        content: E2eeContent,
        replyToId: String?,
    ): ApiMessage {
        val device = ready(userId)
        return try {
            withContext(Dispatchers.IO) {
                device.sealer.sealAndDeliver(content, peerUserId) { sealed ->
                    directory.send(conversationId, LibsignalSendRequest.of(content.clientMessageId.orEmpty(), sealed, replyToId))
                }
            }
        } catch (unbound: E2eeRemoteException) {
            if (unbound.code == E2eeErrorCode.DEVICE_NOT_BOUND) forgetDevice(userId)
            throw unbound
        }
    }

    /** Range le clair d'un message que J'AI écrit : l'enveloppe ne revient pas à l'appareil émetteur. */
    public suspend fun remember(userId: String, content: E2eeContent, messageIds: Collection<String>): Boolean = runCatching {
        ready(userId)
        withContext(Dispatchers.IO) { E2eePlaintextVault(vault, owner = userId).save(E2eePlaintextEntry.Readable(content, userId), messageIds) }
        _plaintextVersion.update { it + 1 }
    }.onFailure { Timber.e("e2ee own plaintext not stored: %s", it.javaClass.simpleName) }.isSuccess

    /** Ce que cet appareil sait de ces messages, pour [userId] seulement (#13000). */
    public suspend fun plaintexts(userId: String, messageIds: Collection<String>): Map<String, E2eePlaintextEntry> {
        if (messageIds.isEmpty()) return emptyMap()
        return withContext(Dispatchers.IO) {
            runCatching { E2eePlaintextVault(vault, owner = userId).entries(messageIds) }
                .onFailure { Timber.e("e2ee plaintexts unreadable: %s", it.javaClass.simpleName) }
                .getOrDefault(emptyMap())
        }
    }

    /**
     * Retire du coffre le clair de messages supprimés, échus ou vus une fois (#14633), pour [userId] seulement. Un appareil
     * qui n'a jamais ouvert de coffre n'a rien à retirer : aucun coffre n'est créé pour cela.
     */
    public suspend fun erase(userId: String, messageIds: Collection<String>): Boolean {
        if (messageIds.isEmpty() || !holdsVault()) return true
        return runCatching {
            withContext(Dispatchers.IO) { E2eePlaintextVault(vault, owner = userId).remove(messageIds) }
            _plaintextVersion.update { it + 1 }
        }.onFailure { Timber.w("e2ee plaintexts not erased: %s", it.javaClass.simpleName) }.isSuccess
    }

    /**
     * Retire du coffre le clair de chaque message de [conversationId] composé jusqu'à [composedUpTo] (#14655) : une
     * conversation supprimée ne laisse rien, même des messages que le cache n'a jamais tenus.
     */
    public suspend fun eraseConversation(userId: String, conversationId: String, composedUpTo: Long): Boolean {
        if (!holdsVault()) return true
        return runCatching {
            withContext(Dispatchers.IO) { E2eePlaintextVault(vault, owner = userId).removeConversation(conversationId, composedUpTo) }
            _plaintextVersion.update { it + 1 }
        }.onFailure { Timber.w("e2ee conversation plaintexts not erased: %s", it.javaClass.simpleName) }.isSuccess
    }

    private fun holdsVault(): Boolean = vaultOpened || File(File(context.noBackupFilesDir, VAULT_DIRECTORY), VAULT_KEY_FILE).isFile

    /** Le clair d'UN message (le renvoi d'une bulle en attente). */
    public suspend fun plaintext(userId: String, messageId: String): E2eePlaintextEntry? = plaintexts(userId, listOf(messageId))[messageId]

    public suspend fun receive(userId: String, envelope: E2eeServedEnvelope) {
        val device = runCatching { ready(userId) }.getOrElse { return }
        val outcome = withContext(Dispatchers.IO) { device.opener.receive(envelope) }
        publish(listOf(outcome))
    }

    public suspend fun catchUp(userId: String) {
        val device = runCatching { ready(userId) }.getOrElse {
            Timber.w("e2ee catch-up skipped: %s", it.javaClass.simpleName)
            return
        }
        val outcomes = runCatching { withContext(Dispatchers.IO) { device.opener.catchUp() } }
            .onFailure { Timber.w("e2ee catch-up failed: %s", it.javaClass.simpleName) }
            .getOrDefault(emptyList())
        publish(outcomes)
    }

    /** À la fermeture de session : l'installation se relira à la prochaine. Le coffre reste (même compte, même historique). */
    public fun forget() {
        ready = null
    }

    private fun forgetDevice(userId: String) {
        if (ready?.device?.userId == userId) ready = null
    }

    private fun publish(outcomes: List<E2eeOpenOutcome>) {
        if (outcomes.any { it is E2eeOpenOutcome.Opened || it is E2eeOpenOutcome.Undecryptable }) _plaintextVersion.update { it + 1 }
        outcomes.forEach { _opened.tryEmit(it) }
    }

    /** Le coffre : la clé enveloppée par le Keystore, la base dédiée ([EndToEndVaultOpening] dit quand on efface). */
    private fun openVault(): RecordVault {
        val directory = File(context.noBackupFilesDir, VAULT_DIRECTORY)
        val database = File(directory, VAULT_DATABASE)
        return EndToEndVaultOpening.open(
            key = { KeystoreVaultKey(directory).open() },
            wipe = { context.deleteDatabase(database.absolutePath) },
            sealed = { key -> TransactionalRecordVault(SealedRecordBackend(SqliteRecordBackend(context, database), RecordSealer(key))) },
            memory = { TransactionalRecordVault(InMemoryRecordBackend()) },
        )
    }

    private companion object {
        /** La plateforme, jamais le modèle ni le nom de l'appareil (iOS : « iPhone », « iPad », « Mac »). */
        const val DEVICE_LABEL = "Android"
        const val VAULT_DIRECTORY = "e2ee"
        const val VAULT_DATABASE = "vault.db"
        const val VAULT_KEY_FILE = "vault.key"
    }
}
