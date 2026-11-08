package me.meeshy.sdk.model.pack

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.game.FrameCaptureMedia
import me.meeshy.sdk.model.game.FrameMomentFamily
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.FrameUseContext
import me.meeshy.sdk.model.game.FreeFrameSurface
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank

/*
 * LA FORME DU FIL DE LA LOI D'USAGE DES CADRES (#10146) — miroir de `FrameUsageSchema` / `FrameUseContextSchema`
 * (`packages/shared/types/frame-usage.ts`) et du `Codable` de `FrameUsage.swift`. La LOI (`FrameUsageLaw.canUseFrame`)
 * et ses types vivent avec la loi de proposition (`model.game`) : ici, la lecture FAIL-CLOSED, le libellé de puce et la
 * projection des cadres de capture d'appel. Sur divergence, le TypeScript a raison.
 */

/** Les surfaces déclarées par un cadre de capture d'appel (`design/call-capture-frames`) ; absentes = [CAPTURE]. */
enum class CaptureFrameSurface(val wire: String) {
    CAPTURE("capture"),
    LIVE("live"),
    ;

    companion object {
        fun fromWire(raw: String?): CaptureFrameSurface? = entries.firstOrNull { it.wire == raw }
    }
}

/**
 * Le libellé « Utilisable : … » d'une puce : une clé du catalogue iOS (`frame.usage.*`) et ses paramètres — des CLÉS
 * (`rank`, `rarity`, `family`) que l'écran traduit, sauf `division`, déjà en chiffres romains.
 */
data class FrameUsageLabel(val key: String, val params: Map<String, String> = emptyMap())

/** Les douze clés du libellé d'usage, identiques à `FRAME_USAGE_LABEL_KEYS` du shared. */
object FrameUsageLabelKey {
    const val CALL_AND_CAPTURE = "frame.usage.callAndCapture"
    const val CAPTURE_ONLY = "frame.usage.captureOnly"
    const val PHOTO_ONLY = "frame.usage.photoOnly"
    const val VIDEO_ONLY = "frame.usage.videoOnly"
    const val RANK_ONLY = "frame.usage.rankOnly"
    const val RANK_DIVISION_ONLY = "frame.usage.rankDivisionOnly"
    const val PRESTIGE_ONLY = "frame.usage.prestigeOnly"
    const val ACHIEVEMENT_ONLY = "frame.usage.achievementOnly"
    const val ACHIEVEMENT_RARITY_ONLY = "frame.usage.achievementRarityOnly"
    const val MOMENT_ONLY = "frame.usage.momentOnly"
    const val AVATAR_ONLY = "frame.usage.avatarOnly"
    const val BANNER_FRAME_ONLY = "frame.usage.bannerFrameOnly"

    val all: List<String> = listOf(
        CALL_AND_CAPTURE, CAPTURE_ONLY, PHOTO_ONLY, VIDEO_ONLY, RANK_ONLY, RANK_DIVISION_ONLY, PRESTIGE_ONLY,
        ACHIEVEMENT_ONLY, ACHIEVEMENT_RARITY_ONLY, MOMENT_ONLY, AVATAR_ONLY, BANNER_FRAME_ONLY,
    )
}

/** Lecture et écriture fail-closed de l'usage et du contexte d'un cadre. */
object FrameUsageWire {

    private val ROMAN = listOf("I", "II", "III", "IV", "V")

    /** `describeFrameUsage` : le libellé de puce d'un usage. */
    fun describe(usage: FrameUsage): FrameUsageLabel = when (usage) {
        is FrameUsage.Free -> FrameUsageLabel(freeLabel(usage.surfaces))
        is FrameUsage.Rank -> usage.division
            ?.let { FrameUsageLabel(FrameUsageLabelKey.RANK_DIVISION_ONLY, mapOf("rank" to rankWire(usage.rank), "division" to ROMAN[it - 1])) }
            ?: FrameUsageLabel(FrameUsageLabelKey.RANK_ONLY, mapOf("rank" to rankWire(usage.rank)))
        FrameUsage.Prestige -> FrameUsageLabel(FrameUsageLabelKey.PRESTIGE_ONLY)
        is FrameUsage.Achievement -> usage.rarity
            ?.let { FrameUsageLabel(FrameUsageLabelKey.ACHIEVEMENT_RARITY_ONLY, mapOf("rarity" to rarityWire(it))) }
            ?: FrameUsageLabel(FrameUsageLabelKey.ACHIEVEMENT_ONLY)
        is FrameUsage.Moment -> FrameUsageLabel(FrameUsageLabelKey.MOMENT_ONLY, mapOf("family" to usage.family.wire))
    }

    private fun freeLabel(surfaces: List<FreeFrameSurface>): String = when {
        surfaces == listOf(FreeFrameSurface.Avatar) -> FrameUsageLabelKey.AVATAR_ONLY
        surfaces == listOf(FreeFrameSurface.Banner) -> FrameUsageLabelKey.BANNER_FRAME_ONLY
        FreeFrameSurface.Call in surfaces -> FrameUsageLabelKey.CALL_AND_CAPTURE
        FreeFrameSurface.Photo in surfaces && FreeFrameSurface.Video in surfaces -> FrameUsageLabelKey.CAPTURE_ONLY
        FreeFrameSurface.Photo in surfaces -> FrameUsageLabelKey.PHOTO_ONLY
        else -> FrameUsageLabelKey.VIDEO_ONLY
    }

