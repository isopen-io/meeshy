package me.meeshy.sdk.pack

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.pack.PackFileRetention

/** Ce que l'élagage doit savoir des autres comptes de l'appareil ; `null` = illisible, donc on garde. */
interface PackRetentionSources {
    /** Les packs retenus (installés) par CHAQUE compte connu sur l'appareil. */
    suspend fun retainedPacks(): Set<String>?

    /** Les cadres gardés dans un carnet, tous comptes confondus. */
    suspend fun referencedFrames(): Set<String>?
}

/**
 * **L'élagage du magasin des packs** — miroir de `PackFilePruner` (iOS) : un retrait (local, ou reçu d'un autre appareil
 * à la revalidation) le demande ; il efface ce qu'AUCUN pack retenu par l'un des comptes connus ni aucun cadre gardé dans
 * un carnet ne référence. Un bail ouvert (déroulé photo, reprise) le DIFFÈRE à sa fin. Une étagère ou un carnet illisible
 * l'annule : dans le doute, on garde.
 */
class PackFilePruner(
    private val index: PackFileIndex,
    private val store: PackFilePruning,
    private val sources: PackRetentionSources,
) {
    private val lock = Mutex()
    private val leases = HashMap<String, Int>()
    private var deferred = false

    suspend fun requestPrune() {
        val mayRun = lock.withLock {
            if (leases.isNotEmpty()) deferred = true
            leases.isEmpty()
        }
        if (mayRun) prune()
    }

    suspend fun acquireLease(slug: String) = lock.withLock {
        leases[slug] = (leases[slug] ?: 0) + 1
    }

    suspend fun releaseLease(slug: String) {
        val mustPrune = lock.withLock {
            val count = leases[slug] ?: return
            if (count > 1) leases[slug] = count - 1 else leases.remove(slug)
            (leases.isEmpty() && deferred).also { if (it) deferred = false }
        }
        if (mustPrune) prune()
    }

    private suspend fun prune() {
        val retained = sources.retainedPacks() ?: return
        val frames = sources.referencedFrames() ?: return
        val plan = PackFileRetention.plan(index.all(), retained, frames)
        if (plan.files.isEmpty() && plan.forgottenPacks.isEmpty()) return
        store.prune(plan.files)
        index.forget(plan.forgottenPacks)
    }
}
