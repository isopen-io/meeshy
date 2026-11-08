package me.meeshy.sdk.model.pack

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * **Un fichier de pack**, adressé par son contenu — miroir de `PackAssetRef`
 * (`packages/shared/types/content-pack-index.ts`) et de `PackAssetRef`
 * (`Packs/FramePackModels.swift`).
 *
 * [src] = les 16 premiers caractères du SHA-256 puis l'extension (`webp`, `png`,
 * `json`, `woff2`), servi par `GET /api/v1/pack-assets/<src>`. Fail-closed à la
 * lecture : une référence qui ne s'adresse pas par son contenu ne se lit pas
 * (voir [PackAssetRefSerializer]) ; [of] est la seule fabrique qui valide.
 */
@Serializable(with = PackAssetRefSerializer::class)
data class PackAssetRef(
    val src: String,
    val bytes: Long,
    val sha256: String,
) {
    /** Une référence lue est déjà vérifiée : son fichier se nomme sans repasser la garde. */
    val file: PackAssetFile get() = PackAssetFile(name = src, sha256 = sha256)

    companion object {
        private val EXTENSIONS = setOf("webp", "png", "json", "woff2")
        private const val PREFIX_LENGTH = 16
        private const val SHA256_LENGTH = 64

        /** La référence, ou `null` quand elle ne s'adresse pas par son contenu. */
        fun of(src: String, bytes: Long, sha256: String): PackAssetRef? {
            if (bytes < 0) return null
            if (!isContentAddressed(src)) return null
            if (!isHex(sha256, SHA256_LENGTH)) return null
            if (!src.startsWith(sha256.take(PREFIX_LENGTH))) return null
            return PackAssetRef(src = src, bytes = bytes, sha256 = sha256)
        }

        /** Le fichier de pack [content] sous son vrai nom : les 16 premiers caractères de son SHA-256, puis [extension]. */
        fun forContent(content: ByteArray, extension: String): PackAssetRef? {
            val sha = java.security.MessageDigest.getInstance("SHA-256").digest(content)
                .joinToString("") { "%02x".format(it) }
            return of(src = "${sha.take(PREFIX_LENGTH)}.$extension", bytes = content.size.toLong(), sha256 = sha)
        }

        /** `<16 hex minuscules>.<webp|png|json|woff2>` — rien d'autre ne se télécharge. */
        fun isContentAddressed(name: String): Boolean {
            val parts = name.split('.')
            if (parts.size != 2) return false
            return isHex(parts[0], PREFIX_LENGTH) && parts[1] in EXTENSIONS
        }

        internal fun isHex(value: String, length: Int): Boolean =
            value.length == length && value.all { it in '0'..'9' || it in 'a'..'f' }
    }
}

@Serializable
internal data class PackAssetRefWire(
    val src: String,
    val bytes: Long,
    val sha256: String,
)

/** Fail-closed : une référence qui ne s'adresse pas par son contenu lève [SerializationException]. */
object PackAssetRefSerializer : KSerializer<PackAssetRef> {
    override val descriptor: SerialDescriptor = PackAssetRefWire.serializer().descriptor

    override fun deserialize(decoder: Decoder): PackAssetRef {
        val wire = decoder.decodeSerializableValue(PackAssetRefWire.serializer())
        return PackAssetRef.of(wire.src, wire.bytes, wire.sha256)
            ?: throw SerializationException("fichier de pack non adressé par contenu : ${wire.src}")
    }

    override fun serialize(encoder: Encoder, value: PackAssetRef) {
        encoder.encodeSerializableValue(
            PackAssetRefWire.serializer(),
            PackAssetRefWire(src = value.src, bytes = value.bytes, sha256 = value.sha256),
        )
    }
}
