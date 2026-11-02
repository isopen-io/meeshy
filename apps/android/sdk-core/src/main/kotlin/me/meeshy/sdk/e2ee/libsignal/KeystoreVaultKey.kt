package me.meeshy.sdk.e2ee.libsignal

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * La clé de scellement du coffre E2EE (#14591, spec § 4.4) : 256 bits aléatoires, ENVELOPPÉS par une clé AES-256-GCM de
 * l'Android Keystore qui n'en sort jamais (non extractible). Seule la forme enveloppée touche le disque, dans
 * `noBackupFilesDir` (ni sauvegarde ni transfert d'appareil, comme `ThisDeviceOnly` sur iOS). La clé déballée ne vit
 * qu'en mémoire, le temps du processus — la même exposition que la clé CryptoKit d'iOS.
 *
 * **Le coffre ne repart de zéro que si sa clé maîtresse est PERDUE** (#14634) : absente du Keystore, ou invalidée pour
 * de bon (`KeyPermanentlyInvalidatedException`). L'appareil se réenrôle alors sous une nouvelle identité et ses pairs
 * reçoivent un 409 `stale`. **Toute autre erreur** (Keystore occupé, appareil encore verrouillé, défaut du fournisseur,
 * forme enveloppée que la clé maîtresse ne rouvre pas) lève [E2eeVaultLockedException] : rien n'est retiré, rien n'est
 * effacé, et la prochaine ouverture réessaie. Jamais de repli en clair.
 *
 * La forme enveloppée d'une clé maîtresse perdue est retirée AVANT que la nouvelle clé maîtresse ne naisse : un processus
 * tué entre la naissance de celle-ci et le renommage de la nouvelle forme ne laisse jamais une forme que la nouvelle clé
 * maîtresse ne rouvre pas (elle verrouillerait le coffre pour toujours).
 */
internal class KeystoreVaultKey(
    private val directory: File,
    private val master: VaultKeyWrapper = AndroidKeystoreKeyWrapper,
) {

    /** La clé, et si elle vient d'être tirée (le coffre précédent, s'il existait, ne s'ouvrira plus). */
    data class Opened(val key: SecretKey, val fresh: Boolean)

    fun open(): Opened {
        directory.mkdirs()
        val wrapped = File(directory, WRAPPED_FILE)
        if (wrapped.isFile) {
            reopen(wrapped)?.let { return Opened(SecretKeySpec(it, "AES"), fresh = false) }
            check(wrapped.delete()) { "e2ee vault lost key could not be retired" }
        }
        val raw = ByteArray(KEY_BYTES).also(SecureRandom()::nextBytes)
        val sealed = master.wrap(raw)
        val part = File(directory, "$WRAPPED_FILE.part")
        part.writeBytes(sealed)
        check(part.renameTo(wrapped)) { "e2ee vault key could not take its name" }
        return Opened(SecretKeySpec(raw, "AES"), fresh = true)
    }

    /** La clé déballée ; `null` seulement si la clé maîtresse est perdue. Toute autre erreur verrouille le coffre. */
    private fun reopen(wrapped: File): ByteArray? {
        val raw = try {
            master.unwrap(wrapped.readBytes())
        } catch (invalidated: KeyPermanentlyInvalidatedException) {
            master.discard()
            return null
        } catch (failure: Exception) {
            throw E2eeVaultLockedException(failure)
        } ?: return null
        if (raw.size != KEY_BYTES) throw E2eeVaultLockedException(IllegalStateException("unexpected vault key size"))
        return raw
    }

    private companion object {
        const val WRAPPED_FILE = "vault.key"
        const val KEY_BYTES = 32
    }
}

/** Le coffre existe mais ne s'ouvre pas MAINTENANT : on n'efface rien, on réessaiera. */
public class E2eeVaultLockedException(cause: Throwable) : Exception("e2ee vault temporarily locked", cause)

/** La clé maîtresse qui enveloppe la clé du coffre. `unwrap` rend `null` quand elle est ABSENTE. */
internal interface VaultKeyWrapper {
    fun unwrap(blob: ByteArray): ByteArray?
    fun wrap(raw: ByteArray): ByteArray
    fun discard()
}

/** La clé maîtresse AES-256-GCM de l'Android Keystore, non extractible. */
internal object AndroidKeystoreKeyWrapper : VaultKeyWrapper {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val MASTER_ALIAS = "meeshy_e2ee_vault_master"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
    private const val KEY_BITS = 256

    override fun unwrap(blob: ByteArray): ByteArray? {
        val key = existing() ?: return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES))
        return cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
    }

    override fun wrap(raw: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, existing() ?: create())
        return cipher.iv + cipher.doFinal(raw)
    }

    override fun discard() {
        keyStore().deleteEntry(MASTER_ALIAS)
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun existing(): SecretKey? = (keyStore().getEntry(MASTER_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun create(): SecretKey = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        .apply {
            init(
                KeyGenParameterSpec.Builder(MASTER_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(KEY_BITS)
                    .build(),
            )
        }
        .generateKey()
}
