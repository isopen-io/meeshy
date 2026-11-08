package me.meeshy.sdk.e2ee.libsignal

import javax.crypto.SecretKey
import me.meeshy.core.e2ee.vault.RecordVault
import timber.log.Timber

/**
 * L'ouverture du coffre E2EE (#14634). Une clé NEUVE rend l'ancienne base illisible : elle est effacée avant d'être
 * rouverte. Un coffre VERROUILLÉ ([E2eeVaultLockedException]) n'est ni effacé ni remplacé par un coffre en mémoire —
 * celui-ci réenrôlerait l'appareil sous une identité jetable : l'erreur remonte, et la prochaine lecture réessaie.
 * Une base existante qui ne s'ouvre pas verrouille de même. Seul un Keystore inutilisable SANS coffre existant replie
 * sur la mémoire (rien n'est écrit sur le disque).
 */
internal object EndToEndVaultOpening {
    fun open(
        key: () -> KeystoreVaultKey.Opened,
        wipe: () -> Unit,
        sealed: (SecretKey) -> RecordVault,
        memory: () -> RecordVault,
    ): RecordVault {
        val opened = try {
            key()
        } catch (locked: E2eeVaultLockedException) {
            Timber.e("e2ee vault locked, nothing erased: %s", locked.cause?.javaClass?.simpleName)
            throw locked
        } catch (failure: Exception) {
            Timber.e("e2ee vault unavailable, kept in memory: %s", failure.javaClass.simpleName)
            return memory()
        }
        if (opened.fresh) wipe()
        return try {
            sealed(opened.key)
        } catch (failure: Exception) {
            if (!opened.fresh) throw E2eeVaultLockedException(failure)
            Timber.e("e2ee vault unavailable, kept in memory: %s", failure.javaClass.simpleName)
            memory()
        }
    }
}
