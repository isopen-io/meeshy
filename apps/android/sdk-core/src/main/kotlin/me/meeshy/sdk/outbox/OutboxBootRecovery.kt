package me.meeshy.sdk.outbox

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaLoss
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject

/**
 * Ce que la reprise a corrigé (miroir d'iOS `BootRecoveryReport`). Journalisé à chaque passage.
 *
 * @property inflightReset lignes laissées `INFLIGHT` par un process mort, remises `PENDING`.
 * @property mediaOrphanFailed lignes de téléversement `PENDING` dont les octets ont disparu, passées `EXHAUSTED`.
 * @property terminalPurged lignes terminales jetables dont la fenêtre de rétention est écoulée, retirées.
 */
public data class BootRecoveryReport(
    val inflightReset: Int = 0,
    val mediaOrphanFailed: Int = 0,
    val terminalPurged: Int = 0,
) {
    public val isEmpty: Boolean get() = inflightReset == 0 && mediaOrphanFailed == 0 && terminalPurged == 0
}

/** Les octets d'un téléversement en file sont-ils encore sur l'appareil ? */
public fun interface PendingMediaPresence {
    public suspend fun isPresent(cmid: String): Boolean
}

/**
 * La reprise après crash de la file : au démarrage ET au retour au premier plan.
 *
 * - `INFLIGHT` → `PENDING` (le dédoublonnage du gateway par `cmid` rend le rejeu sûr). Au démarrage à froid toute ligne
 *   `INFLIGHT` est orpheline sauf celles qu'un envoi vivant de CE process tient ([OutboxRepository.sendingLive]) ; au
 *   retour au premier plan seules celles figées depuis plus de [OutboxRepository.STALE_INFLIGHT_MS] le sont.
 * - Une ligne de téléversement dont les octets ont disparu ne pourra jamais partir : `EXHAUSTED` avec [MediaLoss.REASON],
 *   la bulle propose de rechoisir le média.
 * - Les lignes terminales jetables échues sortent de la file ([OutboxTerminalRetention]).
 */
public class OutboxBootRecovery(
    private val outbox: OutboxRepository,
    private val presence: PendingMediaPresence,
    private val journal: (BootRecoveryReport) -> Unit = { report ->
        Timber.i(
            "Outbox recovery: %d inflight reset, %d media orphans failed, %d terminal rows purged",
            report.inflightReset,
            report.mediaOrphanFailed,
            report.terminalPurged,
        )
    },
) {
    /** @param cold `true` au démarrage du process, `false` au retour au premier plan. */
    public suspend fun run(cold: Boolean): BootRecoveryReport {
        val inflightReset = if (cold) outbox.recoverInflight() else outbox.reclaimStaleInflight()
        val orphans = outbox.pendingRows(OutboxKind.UPLOAD_MEDIA).filterNot { presence.isPresent(it.cmid) }
        orphans.forEach { outbox.markExhausted(it.cmid, MediaLoss.REASON) }
        val report = BootRecoveryReport(
            inflightReset = inflightReset,
            mediaOrphanFailed = orphans.size,
            terminalPurged = outbox.purgeDiscardableTerminalRows(),
        )
        journal(report)
        return report
    }
}

/** Branche la reprise sur le cycle de vie du process : froid à la création, tiède à chaque retour au premier plan. */
public class OutboxBootRecoveryHook @Inject constructor(
    outbox: OutboxRepository,
    blobs: MediaBlobStore,
) : AppLifecycleHook {
    private val recovery = OutboxBootRecovery(outbox, PendingMediaPresence { blobs.has(it) })
    private val coldDone = AtomicBoolean(false)

    override val priority: Int get() = -100

    override suspend fun onAppCreate() {
        coldDone.set(true)
        recovery.run(cold = true)
    }

    override suspend fun onForeground() {
        recovery.run(cold = !coldDone.getAndSet(true))
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class OutboxBootRecoveryModule {
    @Binds
    @IntoSet
    abstract fun bindsOutboxBootRecoveryHook(impl: OutboxBootRecoveryHook): AppLifecycleHook
}
