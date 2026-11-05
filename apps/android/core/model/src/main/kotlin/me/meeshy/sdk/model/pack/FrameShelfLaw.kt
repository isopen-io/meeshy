package me.meeshy.sdk.model.pack

import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.FrameUsageLaw

/** Un cadre montré sur l'étagère : son nom traduit, ce à quoi il sert, sa vignette (adressée par contenu). */
data class FrameTile(val id: String, val name: String, val usageText: String, val thumb: PackAssetRef)

/** Ce que l'onglet d'un pack de cadres installé montre. */
sealed interface FrameShelfContent {
    data object Loading : FrameShelfContent

    /** Le contrat est d'une version que ce client ne lit pas : rien ne se télécharge. */
    data object NeedsUpdate : FrameShelfContent

    data object Unavailable : FrameShelfContent

    data class Frames(val tiles: List<FrameTile>) : FrameShelfContent
}

/**
 * **« Rang Ambassadeur IV uniquement »** — `describeFrameUsage` rendu dans la langue de l'interface (miroir de
 * `FrameUsageText`, iOS). Les paramètres sont des CLÉS (`rank`, `rarity`, `family`) que l'hôte nomme ; `division`
 * arrive déjà en chiffres romains. Le format reçoit les valeurs en positionnel (`%1$s`, `%2$s`).
 */
object FrameUsageText {
    private val PARAMETER_ORDER = listOf("rank", "division", "rarity", "family")

    fun text(label: FrameUsageLabel, name: (parameter: String, value: String) -> String, format: (key: String) -> String): String {
        val values = PARAMETER_ORDER.mapNotNull { parameter ->
            val value = label.params[parameter] ?: return@mapNotNull null
            if (parameter == "division") value else name(parameter, value)
        }
        val pattern = format(label.key)
        return if (values.isEmpty()) pattern else String.format(pattern, *values.toTypedArray())
    }

    /** Le libellé d'un usage de cadre. */
    fun text(usage: FrameUsage, name: (String, String) -> String, format: (String) -> String): String =
        text(FrameUsageLaw.describeFrameUsage(usage), name, format)
}

/** La loi de l'étagère d'un pack de cadres installé, pure. */
object FrameShelfLaw {

    /** Un contrat sans version annoncée se lit ; une version autre que la nôtre demande la mise à jour. */
    fun readsSchema(schema: Int?): Boolean = schema?.let { it == GloryFramePackContract.SCHEMA } ?: true

    /** Un cadre par vignette ; un nom sans traduction se lit par son identifiant. */
    fun tiles(contract: GloryFramePackContract, strings: Map<String, String>, usageText: (FrameUsage) -> String): List<FrameTile> =
        contract.frames.map { frame ->
            FrameTile(id = frame.id, name = strings[frame.nameKey] ?: frame.id, usageText = usageText(frame.usage), thumb = frame.thumb)
        }

    /** Ce que l'onglet de ce pack a rangé dans le magasin : de quoi l'élaguer quand plus personne ne le retient. */
    fun manifest(detail: FramePack, contract: GloryFramePackContract, strings: PackAssetRef?): PackFileManifest {
        val shared = listOf(detail.contract?.src, strings?.src, detail.coverFile?.name, detail.preview?.src)
        return PackFileManifest(
            slug = detail.slug,
            files = shared.filterNotNull().toSet(),
            frames = contract.frames.groupBy({ it.id }, { it.thumb.src }).mapValues { it.value.toSet() },
        )
    }
}
