package me.meeshy.sdk.model.appearance

import java.security.MessageDigest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.pack.PackAssetRef

/**
 * **Le contrat servi d'un pack d'apparence non embarqué** (#16265) — miroir de `parseAppearancePackContract`,
 * `parseAvatarRingPackContract` et `parseBannerFramePackContract` (`packages/shared/types/`) : un pack `official` hors du
 * catalogue de l'APK, ou un pack tiers, se peint depuis le `<sha16>.json` que la passerelle sert
 * (`GET /api/v1/pack-assets/<fichier>`).
 *
 * Les modèles se lisent avec les MÊMES décodeurs que le catalogue embarqué : un modèle illisible tombe seul, un contrat
 * sans modèle lisible ne se lit pas. Un contrat se peint par les renderers du catalogue, jamais par un jumeau.
 */
sealed interface ServedAppearanceContract {
    val domain: AppearancePackDomain

    data class Designs(override val domain: AppearancePackDomain, val designs: List<AppearanceDesign>) : ServedAppearanceContract

    data class Rings(val rings: List<AvatarRingDesign>) : ServedAppearanceContract {
        override val domain: AppearancePackDomain get() = AppearancePackDomain.AVATAR_RING
    }

    data class Frames(val frames: List<BannerFrameDesign>) : ServedAppearanceContract {
        override val domain: AppearancePackDomain get() = AppearancePackDomain.BANNER_FRAME
    }

    companion object {
        private val JSON = Json { ignoreUnknownKeys = true }
        private const val PREFIX_LENGTH = 16
        private const val SHA256_LENGTH = 64

        /** Le contrat de [text], ou `null` : illisible, domaine inconnu, ou aucun modèle lisible. */
        fun parse(text: String): ServedAppearanceContract? {
            val root = runCatching { JSON.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return null
            val domain = (root["domain"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val contract = when (domain) {
                AppearancePackDomain.WALLPAPER.wire -> Designs(AppearancePackDomain.WALLPAPER, designs(root))
                AppearancePackDomain.BANNER.wire -> Designs(AppearancePackDomain.BANNER, designs(root))
                AppearancePackDomain.AVATAR_RING.wire -> Rings(JSON.decodeLossyList(root["rings"], AvatarRingDesign.serializer()))
                AppearancePackDomain.BANNER_FRAME.wire -> Frames(JSON.decodeLossyList(root["frames"], BannerFrameDesign.serializer()))
                else -> null
            }
            return contract?.takeIf { it.keys.isNotEmpty() }
        }

        /**
         * Les octets [bytes] sont-ils ceux que l'adresse [src] engage ? L'adresse doit être `<sha16>.json`, et le SHA-256
         * du contenu doit commencer par son préfixe ; quand l'empreinte complète [sha256] est connue (packs installés),
         * elle doit être exacte. Un décor d'autrui ne sert que l'adresse : c'est elle qui se vérifie.
         */
        fun verifies(src: String, bytes: ByteArray, sha256: String? = null): Boolean {
            if (!isAddress(src)) return false
            val actual = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            if (!actual.startsWith(src.take(PREFIX_LENGTH))) return false
            return sha256 == null || (sha256.length == SHA256_LENGTH && actual == sha256)
        }

        /** `<16 hex minuscules>.json` : la seule adresse de contrat qui se télécharge. */
        fun isAddress(src: String): Boolean = PackAssetRef.isContentAddressed(src) && src.endsWith(".json")

        private fun designs(root: JsonObject): List<AppearanceDesign> =
            JSON.decodeLossyList(root["designs"], AppearanceDesign.serializer())
    }
}

private val ServedAppearanceContract.keys: List<String>
    get() = when (this) {
        is ServedAppearanceContract.Designs -> designs.map { it.key }
        is ServedAppearanceContract.Rings -> rings.map { it.key }
        is ServedAppearanceContract.Frames -> frames.map { it.key }
    }

/** Un pack servi que le lecteur a installé : son slug, l'adresse de son contrat et ses noms (langue → nom). */
data class ServedAppearancePack(
    val slug: String,
    val src: String,
    val names: Map<String, String> = emptyMap(),
)

/**
 * Ce que l'appareil sait peindre au-delà de l'APK : les contrats chargés, par adresse (le décor d'autrui s'y résout), et
 * les packs servis INSTALLÉS par le lecteur, par domaine (le sélecteur et le fond d'une conversation s'y résolvent par slug).
 */
data class ServedAppearanceContracts(
    val byAddress: Map<String, ServedAppearanceContract> = emptyMap(),
    val packs: Map<AppearancePackDomain, List<ServedAppearancePack>> = emptyMap(),
) {
    val isEmpty: Boolean get() = byAddress.isEmpty() && packs.values.all { it.isEmpty() }

    internal fun contract(src: String?, domain: AppearancePackDomain): ServedAppearanceContract? =
        src?.let(byAddress::get)?.takeIf { it.domain == domain }

    /** Fusionne [other] par-dessus : ses contrats s'ajoutent, ses domaines remplacent les miens. */
    fun plus(other: ServedAppearanceContracts): ServedAppearanceContracts =
        ServedAppearanceContracts(byAddress + other.byAddress, packs + other.packs)

    companion object {
        val EMPTY = ServedAppearanceContracts()
    }
}
