package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * `opening` / `closing` arrivent sous DEUX formes, et une seule était acceptée.
 *
 * Un client natif écrit la CHAÎNE (`"fade"`) ; le convertisseur de la
 * passerelle écrit un OBJET (`{"type":"fade"}`) — c'est la seule forme qu'il
 * transporte (`storyEffectsV3.ts:230`). iOS décode les deux depuis toujours
 * (`StoryModels.swift:1864-1867`) ; Android typait le champ en enum nu.
 *
 * L'enjeu débordait la transition : kotlinx échoue sur le DOCUMENT entier, si
 * bien qu'un `opening` objet emportait tout le `StoryEffects` — donc le post,
 * donc la page de fil qui le contenait. Une forme non reconnue ne doit coûter
 * QUE la transition.
 *
 * Le vocabulaire n'est pas redéclaré ici : la chaîne extraite est confiée au
 * sérialiseur de l'enum, seul porteur des `@SerialName`. Ajouter une valeur à
 * `StoryTransitionEffect` suffit donc à l'accepter dans les deux formes.
 */
object StoryTransitionTolerantSerializer : KSerializer<StoryTransitionEffect?> {
    private val delegate = StoryTransitionEffect.serializer()

    /**
     * Le descripteur annonce du JSON ARBITRAIRE, pas l'enum délégué. Annoncer
     * l'enum positionne le décodeur pour lire un enum, et `decodeJsonElement`
     * se désynchronise dès le séparateur suivant (« unexpected comma ») : la
     * forme CHAÎNE, seule à fonctionner auparavant, cassait alors.
     */
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): StoryTransitionEffect? {
        val input = decoder as? JsonDecoder ?: return null
        val token: JsonElement = when (val element = input.decodeJsonElement()) {
            is JsonObject -> element["type"] ?: return null
            else -> element
        }
        if (token !is JsonPrimitive || !token.isString) return null
        return runCatching { input.json.decodeFromJsonElement(delegate, token) }.getOrNull()
    }

    override fun serialize(encoder: Encoder, value: StoryTransitionEffect?) {
        if (value == null) {
            encoder.encodeNull()
            return
        }
        encoder.encodeSerializableValue(delegate, value)
    }
}
