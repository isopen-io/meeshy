package me.meeshy.sdk.appearance

import java.io.File
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackSummary
import me.meeshy.sdk.model.appearance.ServedAppearanceContract
import me.meeshy.sdk.model.appearance.ServedAppearanceContracts
import me.meeshy.sdk.model.appearance.ServedAppearancePack
import me.meeshy.sdk.session.PerAccountCache

/** Ce qui va chercher les octets d'un contrat (`GET /api/v1/pack-assets/<sha16>.json`). */
fun interface ServedContractFetching {
    suspend fun fetch(src: String): ByteArray
}

/** L'horloge de la reprise après un échec, en millisecondes. */
fun interface ServedContractClock {
    fun nowMillis(): Long
}

/**
 * **Les contrats servis des packs d'apparence non embarqués** (#16265) — miroir de `createContractLoader` (web) et de la
 * lecture adressée par contenu d'iOS.
 *
 * - **Vérifié** : un contrat ne se lit que si son SHA-256 commence par le préfixe de son adresse (et vaut l'empreinte
 *   complète quand le résumé du pack la sert). Un contenu altéré en route ne s'écrit jamais ; altéré sur le disque, il se
 *   retélécharge.
 * - **Cache d'abord** : la mémoire, puis le disque (`noBackupFilesDir`, un fichier par adresse — immuable, donc jamais
 *   revalidé), puis le réseau, une requête pour des demandes simultanées.
 * - **Hors ligne** : les packs installés du lecteur (slug → adresse) sont gardés sur le disque avec leur DERNIER contrat
 *   valide ; [restore] les repeint au démarrage sans réseau, et une nouvelle version qui échoue laisse l'ancienne en place.
 *
 * Chaque changement part vers [sink] — le chargeur du catalogue, qui complète ce qu'il sert à tous les écrans.
 */
