package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem

/**
 * Le décor local d'un profil et ses transitions PURES — miroir de `ProfileDecorState`
 * (ProfileDecor.swift). Équiper s'écrit au toucher ; la réponse du serveur fait foi ; un refus ou une
 * panne rétablit LE CÔTÉ touché — jamais l'autre : un instantané complet écraserait un événement
 * arrivé entre-temps.
 */
data class ProfileDecorState(val decor: ServedProfileDecor = ServedProfileDecor.EMPTY) {

    /** Le décor après un choix, et ce qu'il faut pour revenir en arrière ([previous]). */
    data class Equipped(val state: ProfileDecorState, val previous: ServedProfileDecorItem?)

    /** Applique le choix (`null` = retirer) et rend l'élément précédent du côté. */
    fun equip(item: ServedProfileDecorItem?, side: ProfileDecorSide): Equipped =
        Equipped(copy(decor = decor.with(side, item)), previous = decor[side])

    /** La réponse du serveur remplace le décor. */
    fun confirm(served: ServedProfileDecor): ProfileDecorState = copy(decor = served)

    /** Rétablit CE côté seulement. */
    fun rollback(side: ProfileDecorSide, previous: ServedProfileDecorItem?): ProfileDecorState =
        copy(decor = decor.with(side, previous))

    /** `profile:decor-updated` : mes autres appareils ; l'événement d'un autre compte est ignoré. */
    fun apply(event: ProfileDecorUpdatedEvent, myUserId: String): ProfileDecorState =
        if (event.userId == myUserId) copy(decor = event.decor) else this
}
