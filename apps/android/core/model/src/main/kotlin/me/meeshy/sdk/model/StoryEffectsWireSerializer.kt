package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Le point d'étranglement de la lecture : `storyEffects` arrive sous DEUX
 * formes, et le marqueur `v` décide laquelle.
 *
 * `v >= 3` ⇒ document canvas v3, décodé puis rabattu sur les familles v1
 * (`StoryEffects.rendering`). Absent ⇒ ancien document, décodé tel quel. C'est
 * exactement la bascule d'iOS (`StoryModels.swift:1769-1774`), et pour la même
 * raison : le v3 est un format de transport, pas d'affichage — le viewer ne
 * change pas.
 *
 * L'ÉCRITURE reste v1 sans condition. Android n'annonce pas encore
 * `X-Canvas-Caps: 3` ; tant qu'il ne l'annonce pas, la passerelle continue de
 * lui servir des formes qu'il sait lire, et rien ne l'oblige à émettre du v3.
 *
 * Le sérialiseur est posé sur les PROPRIÉTÉS, jamais sur la classe : annoter
 * `StoryEffects` elle-même supprimerait le sérialiseur généré, dont ce pont a
 * précisément besoin pour la branche v1 — la classe se décoderait par
 * elle-même, indéfiniment. Les sites sont couverts par un test qui décode un
 * document v3 à travers chaque type d'entrée public plutôt que par un décompte
 * d'annotations : ce qui compte est qu'un post arrive lisible, pas qu'un
 * fichier porte la bonne ligne.
 */
object StoryEffectsWireSerializer : KSerializer<StoryEffects> {
    private val legacy = StoryEffects.serializer()
    private const val LAYOUT_KEY = "layout"

    /**
     * Le descripteur annonce du JSON ARBITRAIRE. Annoncer celui de `legacy`
     * positionnerait le décodeur pour lire une classe, et `decodeJsonElement`
     * se désynchroniserait dès le séparateur suivant — le même piège que la
     * tolérance des transitions a déjà coûté.
     */
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    /**
     * Le schéma v3 ÉVOLUE côté serveur : `carrierAspect` y a été ajouté le
     * 2026-08-22, d'autres champs suivront. Sa lecture doit donc tolérer
     * l'inconnu QUELLE QUE SOIT la configuration de l'appelant — le document
     * v3 est décodé par cette instance, jamais par `input.json`.
     *
     * Décoder avec celle de l'appelant rendait la tolérance dépendante d'un
     * réglage lointain : un appelant strict échouait sur le premier champ neuf,
     * l'échec était avalé, et la story s'affichait VIDE. Le mode de
     * défaillance exact que ce pont combat, réintroduit par le pont lui-même.
     *
     * La branche v1, elle, garde `input.json` : c'est le chemin historique et
     * il doit continuer d'obéir à l'appelant.
     */
    private val forwardTolerant = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    /**
     * L'agencement (#6514) est un attribut du canvas v3. Un document NON marqué
     * est la forme v1, qui ne le porte que par la réécriture d'Android lui-même
     * (voir [StoryEffects.layout]) ; un document MARQUÉ sous v3 se déclare
     * antérieur au canvas et ne peut donc pas en porter un.
     */
    override fun deserialize(decoder: Decoder): StoryEffects {
        val input = decoder as? JsonDecoder ?: return decoder.decodeSerializableValue(legacy)
        val element = input.decodeJsonElement()
        val document = element as? JsonObject ?: return StoryEffects()
        val mark = (document["v"] as? JsonPrimitive)?.intOrNull
            ?: return input.json.decodeFromJsonElement(legacy, document)
        if (mark < 3) return input.json.decodeFromJsonElement(legacy, JsonObject(document - LAYOUT_KEY))
        val canvas = runCatching { forwardTolerant.decodeFromJsonElement(CanvasV3.serializer(), document) }
            .getOrNull() ?: return StoryEffects()
        return StoryEffects.rendering(canvas, sceneIndex = 0)
    }

    override fun serialize(encoder: Encoder, value: StoryEffects) {
        encoder.encodeSerializableValue(legacy, value)
    }
}