class ServedAppearanceContractStore(
    private val directory: File,
    private val fetcher: ServedContractFetching,
    private val io: CoroutineDispatcher,
    private val sink: (ServedAppearanceContracts) -> Unit,
    private val clock: ServedContractClock = ServedContractClock(System::currentTimeMillis),
) : PerAccountCache {

    private val state = MutableStateFlow(ServedAppearanceContracts.EMPTY)

    /** Ce que l'appareil sait peindre au-delà de l'APK. */
    val contracts: StateFlow<ServedAppearanceContracts> = state.asStateFlow()

    private val lock = Mutex()
    private val inFlight = HashMap<String, Deferred<ServedAppearanceContract?>>()
    private val failedAt = HashMap<String, Long>()
    private val scope = CoroutineScope(SupervisorJob() + io)

    /** Repeint, sans réseau, les packs installés gardés sur le disque avec leur dernier contrat valide. */
    suspend fun restore() {
        val index = readIndex() ?: return
        val packs = index.mapNotNull { (wire, entries) ->
            val domain = AppearancePackDomain.entries.firstOrNull { it.wire == wire } ?: return@mapNotNull null
            domain to entries.mapNotNull { entry -> entry.takeIf { fromDisk(it.src) != null }?.toPack() }
        }.toMap()
        publish { current -> current.copy(packs = packs + current.packs) }
    }

    /**
     * Les packs installés d'un domaine viennent d'être lus : leurs contrats se chargent (cache d'abord), et la liste du
     * domaine REMPLACE la précédente — un pack retiré ne se peint plus. `null` (panne) ne conclut rien.
     */
    suspend fun sync(domain: AppearancePackDomain, installed: List<InstalledPackSummary>?) {
        if (installed == null) return
        val previous = state.value.packs[domain].orEmpty().associateBy { it.slug }
        val packs = installed.filter { it.isServed }.mapNotNull { summary ->
            val ref = summary.contract ?: return@mapNotNull null
            val names = summary.localizedNames
            when {
                contract(ref.src, ref.sha256) != null -> ServedAppearancePack(summary.slug, ref.src, names)
                else -> previous[summary.slug]?.copy(names = names)
            }
        }
        publish { current -> current.copy(packs = current.packs + (domain to packs)) }
        writeIndex()
    }

    /** Le décor d'autrui demande [src] : chargé en tâche de fond, sans bloquer le rendu ; un échec récent attend sa reprise. */
    fun request(src: String) {
        if (!ServedAppearanceContract.isAddress(src) || state.value.byAddress.containsKey(src)) return
        scope.launch { contract(src, sha256 = null) }
    }

    /** Le contrat de [src] : mémoire, disque vérifié, puis réseau vérifié et gardé. `null` : absent, altéré ou illisible. */
    suspend fun contract(src: String, sha256: String?): ServedAppearanceContract? {
        if (!ServedAppearanceContract.isAddress(src)) return null
        state.value.byAddress[src]?.let { return it }
        fromDisk(src, sha256)?.let { return it }
        return download(src, sha256)
    }

    /** Un autre compte s'ouvre : ses packs installés ne sont pas les miens. Les contrats, publics et immuables, restent. */
    override suspend fun clear() {
        publish { current -> current.copy(packs = emptyMap()) }
        withContext(io) { File(directory, INDEX).delete() }
    }

    private suspend fun download(src: String, sha256: String?): ServedAppearanceContract? {
        val running = lock.withLock {
            val failed = failedAt[src]
            if (failed != null && clock.nowMillis() - failed < RETRY_AFTER_MS) return null
            inFlight.getOrPut(src) {
                scope.async {
                    try {
                        fetchVerified(src, sha256)
                    } finally {
                        lock.withLock { inFlight.remove(src) }
                    }
                }
            }
        }
        return running.await()
    }

    private suspend fun fetchVerified(src: String, sha256: String?): ServedAppearanceContract? {
        val contract = try {
            val bytes = fetcher.fetch(src)
            if (bytes.size > MAX_BYTES || !ServedAppearanceContract.verifies(src, bytes, sha256)) null
            else ServedAppearanceContract.parse(bytes.toString(Charsets.UTF_8))?.also { write(src, bytes) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        lock.withLock { if (contract == null) failedAt[src] = clock.nowMillis() else failedAt.remove(src) }
        contract?.let { found -> publish { it.copy(byAddress = it.byAddress + (src to found)) } }
        return contract
    }

    private suspend fun fromDisk(src: String, sha256: String? = null): ServedAppearanceContract? {
        val found = withContext(io) {
            val file = File(directory, src)
            val bytes = runCatching { file.readBytes() }.getOrNull() ?: return@withContext null
            val parsed = bytes.takeIf { ServedAppearanceContract.verifies(src, it, sha256) }
                ?.let { ServedAppearanceContract.parse(it.toString(Charsets.UTF_8)) }
            if (parsed == null && sha256 == null) file.delete()
            parsed
        } ?: return null
        publish { it.copy(byAddress = it.byAddress + (src to found)) }
        return found
    }

    private suspend fun write(src: String, bytes: ByteArray) = withContext(io) {
        runCatching {
            directory.mkdirs()
            val temp = File(directory, "$src.part")
            temp.writeBytes(bytes)
            if (!temp.renameTo(File(directory, src))) {
                temp.delete()
                throw IOException("écriture impossible : $src")
            }
        }
    }

    private fun publish(change: (ServedAppearanceContracts) -> ServedAppearanceContracts) {
        state.update(change)
        sink(state.value)
    }

    private suspend fun readIndex(): Map<String, List<IndexEntry>>? = withContext(io) {
        runCatching { JSON.decodeFromString<Map<String, List<IndexEntry>>>(File(directory, INDEX).readText()) }.getOrNull()
    }

    private suspend fun writeIndex() = withContext(io) {
        val index = state.value.packs.map { (domain, packs) -> domain.wire to packs.map(::IndexEntry) }.toMap()
        runCatching {
            directory.mkdirs()
            val temp = File(directory, "$INDEX.part")
            temp.writeText(JSON.encodeToString(index))
            temp.renameTo(File(directory, INDEX))
        }
    }

    @Serializable
    private data class IndexEntry(val slug: String, val src: String, val names: Map<String, String> = emptyMap()) {
        constructor(pack: ServedAppearancePack) : this(pack.slug, pack.src, pack.names)

        fun toPack() = ServedAppearancePack(slug, src, names)
    }

    companion object {
        /** `noBackupFilesDir/meeshy-appearance-contracts` : hors sauvegarde automatique, jamais évincé comme un cache. */
        const val DIRECTORY = "meeshy-appearance-contracts"
        private const val INDEX = "installed.json"

        /** Un contrat de pack est un JSON de quelques dizaines de Ko ; au-delà, il est refusé sans être lu. */
        private const val MAX_BYTES = 2 * 1024 * 1024

        /** Un contrat introuvable ne se redemande pas à chaque image : une minute entre deux essais. */
        const val RETRY_AFTER_MS = 60_000L
        private val JSON = Json { ignoreUnknownKeys = true }
    }
}
