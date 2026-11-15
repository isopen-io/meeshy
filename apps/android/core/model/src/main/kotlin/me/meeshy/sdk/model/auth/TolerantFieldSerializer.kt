package me.meeshy.sdk.model.auth

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import me.meeshy.sdk.model.MeeshyUser

/**
 * Un champ qu'on ne SAIT pas lire se lit ABSENT — il ne fait jamais échouer la
 * charge qui le porte (#9223).
 *
 * kotlinx échoue sur le DOCUMENT entier dès qu'un seul champ a le mauvais type :
 * un `adoptWithinSeconds` servi en chaîne emportait donc la session que la
 * passerelle venait d'ouvrir, et l'utilisateur lisait « réponse malformée » au
 * lieu d'être connecté. iOS isole déjà ces champs (`try?` dans
 * `LoginResponseData.init(from:)`) ; cette classe est le même geste, une seule
 * fois, pour tout champ d'une charge d'authentification.
 *
 * Le descripteur annonce du JSON ARBITRAIRE, pas le type délégué : annoncer le
 * type délégué positionne le décodeur pour lire CE type, et `decodeJsonElement`
 * se désynchronise dès le séparateur suivant (voir
 * `StoryTransitionTolerantSerializer`, qui a mesuré le défaut).
 *
 * Réservé aux charges lues de la passerelle : une CLÉ de requête ne se lit
 * jamais « en tolérance ».
 */
@OptIn(ExperimentalSerializationApi::class)
abstract class TolerantFieldSerializer<T : Any>(
    private val delegate: KSerializer<T>,
) : KSerializer<T?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): T? {
        val input = decoder as? JsonDecoder ?: return null
        val element = input.decodeJsonElement()
        if (element is JsonNull) return null
        return runCatching { input.json.decodeFromJsonElement(delegate, element) }.getOrNull()
    }

    override fun serialize(encoder: Encoder, value: T?) {
        if (value == null) {
            encoder.encodeNull()
            return
        }
        encoder.encodeSerializableValue(delegate, value)
    }
}

object TolerantStringSerializer : TolerantFieldSerializer<String>(String.serializer())

object TolerantIntSerializer : TolerantFieldSerializer<Int>(Int.serializer())

object TolerantBooleanSerializer : TolerantFieldSerializer<Boolean>(Boolean.serializer())

object TolerantUserSerializer : TolerantFieldSerializer<MeeshyUser>(MeeshyUser.serializer())

object TolerantLinkSignInAccountSerializer : TolerantFieldSerializer<LinkSignInAccount>(LinkSignInAccount.serializer())
