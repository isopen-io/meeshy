package me.meeshy.core.datastore

import android.content.SharedPreferences
import javax.crypto.AEADBadTagException

/**
 * Décide si un coffre qui refuse de s'ouvrir peut être supprimé puis recréé vide. Supprimer le fichier détruit tous
 * les secrets qu'il portait : la porte se pose avant, jamais après.
 */
fun interface VaultRecreationGate {
    /** `true` si l'échec [failure] de l'ouverture autorise à supprimer le fichier du coffre. */
    fun mayRecreate(failure: Throwable): Boolean

    /** Le coffre s'est ouvert : ce que la porte comptait des lancements précédents ne vaut plus. */
    fun opened() {}

    companion object {
        /** Le comportement historique : le premier échec recrée le coffre (secrets qui se redemandent, jetons de session). */
        val Always: VaultRecreationGate = VaultRecreationGate { true }
    }
}

/**
 * La porte d'un coffre dont la perte coûte une base entière (la clé de `meeshy.db`) : le fichier n'est recréé que sur
 * un échec DURABLE prouvé, c'est-à-dire une signature de clé définitivement perdue (`AEADBadTagException`,
 * `KeyPermanentlyInvalidatedException`, blob de clé refusé, clé maîtresse inutilisable, keyset Tink illisible)
 * constatée sur [launches] lancements consécutifs. Un échec passager (`KeyStoreException` au démarrage, disque) ne
 * compte pas et ne supprime rien : le lancement suit sans le coffre, le suivant réessaie. Le décompte vit dans [ledger], un fichier en clair qui ne porte qu'un entier ; s'il ne s'écrit
 * pas, rien n'est prouvé et rien n'est supprimé.
 */
class DurableFailureGate(
    private val ledger: () -> SharedPreferences?,
    private val launches: Int = DEFAULT_LAUNCHES,
) : VaultRecreationGate {

    override fun mayRecreate(failure: Throwable): Boolean {
        if (!isPermanent(failure)) return false
        val prefs = attempt(ledger) ?: return false
        val seen = (attempt { prefs.getInt(FAILED_LAUNCHES, 0) } ?: return false) + 1
        val recorded = attempt { prefs.edit().putInt(FAILED_LAUNCHES, seen).commit() } == true
        return recorded && seen >= launches
    }

    override fun opened() {
        val prefs = attempt(ledger) ?: return
        if (attempt { prefs.contains(FAILED_LAUNCHES) } == true) {
            attempt { prefs.edit().remove(FAILED_LAUNCHES).commit() }
        }
    }

    private fun <T> attempt(block: () -> T): T? = try {
        block()
    } catch (_: Exception) {
        null
    }

    companion object {
        const val DEFAULT_LAUNCHES: Int = 3
        private const val FAILED_LAUNCHES = "failedLaunches"
        private const val MAX_CAUSES = 16
        private val PERMANENT_NAMES = setOf("KeyPermanentlyInvalidatedException", "InvalidProtocolBufferException")
        private val PERMANENT_MESSAGES = listOf("invalid key blob", "invalid_key_blob", "exists but is unusable")

        /**
         * Une clé de coffre qui ne déchiffre plus (tag invalide), que le Keystore a invalidée pour de bon ou dont il refuse
         * le blob, une clé maîtresse qui existe mais est inutilisable, ou un keyset Tink qui ne se décode plus : rien de
         * tout cela ne se répare en relançant.
         */
        fun isPermanent(failure: Throwable): Boolean =
            generateSequence(failure) { current -> current.cause?.takeIf { it !== current } }
                .take(MAX_CAUSES)
                .any { it is AEADBadTagException || it.javaClass.simpleName in PERMANENT_NAMES || hasPermanentMessage(it) }

        private fun hasPermanentMessage(failure: Throwable): Boolean {
            val message = failure.message?.lowercase() ?: return false
            return PERMANENT_MESSAGES.any { marker -> message.contains(marker) }
        }
    }
}
