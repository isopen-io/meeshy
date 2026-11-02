package me.meeshy.sdk.e2ee.libsignal

import android.security.keystore.KeyGenParameterSpec
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
 * Une clé du Keystore invalidée (restauration, effacement des identifiants) rend la forme enveloppée illisible : le
 * coffre repart de zéro ([open] le dit), l'appareil se réenrôle sous une nouvelle identité et ses pairs reçoivent un
 * 409 `stale`. Jamais de repli en clair.
 */
internal class KeystoreVaultKey(private val directory: File) {

    /** La clé, et si elle vient d'être tirée (le coffre précédent, s'il existait, ne s'ouvrira plus). */
    data class Opened(val key: SecretKey, val fresh: Boolean)

    fun open(): Opened {
        directory.mkdirs()
        val wrapped = File(directory, WRAPPED_FILE)
        if (wrapped.isFile) {
            unwrap(wrapped.readBytes())?.let { return Opened(SecretKeySpec(it, "AES"), fresh = false) }
        }
        val raw = ByteArray(KEY_BYTES).also(SecureRandom()::nextBytes)
        val sealed = wrap(raw)
        val part = File(directory, "$WRAPPED_FILE.part")
        part.writeBytes(sealed)
        check(part.renameTo(wrapped)) { "e2ee vault key could not take its name" }
        return Opened(SecretKeySpec(raw, "AES"), fresh = true)
    }

    private fun wrap(raw: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, masterKey())
        return cipher.iv + cipher.doFinal(raw)
    }

    private fun unwrap(blob: ByteArray): ByteArray? = runCatching {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, existingMasterKey() ?: return null, GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES))
        cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES).takeIf { it.size == KEY_BYTES }
    }.getOrNull()

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun existingMasterKey(): SecretKey? = (keyStore().getEntry(MASTER_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun masterKey(): SecretKey = existingMasterKey() ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        .apply {
            init(
                KeyGenParameterSpec.Builder(MASTER_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(KEY_BYTES * 8)
                    .build(),
            )
        }
        .generateKey()

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val MASTER_ALIAS = "meeshy_e2ee_vault_master"
        const val WRAPPED_FILE = "vault.key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_BYTES = 32
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