    /**
     * `captureFrameUsage` : `live` ⇒ appel ET capture ; `capture` seul (ou rien de déclaré) ⇒ photo et vidéo, jamais
     * l'appel.
     */
    fun captureFrameUsage(surfaces: List<CaptureFrameSurface>?): FrameUsage =
        if (surfaces?.contains(CaptureFrameSurface.LIVE) == true) {
            FrameUsage.Free(listOf(FreeFrameSurface.Call, FreeFrameSurface.Photo, FreeFrameSurface.Video))
        } else {
            FrameUsage.Free(listOf(FreeFrameSurface.Photo, FreeFrameSurface.Video))
        }

    /** L'usage lu, ou `null` pour tout ce qui est illisible (genre, surface ou rang futurs, division du Mythe…). */
    fun parseUsage(element: JsonElement?): FrameUsage? {
        val obj = element as? JsonObject ?: return null
        return when (obj.string("kind")) {
            "free" -> parseSurfaces(obj["surfaces"])?.let(FrameUsage::Free)
            "rank" -> {
                val rank = parseRank(obj.string("rank")) ?: return null
                val division = obj.division("division") ?: return null
                if (rank == GloryRank.Mythe && division.value != null) return null
                FrameUsage.Rank(rank, division.value)
            }
            "prestige" -> FrameUsage.Prestige
            "achievement" -> obj.rarity()?.let { FrameUsage.Achievement(it.value) }
            "moment" -> parseFamily(obj.string("family"))?.let(FrameUsage::Moment)
            else -> null
        }
    }

    /** Le contexte lu ; le Mythe sans division, tout autre rang avec. */
    fun parseContext(element: JsonElement?): FrameUseContext? {
        val obj = element as? JsonObject ?: return null
        return when (obj.string("kind")) {
            "call" -> FrameUseContext.Call
            "avatar" -> FrameUseContext.Avatar
            "banner" -> FrameUseContext.Banner
            "capture" -> when (obj.string("media")) {
                "photo" -> FrameUseContext.Capture(FrameCaptureMedia.Photo)
                "video" -> FrameUseContext.Capture(FrameCaptureMedia.Video)
                else -> null
            }
            "rank" -> {
                val rank = parseRank(obj.string("rank")) ?: return null
                val division = obj.division("division") ?: return null
                if ((rank == GloryRank.Mythe) != (division.value == null)) return null
                FrameUseContext.Rank(rank, division.value)
            }
            "prestige" -> FrameUseContext.Prestige
            "achievement" -> obj.rarity()?.let { FrameUseContext.Achievement(it.value) }
            "moment" -> parseFamily(obj.string("family"))?.let(FrameUseContext::Moment)
            else -> null
        }
    }

    /** Un usage de cadre de gloire récompense le jeu : il n'est jamais libre. */
    fun isGloryUsage(usage: FrameUsage): Boolean = usage !is FrameUsage.Free

    internal fun rankWire(rank: GloryRank): String = rank.name.lowercase()

    internal fun rarityWire(rarity: GloryLaws.AchievementRarity): String = rarity.name.lowercase()

    internal fun parseRank(raw: String?): GloryRank? = GloryRank.entries.firstOrNull { rankWire(it) == raw }

    internal fun parseFamily(raw: String?): FrameMomentFamily? = FrameMomentFamily.entries.firstOrNull { it.wire == raw }

    private fun parseSurfaces(element: JsonElement?): List<FreeFrameSurface>? {
        val array = element as? JsonArray ?: return null
        val surfaces = array.map { item ->
            FreeFrameSurface.entries.firstOrNull { it.wire == (item as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.contentOrNull }
                ?: return null
        }
        return surfaces.takeIf { it.isNotEmpty() && it.toSet().size == it.size }
    }

    private fun JsonObject.rarity(): Optional<GloryLaws.AchievementRarity>? {
        val raw = this["rarity"]
        if (raw == null || raw is JsonNull) return Optional(null)
        val parsed = GloryLaws.AchievementRarity.entries.firstOrNull { rarityWire(it) == string("rarity") } ?: return null
        return Optional(parsed)
    }
}

/** Une valeur lue qui peut être légitimement absente (`null`) — distincte de « illisible » (pas de valeur). */
internal class Optional<T>(val value: T?)


internal fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

/** `null` (JSON ou absent) = pas de division ; un entier 1..5 = la division ; tout autre = illisible. */
internal fun JsonObject.division(key: String): Optional<Int>? {
    val raw = this[key]
    if (raw == null || raw is JsonNull) return Optional(null)
    val value = (raw as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull ?: return null
    return value.takeIf { it in 1..5 }?.let { Optional(it) }
}

