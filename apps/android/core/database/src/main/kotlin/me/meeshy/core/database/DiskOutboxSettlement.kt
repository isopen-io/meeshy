package me.meeshy.core.database

import androidx.room.InvalidationTracker
import java.io.File
import java.io.IOException

/**
 * Le registre des lignes d'outbox que le disque n'a plus à rejouer, tenu pendant un lancement EN MÉMOIRE dont la base sur
 * disque est restée intacte ([DatabaseOpener] : chiffrement indisponible pour ce lancement). La base en mémoire reçoit
 * une COPIE de l'outbox du disque, que le fichier garde : sans ce registre, un envoi annulé, retiré ou abandonné pendant
 * ce lancement serait rejoué au lancement suivant, depuis le disque, alors que l'auteur l'avait retiré.
 *
 * Une ligne venue du disque est RÉGLÉE quand elle sort de l'outbox en mémoire (livrée, retirée, illisible, abandonnée) ou
 * que l'auteur en demande l'annulation (`cancelRequestedAt`). Le registre est un petit fichier à côté de la base, qui ne
 * porte que les identifiants client (`cmid`) : ni contenu, ni destinataire. Il s'applique à la prochaine ouverture de la
 * base sur disque (les lignes réglées en sont retirées, puis il disparaît) et filtre la copie d'un nouveau lancement en
 * mémoire. Limite assumée : une ligne réglée dans les derniers instants d'un processus tué avant l'écriture du registre
 * reste rejouable ; le serveur déduplique alors un envoi déjà livré par son `cmid`, pas une annulation perdue.
 */
internal class DiskOutboxSettlement(primary: File) {

    private val file = File(primary.path + SUFFIX)

    /** Les `cmid` réglés ; un registre illisible n'en rend aucun. */
    fun settled(): Set<String> = try {
        if (file.isFile) file.readLines().map(String::trim).filter(String::isNotEmpty).toSet() else emptySet()
    } catch (_: IOException) {
        emptySet()
    }

    /** [salvage] sans les lignes d'outbox déjà réglées. */
    fun withoutSettled(salvage: DatabaseSalvage): DatabaseSalvage {
        val settled = settled()
        if (settled.isEmpty()) return salvage
        return salvage.copy(outbox = salvage.outbox.filterNot { it.cmid in settled })
    }

    /** Retire de la base sur disque les lignes réglées, puis oublie le registre ; un échec le garde pour la fois suivante. */
    fun applyTo(disk: MeeshyDatabase) {
        val settled = settled()
        if (settled.isEmpty()) {
            forget()
            return
        }
        try {
            val db = disk.openHelper.writableDatabase
            settled.chunked(MAX_BOUND_ARGS).forEach { chunk ->
                db.delete(OUTBOX, "cmid IN (${chunk.joinToString(",") { "?" }})", chunk.toTypedArray())
            }
            forget()
        } catch (_: Exception) {
            Unit
        }
    }

    /**
     * Observe l'outbox de [memory] : parmi [candidates] (l'outbox recopiée du disque), seules les lignes effectivement
     * présentes en mémoire sont suivies — une ligne que la copie n'a pas pu insérer n'est jamais réglée, donc jamais
     * retirée du disque.
     */
    fun watch(memory: MeeshyDatabase, candidates: Set<String>) {
        if (candidates.isEmpty()) return
        val fromDisk = try {
            candidates intersect live(memory, cancelled = true)
        } catch (_: Exception) {
            return
        }
        if (fromDisk.isEmpty()) return
        memory.invalidationTracker.addObserver(
            object : InvalidationTracker.Observer(arrayOf(OUTBOX)) {
                override fun onInvalidated(tables: Set<String>) = settleFrom(memory, fromDisk)
            },
        )
    }

    /** Inscrit les lignes de [fromDisk] qui ne sont plus à envoyer depuis [memory]. */
    fun settleFrom(memory: MeeshyDatabase, fromDisk: Set<String>) {
        val stillQueued = try {
            live(memory, cancelled = false)
        } catch (_: Exception) {
            return
        }
        record(fromDisk - stillQueued)
    }

    @Synchronized
    private fun record(newly: Set<String>) {
        if (newly.isEmpty()) return
        val known = settled()
        if (known.containsAll(newly)) return
        try {
            val staged = File(file.path + STAGED)
            staged.writeText((known + newly).joinToString("\n"))
            if (!staged.renameTo(file)) staged.delete()
        } catch (_: IOException) {
            Unit
        }
    }

    private fun forget() {
        if (file.isFile) file.delete()
    }

    /** Les `cmid` de l'outbox de [memory] ; sans ceux dont l'annulation est demandée, sauf si [cancelled]. */
    private fun live(memory: MeeshyDatabase, cancelled: Boolean): Set<String> {
        val where = if (cancelled) "" else " WHERE cancelRequestedAt IS NULL"
        return memory.openHelper.readableDatabase.query("SELECT cmid FROM $OUTBOX$where").use { cursor ->
            buildSet { while (cursor.moveToNext()) add(cursor.getString(0)) }
        }
    }

    companion object {
        const val SUFFIX: String = ".outbox-settled"
        private const val STAGED = ".staged"
        private const val OUTBOX = "outbox"
        private const val MAX_BOUND_ARGS = 500
    }
}
