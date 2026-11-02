package me.meeshy.sdk.model.call.frames

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Une ambiance que le carrousel d'appel ouvre d'office, et ses cadres vedettes (identifiants de MOTIF,
 * `ambiance.motif`), dans l'ordre où ils se proposent — miroir de `CallFrameSpotlight` (iOS), lu de
 * `packages/shared/design/call-capture-frames/spotlight.json` (#12683).
 */
public data class CallFrameSpotlight(val mood: CallFrameMood, val featured: List<String>)

/** Ce que le carrousel montre : les ambiances ouvertes d'office et leurs vedettes, ou tout le catalogue (« Plus d'ambiances »). */
public enum class CallFrameScope { SPOTLIGHT, ALL }

/**
 * **LA MISE EN AVANT DES CADRES** (#12683), portage de `CallFrameSpotlightRule.swift` : quelles ambiances,
 * quels cadres, dans quel ordre, selon la portée. Rien n'est retiré du catalogue : la portée ne fait que ranger.
 */
public object CallFrameSpotlightRule {

    /** Le fichier partagé déplié ; une entrée illisible ou d'ambiance inconnue est ignorée. */
    public fun parse(text: String): List<CallFrameSpotlight> {
        val root = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return emptyList()
        val moods = root["moods"] as? JsonArray ?: return emptyList()
        return moods.mapNotNull { entry ->
            val item = entry as? JsonObject ?: return@mapNotNull null
            val mood = CallFrameMood.fromRaw((item["mood"] as? JsonPrimitive)?.content) ?: return@mapNotNull null
            val featured = (item["featured"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content }
            CallFrameSpotlight(mood, featured)
        }
    }

    /** Les ambiances d'une portée qui servent `n` : ouvertes d'office dans l'ordre de la mise en avant, sinon l'ordre canonique. */
    public fun moods(
        people: Int,
        scope: CallFrameScope,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        spotlight: List<CallFrameSpotlight> = CallFrameCatalogue.spotlight,
    ): List<CallFrameMood> {
        val served = CallFrameCatalogue.moods(people, among)
        val featured = spotlight.map { it.mood }.filter { it in served }
        return if (scope == CallFrameScope.SPOTLIGHT && featured.isNotEmpty()) featured else served
    }

    /** Les cadres d'une ambiance pour `n` : ses seules vedettes, dans leur ordre (toute l'ambiance si aucune ne sert `n`), ou l'ordre du catalogue. */
    public fun frames(
        people: Int,
        mood: CallFrameMood,
        scope: CallFrameScope,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        spotlight: List<CallFrameSpotlight> = CallFrameCatalogue.spotlight,
    ): List<CallFrameDesign> {
        val served = CallFrameCatalogue.frames(people, mood, among)
        val order = spotlight.firstOrNull { it.mood == mood }?.featured.orEmpty()
        val featured = order.mapNotNull { motif -> served.firstOrNull { it.motif == motif } }
        return if (scope == CallFrameScope.SPOTLIGHT && featured.isNotEmpty()) featured else served
    }

    /** La portée montrée : celle demandée, sauf si le cadre choisi n'y figure pas — alors tout le catalogue. */
    public fun scope(
        frameId: String?,
        people: Int,
        requested: CallFrameScope,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        spotlight: List<CallFrameSpotlight> = CallFrameCatalogue.spotlight,
    ): CallFrameScope {
        if (requested != CallFrameScope.SPOTLIGHT || frameId == null) return requested
        val design = CallFrameCatalogue.frame(frameId, among) ?: return requested
        val base = CallFrameStyleRule.baseId(frameId)
        val visible = design.mood in moods(people, CallFrameScope.SPOTLIGHT, among, spotlight) &&
            frames(people, design.mood, CallFrameScope.SPOTLIGHT, among, spotlight).any { it.id == base }
        return if (visible) CallFrameScope.SPOTLIGHT else CallFrameScope.ALL
    }

    /** « Plus d'ambiances » révélerait-il quelque chose pour `n` ? */
    public fun hidesFrames(
        people: Int,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        spotlight: List<CallFrameSpotlight> = CallFrameCatalogue.spotlight,
    ): Boolean {
        val shown = moods(people, CallFrameScope.SPOTLIGHT, among, spotlight)
            .sumOf { frames(people, it, CallFrameScope.SPOTLIGHT, among, spotlight).size }
        return shown < CallFrameCatalogue.frames(people, among = among).size
    }
}
