package me.meeshy.core.crypto.primitives

import android.content.Context
import com.google.crypto.tink.BinaryKeysetReader
import com.google.crypto.tink.CleartextKeysetHandle
import com.google.crypto.tink.KeyTemplate
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import com.google.crypto.tink.streamingaead.PredefinedStreamingAeadParameters
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import com.google.crypto.tink.subtle.Hex
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.channels.SeekableByteChannel
import java.nio.file.StandardOpenOption

/**
 * Chiffrement EN FLUX d'un fichier au repos (#13551) : AES-256-GCM-HKDF par segments de 4 Kio (Tink `StreamingAead`,
 * le schéma d'`androidx.security.crypto.EncryptedFile`). Chaque segment est authentifié et le dernier est marqué :
 * un octet modifié, un fichier tronqué ou lié à d'autres données associées ne s'ouvre pas. La mémoire tenue ne dépend
 * jamais de la taille du fichier, et [openSeekable] lit à partir de n'importe quel décalage sans déchiffrer ce qui
 * précède.
 */
public class StreamingSeal private constructor(private val aead: StreamingAead) {

    /** Un flux qui chiffre vers [ciphertext] ; le fermer écrit le dernier segment et ferme [ciphertext]. */
    public fun sealing(ciphertext: OutputStream, associatedData: ByteArray): OutputStream =
        aead.newEncryptingStream(ciphertext, associatedData)

    /** Un flux qui déchiffre [ciphertext] depuis le début ; une altération lève une `IOException` à la lecture. */
    public fun opening(ciphertext: InputStream, associatedData: ByteArray): InputStream =
        aead.newDecryptingStream(ciphertext, associatedData)

    /**
     * Le clair de [file], positionnable ; `size()` rend la taille du CLAIR. Le premier segment est lu à l'ouverture : une
     * mauvaise clé ou d'autres données associées échouent ICI (`IOException`), pas au milieu d'un envoi. Le fermer ferme le fichier.
     */
    public fun openSeekable(file: File, associatedData: ByteArray): SeekableByteChannel {
        val channel = java.nio.channels.FileChannel.open(file.toPath(), StandardOpenOption.READ)
        return try {
            aead.newSeekableDecryptingChannel(channel, associatedData).also { plain ->
                plain.read(ByteBuffer.allocate(1))
                plain.position(0)
            }
        } catch (failure: Exception) {
            channel.close()
            throw failure
        }
    }

    public companion object {
        private val PARAMETERS = PredefinedStreamingAeadParameters.AES256_GCM_HKDF_4KB

        /**
         * Une clé tenue par l'Android Keystore : le jeu de clés vit chiffré dans les préférences [preferenceFile], sous
         * la clé maîtresse [masterKeyAlias] du Keystore — jamais en clair : sans Keystore, [CryptoException]. Ne pas appeler sur le fil principal (accès Keystore et disque).
         */
        public fun androidKeystore(context: Context, keysetName: String, preferenceFile: String, masterKeyAlias: String): StreamingSeal {
            StreamingAeadConfig.register()
            val preferences = context.getSharedPreferences(preferenceFile, Context.MODE_PRIVATE)
            fun dropCleartextKeyset(): Boolean {
                if (!isCleartextKeyset(preferences.getString(keysetName, null))) return false
                preferences.edit().remove(keysetName).commit()
                return true
            }
            dropCleartextKeyset()
            val manager = AndroidKeysetManager.Builder()
                .withSharedPref(context, keysetName, preferenceFile)
                .withKeyTemplate(KeyTemplate.createFrom(PARAMETERS))
                .withMasterKeyUri("android-keystore://$masterKeyAlias")
                .build()
            if (dropCleartextKeyset() || !manager.isUsingKeystore) throw CryptoException("Keystore indisponible : aucune clé posée en clair")
            return of(manager.keysetHandle)
        }

        /**
         * Le jeu de clés stocké se lit-il SANS la clé maîtresse ? Tink 1.15 l'écrit en clair quand le Keystore échoue à sa
         * création (avant que [androidKeystore] ne refuse), puis, si le Keystore revient, le relit en clair en se déclarant
         * « sous Keystore » ([AndroidKeysetManager.isUsingKeystore] = vrai) : sans ce contrôle, la file d'envoi scellerait sous
         * une clé posée en clair dans les préférences.
         */
        internal fun isCleartextKeyset(hex: String?): Boolean {
            if (hex == null) return false
            return runCatching {
                CleartextKeysetHandle.read(BinaryKeysetReader.withBytes(Hex.decode(hex)))
                    .getPrimitive(RegistryConfiguration.get(), StreamingAead::class.java)
            }.isSuccess
        }

        /** Une clé neuve tenue en mémoire seulement : ce qu'elle scelle ne s'ouvre plus après la fin du processus. */
        public fun ephemeral(): StreamingSeal {
            StreamingAeadConfig.register()
            return of(KeysetHandle.generateNew(PARAMETERS))
        }

        private fun of(handle: KeysetHandle): StreamingSeal =
            StreamingSeal(handle.getPrimitive(RegistryConfiguration.get(), StreamingAead::class.java))
    }
}
