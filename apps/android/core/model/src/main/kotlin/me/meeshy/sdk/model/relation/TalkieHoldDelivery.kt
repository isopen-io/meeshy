package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.phonereachability.PhoneReachabilityState
import me.meeshy.sdk.model.phonereachability.PhoneUnreachableLasting

/**
 * Ce que le geste du talkie fait partir (#20241, iso `TalkieDelivery.swift`) : la voix en direct, ou — quand la passerelle
 * me sert que le téléphone du destinataire est injoignable depuis plusieurs minutes ([PhoneUnreachableLasting]) — un
 * message vocal déposé dans notre conversation directe. Sans état servi : toujours le direct. (Distinct de
 * [TalkieDelivery], ce que la passerelle dit d'une prise de parole ouverte.)
 */
public enum class TalkieHoldDelivery {
    LIVE,
    VOICE_MESSAGE,
    ;

    public companion object {
        public fun resolve(unreachable: PhoneReachabilityState?, nowMillis: Long): TalkieHoldDelivery =
            of(lasting = PhoneUnreachableLasting.isLasting(unreachable, nowMillis))

        public fun of(lasting: Boolean): TalkieHoldDelivery = if (lasting) VOICE_MESSAGE else LIVE
    }
}
