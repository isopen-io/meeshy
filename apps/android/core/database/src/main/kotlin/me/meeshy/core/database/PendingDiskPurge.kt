package me.meeshy.core.database

import android.database.Cursor
import java.io.File
import me.meeshy.core.database.entity.PlaintextErasureEntity

/**
 * La purge de session que la base sur disque doit encore subir. Une session close pendant un lancement EN MÉMOIRE ne vide
 * que la mémoire : la base sur disque, intacte, garde l'historique du compte qui part. Sans cette dette, la prochaine
 * ouverture sur disque la rendrait au compte suivant.
 *
 * Le marqueur (`<base>.purge-due`, aucune donnée) est écrit de façon atomique et durable par [schedule] ; la prochaine
 * ouverture le lit AVANT toute autre étape ([DatabaseOpener]) : elle relit les clairs E2EE que le coffre doit encore
 * retirer (marqués du compte, comme les garde la purge de session), supprime tous les fichiers de la base, puis l'ouvre
 * neuve et y réinjecte ces inscriptions. Tant que la purge ne peut pas se faire (clé que le coffre ne rend pas, fichier
 * que le disque refuse de supprimer), le marqueur reste et la base sur disque n'est pas ouverte : le lancement tourne en
 * mémoire, sans rien en recopier.
 *
 * Le marqueur est préféré à une suppression immédiate : il garde les inscriptions d'effacement du compte qui part (une
 * inscription perdue laisserait un clair dans le coffre), et il tient même quand la bibliothèque native ou la clé
 * manquent au moment de la déconnexion. Si le disque refuse d'écrire le marqueur, les fichiers sont supprimés tout de
 * suite ([schedule]) : la confidentialité passe avant les inscriptions.
 */
public object PendingDiskPurge {
    public const val SUFFIX: String = ".purge-due"

    public fun marker(primary: File): File = File(primary.path + SUFFIX)

    public fun isDue(primary: File): Boolean = marker(primary).exists()

    /**
     * Inscrit la dette si la base sur disque porte quelque chose ; à défaut d'écrire le marqueur, supprime les fichiers.
     * Rend `true` si la base sur disque ne peut plus être ouverte sans être purgée.
     */
    public fun schedule(primary: File): Boolean {
        if (isDue(primary)) return true
        if (files(primary).isEmpty()) return true
        if (DurableFile.write(marker(primary), System.currentTimeMillis().toString())) return true
        return wipe(primary)
    }

    /** Supprime tous les fichiers de la base (journaux, copies, registres, quarantaines), sauf le marqueur ; `true` si aucun ne reste. */
    public fun wipe(primary: File): Boolean {
        files(primary).forEach { it.delete() }
        return files(primary).isEmpty()
    }

    public fun clear(primary: File): Boolean = !marker(primary).exists() || marker(primary).delete()

    /**
     * Les clairs E2EE que le coffre doit encore retirer, marqués d'un compte (ceux que la purge de session garde). Lève si
     * le fichier ne se lit pas ; une base sans la table n'en porte aucun.
     */
    public fun owedErasures(primary: File, opener: SalvageOpener): List<PlaintextErasureEntity> {
        if (!primary.exists()) return emptyList()
        return opener.open(primary).use { db ->
            val hasTable = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '$ERASURES'")
                .use { it.moveToFirst() }
            if (!hasTable) return@use emptyList()
            db.query("SELECT account, kind, itemId, clientMessageId, senderId, recordedAt, acknowledgedAt FROM $ERASURES")
                .use { cursor -> buildList { while (cursor.moveToNext()) owedRow(cursor)?.let(::add) } }
        }
    }

    private fun owedRow(cursor: Cursor): PlaintextErasureEntity? {
        val account = cursor.getString(0).orEmpty().takeIf(String::isNotEmpty) ?: return null
        return PlaintextErasureEntity(
            account = account,
            kind = cursor.getString(1) ?: return null,
            itemId = cursor.getString(2) ?: return null,
            clientMessageId = cursor.getString(3),
            senderId = cursor.getString(4),
            recordedAt = if (cursor.isNull(5)) 0L else cursor.getLong(5),
            acknowledgedAt = if (cursor.isNull(6)) null else cursor.getLong(6),
        )
    }

    private fun files(primary: File): List<File> {
        val name = primary.name
        val markerName = marker(primary).name
        return primary.absoluteFile.parentFile
            ?.listFiles()
            .orEmpty()
            .filter { it.name == name || it.name.startsWith("$name.") || it.name.startsWith("$name-") }
            .filterNot { it.name == markerName }
    }

    private const val ERASURES = "e2ee_plaintext_erasures"
}
