package me.meeshy.sdk.model.call.frames

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/**
 * QUELS CADRES POUR COMBIEN DE PERSONNES — miroir de `frame-catalogue.ts` + `frame-filter.ts`
 * et de `CallFrameCatalogue.swift`. À `n` personnes (moi compris), seuls les cadres dont la tranche
 * contient `n` se proposent. Le catalogue est lu des douze JSON partagés
 * (`CallFrameCatalogueGenerated`, généré par la tâche Gradle `generateCallFrameCatalogue`) : un motif
 * illisible ne fait tomber que SES cadres (fail-closed).
 */
public object CallFrameCatalogue {

    /** Tous les cadres, ordonnés par ambiance puis dans l'ordre des fichiers. */
    public val all: List<CallFrameDesign> by lazy { parse(CallFrameCatalogueGenerated.moodFiles.map { it.second }) }

    public fun bucket(people: Int): CallFrameBucket? = CallFrameBucket.entries.firstOrNull { people in it.people }

    public fun frames(
        forPeople: Int,
        mood: CallFrameMood? = null,
        among: List<CallFrameDesign> = all,
    ): List<CallFrameDesign> = among.filter { it.serves(forPeople) && (mood == null || it.mood == mood) }

    /** Les ambiances qui ont au moins un cadre pour `n`, dans l'ordre canonique. */
    public fun moods(forPeople: Int, among: List<CallFrameDesign> = all): List<CallFrameMood> {
        val served = frames(forPeople, among = among).map { it.mood }.toSet()
        return CallFrameMood.entries.filter { it in served }
    }

    /**
     * Le nombre a changé : le même motif dans la variante de la nouvelle tranche ; sinon le premier cadre
     * de la même ambiance ; sinon `null` (l'hôte retombe sur un classique).
     */
    public fun reconcile(selectedId: String, people: Int, among: List<CallFrameDesign> = all): CallFrameDesign? {
        among.firstOrNull { it.id == selectedId }?.takeIf { it.serves(people) }?.let { return it }
        val parts = selectedId.split(".")
        val motif = parts.take(2).joinToString(".")
        among.firstOrNull { it.motif == motif && it.serves(people) }?.let { return it }
        val mood = parts.firstOrNull().orEmpty()
        return among.firstOrNull { it.mood.raw == mood && it.serves(people) }
    }

    public fun frame(id: String, among: List<CallFrameDesign> = all): CallFrameDesign? = among.firstOrNull { it.id == id }

    /** Les cadres que déplient des fichiers d'ambiance bruts ; un fichier ou un motif illisible est ignoré. */
    public fun parse(moodFiles: List<String>): List<CallFrameDesign> =
        moodFiles
            .flatMap { text -> runCatching { motifs(text) }.getOrDefault(emptyList()) }
            .flatMap(::expand)
            .sortedBy { it.mood.ordinal }

    private fun motifs(text: String): List<Pair<CallFrameMood, JsonObject>> {
        val file = Json.parseToJsonElement(text) as? JsonObject ?: return emptyList()
        val mood = CallFrameMood.fromRaw((file["mood"] as? kotlinx.serialization.json.JsonPrimitive)?.content) ?: return emptyList()
        val motifs = file["motifs"] as? JsonArray ?: return emptyList()
        return motifs.mapNotNull { (it as? JsonObject)?.let { motif -> mood to motif } }
    }

    private fun expand(entry: Pair<CallFrameMood, JsonObject>): List<CallFrameDesign> {
        val (mood, motif) = entry
        val id = (motif["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return emptyList()
        val name = (motif["name"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return emptyList()
        val motifMood = CallFrameMood.fromRaw((motif["mood"] as? kotlinx.serialization.json.JsonPrimitive)?.content)
        if (motifMood != mood) return emptyList()
        val base = motif["base"] as? JsonObject ?: return emptyList()
        val variants = motif["variants"] as? JsonObject ?: return emptyList()
        val credits = CallFrameLookDecoder.credits(motif["credits"] as? JsonObject)
        val surfaces = CallFrameLookDecoder.surfaces(motif)
        val cost = CallFrameLookDecoder.cost(motif)
        return CallFrameBucket.entries.mapNotNull { bucket ->
            val variant = variants[bucket.raw] as? JsonObject ?: return@mapNotNull null
            val look = runCatching { CallFrameLookDecoder.look(JsonObject(base + variant)) }.getOrNull() ?: return@mapNotNull null
            CallFrameDesign(
                id = "$id.${bucket.raw}",
                motif = id,
                mood = mood,
                name = name,
                bucket = bucket,
                look = look,
                credits = credits,
                surfaces = surfaces,
                cost = cost,
            )
        }
    }
}
