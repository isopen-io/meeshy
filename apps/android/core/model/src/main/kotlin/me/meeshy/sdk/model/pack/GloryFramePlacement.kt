package me.meeshy.sdk.model.pack

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.game.FrameMomentFamily
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.GloryFrameAppliesTo
import me.meeshy.sdk.model.game.GloryFramePlacement
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshFrameEdition
import me.meeshy.sdk.model.game.TreasuryTierKey

/*
 * LE PLACEMENT D'UN CADRE DE GLOIRE, TEL QUE LE PACK LE SERT (#10154, L3) — miroir de `appliesTo`, `option`, `motifs`,
 * `hidden` et `collection` de `glory-frames.ts` et de `GloryFramePlacement.read` (Swift). `appliesTo` porte les CLÉS de
 * la loi, jamais un libellé, et doit dire la même chose que l'usage du cadre (#10146) : un cadre qui se contredit n'a
 * pas de placement, donc ne se propose jamais.
 */
object GloryFramePlacementReader {
    private const val MAX_MOTIFS = 8
    private val OPTION = Regex("^[A-Za-z0-9]{1,4}$")

    /** `usageFitsAppliesTo` : la cible et l'usage disent-ils la même chose ? */
    fun fits(appliesTo: GloryFrameAppliesTo, usage: FrameUsage): Boolean = when {
        appliesTo is GloryFrameAppliesTo.Rank && usage is FrameUsage.Rank ->
            appliesTo.rank == usage.rank && (usage.division == null || usage.division == appliesTo.division)
        appliesTo is GloryFrameAppliesTo.Achievement && usage is FrameUsage.Achievement -> appliesTo.rarity == usage.rarity
        usage is FrameUsage.Moment -> momentFamily(appliesTo) == usage.family
        else -> false
    }

    private fun momentFamily(appliesTo: GloryFrameAppliesTo): FrameMomentFamily? = when (appliesTo) {
        is GloryFrameAppliesTo.Tier -> FrameMomentFamily.Tier
        is GloryFrameAppliesTo.Meesh -> FrameMomentFamily.Meesh
        is GloryFrameAppliesTo.Treasury -> FrameMomentFamily.Treasury
        is GloryFrameAppliesTo.Flame -> FrameMomentFamily.Flame
        GloryFrameAppliesTo.Day -> FrameMomentFamily.Day
        is GloryFrameAppliesTo.Rank, is GloryFrameAppliesTo.Achievement -> null
    }

    /** La cible lue, ou `null` si elle est illisible (famille future, Mythe avec division, jalon de Flamme inconnu…). */
    fun parseAppliesTo(element: JsonElement?): GloryFrameAppliesTo? {
        val obj = element as? JsonObject ?: return null
        return when (obj.string("family")) {
            "rank" -> {
                val rank = FrameUsageWire.parseRank(obj.string("rank")) ?: return null
                if ("division" !in obj) return null
                val division = obj.division("division") ?: return null
                if (rank == GloryRank.Mythe && division.value != null) return null
                GloryFrameAppliesTo.Rank(rank, division.value)
            }
            "tier" -> LevelTierKey.entries.firstOrNull { GamePhotoCatchUpLaw.wire(it) == obj.string("tier") }
                ?.let(GloryFrameAppliesTo::Tier)
            "meesh" -> MeeshFrameEdition.entries.firstOrNull { it.wire == obj.string("edition") }
                ?.let(GloryFrameAppliesTo::Meesh)
            "treasury" -> TreasuryTierKey.entries.firstOrNull { GamePhotoCatchUpLaw.wire(it) == obj.string("treasury") }
                ?.let(GloryFrameAppliesTo::Treasury)
            "flame" -> (obj["days"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
                ?.takeIf { it in GamePhotoCatchUpLaw.flameThresholds }
                ?.let(GloryFrameAppliesTo::Flame)
            "day" -> GloryFrameAppliesTo.Day
            "achievement" -> {
                if ("rarity" !in obj) return null
                val raw = obj["rarity"]
                if (raw == null || raw is JsonNull) return GloryFrameAppliesTo.Achievement(null)
                GloryLaws.AchievementRarity.entries.firstOrNull { FrameUsageWire.rarityWire(it) == obj.string("rarity") }
                    ?.let(GloryFrameAppliesTo::Achievement)
            }
            else -> null
        }
    }

    /** Le placement d'un cadre, s'il se lit, s'il appartient à sa collection et s'il ne contredit pas son usage. */
    fun read(id: String, usage: FrameUsage, raw: JsonElement?): GloryFramePlacement? {
        val obj = raw as? JsonObject ?: return null
        val collection = obj.string("collection") ?: return null
        if (!id.startsWith("$collection.") || !PackSlug.isSlugShaped(collection)) return null
        val appliesTo = parseAppliesTo(obj["appliesTo"]) ?: return null
        if (!fits(appliesTo, usage)) return null
        val motifs = (obj["motifs"] as? kotlinx.serialization.json.JsonArray)
            ?.map { (it as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.contentOrNull?.takeIf(PackSlug::isSlugShaped) ?: return null }
            ?.takeIf { it.size <= MAX_MOTIFS } ?: return null
        val hidden = (obj["hidden"] as? JsonPrimitive)?.takeIf { !it.isString }?.contentOrNull
            ?.let { if (it == "true") true else if (it == "false") false else null } ?: return null
        val optionRaw = obj["option"]
        val option = if (optionRaw == null || optionRaw is JsonNull) {
            null
        } else {
            obj.string("option")?.takeIf { OPTION.matches(it) } ?: return null
        }
        return GloryFramePlacement(collection = collection, appliesTo = appliesTo, option = option, motifs = motifs, hidden = hidden)
    }
}

/** `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` — le motif des slugs du shared, sans regex. */
object PackSlug {
    fun isSlugShaped(value: String): Boolean =
        value.isNotEmpty() && value.first() != '-' && value.last() != '-' &&
            value.all { it in 'a'..'z' || it in '0'..'9' || it == '-' }
}
