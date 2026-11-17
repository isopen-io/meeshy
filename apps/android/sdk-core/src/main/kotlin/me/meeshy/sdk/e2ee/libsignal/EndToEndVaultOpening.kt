package me.meeshy.sdk.e2ee.libsignal

import javax.crypto.SecretKey
import me.meeshy.core.e2ee.vault.RecordVault
import timber.log.Timber

/**
 * L'ouverture du coffre E2EE (#14634, #18977). Une clé NEUVE rend l'ancienne base illisible : elle est effacée avant d'être
 * rouverte. Un coffre VERROUILLÉ ([E2eeVaultLockedException]) n'est ni effacé ni remplacé : l'erreur remonte, et la
 * prochaine lecture réessaie. Une base existante qui ne s'ouvre pas verrouille de même.
 *
 * **Sans coffre durable, rien ne s'ouvre** (#18977, fail-closed) : un coffre en mémoire enrôlerait une identité jetable,
 * ouvrirait et ACQUITTERAIT des messages, puis perdrait tout à la mort du processus — et la passerelle effacerait au
 * lancement suivant les enveloppes de la génération précédente. [E2eeVaultUnavailableException] remonte : rien ne
 * s'enrôle, aucune enveloppe ne s'acquitte, elles attendent au serveur.
 */
internal object EndToEndVaultOpening {
    fun open(
        key: () -> KeystoreVaultKey.Opened,
        wipe: () -> Unit,
        sealed: (SecretKey) -> RecordVault,
    ): RecordVault {
        val opened = try {
            key()
        } catch (locked: E2eeVaultLockedException) {
            Timber.e("e2ee vault locked, nothing erased: %s", locked.cause?.javaClass?.simpleName)
            throw locked
        } catch (failure: Exception) {
            Timber.e("e2ee vault unavailable on this device: %s", failure.javaClass.simpleName)
            throw E2eeVaultUnavailableException(failure)
        }
        if (opened.fresh) wipe()
        return try {
            sealed(opened.key)
        } catch (failure: Exception) {
            if (!opened.fresh) throw E2eeVaultLockedException(failure)
            Timber.e("e2ee vault unavailable on this device: %s", failure.javaClass.simpleName)
            throw E2eeVaultUnavailableException(failure)
        }
    }
}

/** Ce téléphone ne tient pas de coffre durable (Keystore inutilisable, disque) : le bout en bout y est indisponible (#18977). */
public class E2eeVaultUnavailableException(cause: Throwable) : Exception("e2ee vault unavailable on this device", cause)
