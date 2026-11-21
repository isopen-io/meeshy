package me.meeshy.sdk.model.e2ee

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/**
 * Le tête-à-tête LISIBLE qu'on ouvre pour un pair sans appareil chiffré (#20076, miroir d'iOS `ReadableDirectOpening`) :
 * celui que la passerelle rend, s'il n'est ni le fil d'où l'on part ni un fil vu chiffré de bout en bout. Sinon rien ne
 * s'ouvre, et aucun clair ne part (#12949).
 */
object ReadableDirectOpening {
    fun destination(opened: String?, from: String, openedIsEndToEnd: Boolean): String? =
        opened?.takeIf { it.isNotEmpty() && it != from && !openedIsEndToEnd }
}

/**
 * Le bandeau « ne peut pas recevoir de messages chiffrés » (#20076, miroir d'iOS `EndToEndPeerWithoutDeviceBannerRule`) :
 * dans un tête-à-tête chiffré de bout en bout dont le pair est CONNU sans appareil chiffré, et seulement là.
 */
object EndToEndPeerWithoutDeviceBannerRule {
    fun shows(sealsEndToEnd: Boolean, isDirect: Boolean, peerLacksDevice: Boolean): Boolean =
        sealsEndToEnd && isDirect && peerLacksDevice
}

/** Le prénom qu'une phrase adresse : le premier mot du nom affiché (miroir d'iOS `PeerFirstName`). */
object PeerFirstName {
    fun of(name: String?): String = name.orEmpty().trim().split(WHITESPACE).firstOrNull().orEmpty()

    private val WHITESPACE = Regex("\\s+")
}

/**
 * Le refus 409 `E2EE_PARTICIPANT_WITHOUT_DEVICE` (#20073) d'une bascule ou d'une création de direct en bout en bout :
 * rien n'est activé. La bascule nomme les membres (`withoutDeviceUserIds`), la création personne : sans liste, c'est le
 * pair (miroir d'iOS `EndToEndParticipantWithoutDeviceRefusal`).
 */
object EndToEndParticipantWithoutDevice {
    const val CODE: String = "E2EE_PARTICIPANT_WITHOUT_DEVICE"

    fun matches(code: String?): Boolean = code == CODE

    /** Les identifiants lisibles d'un `withoutDeviceUserIds` servi (#20182) : une valeur mal formée n'emporte pas le refus. */
    fun userIdsFrom(element: JsonElement?): List<String> =
        (element as? JsonArray).orEmpty()
            .mapNotNull { (it as? JsonPrimitive)?.takeIf { value -> value.isString }?.content?.takeIf(String::isNotEmpty) }
            .distinct()

    /** Le prénom du pair s'il est nommé (ou si personne ne l'est) ; vide pour la phrase sans nom. */
    fun namedFirstName(peerUserId: String?, peerName: String?, withoutDeviceUserIds: List<String>): String {
        val namesPeer = withoutDeviceUserIds.isEmpty() || (peerUserId != null && peerUserId in withoutDeviceUserIds)
        return if (namesPeer) PeerFirstName.of(peerName) else ""
    }
}
