package me.meeshy.ui.component.media

import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSink
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSink
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * **L'époque du compte d'un cache média** (#13573). La purge d'un changement de compte la fait avancer ; ce qu'un
 * lecteur a commencé avant elle ne s'écrit plus après elle.
 *
 * `SimpleCache` ne retire pas un contenu verrouillé en écriture, et un lecteur encore actif à la purge pouvait valider
 * (`commitFile`) un tronçon APRÈS elle : des octets obtenus avec le jeton du compte quitté restaient sur le disque. La
 * validation et la purge passent donc par le même verrou — validée avant, la purge l'emporte ; demandée après, elle est
 * refusée et le fichier part.
 *
 * Un tronçon COMMENCÉ et pas encore validé est déjà sur le disque sous son nom définitif, et `SimpleCache` l'adopterait
 * au démarrage suivant si le processus mourait avant sa validation : chaque écriture se fait donc [within] son époque,
 * chaque fichier commencé est [track]é, et la fermeture d'une époque supprime ceux qu'elle laisse en cours. Une écriture
 * demandée après la fermeture échoue AVANT de toucher le disque ; une écriture en cours la fait attendre.
 */
internal class AccountEpochGate {
    private val lock = ReentrantReadWriteLock()
    private val pending: MutableSet<File> = ConcurrentHashMap.newKeySet()

    @Volatile
    var epoch: Long = 0L
        private set

    /** Ferme l'époque courante, supprime ce qu'elle laisse en cours d'écriture, puis [purge]. */
    fun close(purge: () -> Unit) = lock.write {
        epoch += 1
        pending.forEach { it.delete() }
        pending.clear()
        purge()
    }

    /** Exécute [block] dans l'époque [stamp] ; close, elle lève [AccountChangedException] sans rien écrire. */
    fun <T> within(stamp: Long, block: () -> T): T = lock.read {
        if (stamp != epoch) throw AccountChangedException()
        block()
    }

    /** [file] s'écrit dans l'époque courante : il part avec elle s'il n'est pas validé avant. À appeler [within]. */
    fun track(file: File) {
        pending += file
    }

    /** [file] n'est plus en cours : son écriture a échoué, il part. */
    fun abandon(file: File) {
        pending -= file
        file.delete()
    }

    /** Valide [file], commencé à l'époque [stamp], si elle est toujours la courante ; sinon [discard]. */
    fun commitIfCurrent(stamp: Long, file: File, commit: () -> Unit, discard: () -> Unit) = lock.read {
        pending -= file
        if (stamp == epoch) commit() else discard()
    }
}

/** Le flux d'un lecteur dont le compte a changé depuis son ouverture : il s'arrête, rien de plus n'arrive du réseau. */
internal class AccountChangedException : IOException("le compte a changé pendant la lecture du média")

/** Les sources réseau d'un cache média : un flux ouvert à une époque close s'arrête à sa lecture suivante. */
@UnstableApi
internal class AccountFencedDataSourceFactory(
    private val upstream: DataSource.Factory,
    private val gate: AccountEpochGate,
) : DataSource.Factory {
    override fun createDataSource(): DataSource = AccountFencedDataSource(upstream.createDataSource(), gate)
}

/**
 * L'époque est relevée AVANT la requête : une réponse qui arrive après la purge à une requête partie avant elle — donc
 * sous le jeton du compte quitté — n'est pas lue.
 */
@UnstableApi
internal class AccountFencedDataSource(
    private val delegate: DataSource,
    private val gate: AccountEpochGate,
) : DataSource by delegate {
    private var stamp: Long = gate.epoch

    override fun open(dataSpec: DataSpec): Long {
        stamp = gate.epoch
        val length = delegate.open(dataSpec)
        if (gate.epoch != stamp) {
            delegate.close()
            throw AccountChangedException()
        }
        return length
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (gate.epoch != stamp) throw AccountChangedException()
        return delegate.read(buffer, offset, length)
    }
}

/**
 * L'écriture d'un cache média : chaque tronçon porte l'époque de son flux, s'écrit dans elle et ne se valide que dans
 * elle. L'ouverture et chaque écriture passent [AccountEpochGate.within] : c'est là que `CacheDataSink` commence ses
 * fichiers, donc aucun ne naît, ni ne grossit, après la fermeture de son époque.
 */
@UnstableApi
internal class AccountFencedSinkFactory(
    private val cache: Cache,
    private val gate: AccountEpochGate,
) : DataSink.Factory {
    override fun createDataSink(): DataSink {
        val fenced = AccountFencedCache(cache, gate)
        val sink = CacheDataSink(fenced, CacheDataSink.DEFAULT_FRAGMENT_SIZE)
        return object : DataSink {
            override fun open(dataSpec: DataSpec) {
                fenced.openStream()
                gate.within(fenced.streamEpoch) { sink.open(dataSpec) }
            }

            override fun write(buffer: ByteArray, offset: Int, length: Int) =
                gate.within(fenced.streamEpoch) { sink.write(buffer, offset, length) }

            override fun close() = sink.close()
        }
    }
}

/** La vue du cache qu'écrit UN flux : elle date chaque tronçon et refuse d'en valider un d'une époque close. */
@UnstableApi
internal class AccountFencedCache(
    private val delegate: Cache,
    private val gate: AccountEpochGate,
) : Cache by delegate {
    @Volatile
    var streamEpoch: Long = gate.epoch
        private set
    private val stamps = ConcurrentHashMap<File, Long>()

    fun openStream() {
        streamEpoch = gate.epoch
    }

    override fun startFile(key: String, position: Long, length: Long): File =
        delegate.startFile(key, position, length).also { file ->
            stamps[file] = streamEpoch
            gate.track(file)
        }

    override fun commitFile(file: File, length: Long) {
        val stamp = stamps.remove(file) ?: streamEpoch
        gate.commitIfCurrent(stamp, file, commit = { delegate.commitFile(file, length) }, discard = { file.delete() })
    }
}
