package me.meeshy.app.push

import androidx.core.app.NotificationCompat

/**
 * Les trois points d'extension du rendu d'une notification de message (multibinding Hilt, déclarés vides dans
 * `PushRenduModule`) : un lot ultérieur (actions, nettoyage) contribue par `@Binds @IntoSet` depuis SON module, le
 * pipeline n'est plus édité.
 */

/** Dernier mot sur une bannière : décore le constructeur (couleur, sous-texte, extras) après les enrichisseurs. */
interface PushBannerDecorator {
    val order: Int get() = 0

    fun decorate(builder: NotificationCompat.Builder, push: IncomingPush)
}

/** Un veto supplémentaire : la bannière n'est postée que si TOUTES les portes l'autorisent. */
interface PushDisplayGate {
    fun allows(push: IncomingPush): Boolean
}

/** Des actions de bannière (boutons) contribuées par un lot ; ajoutées à la suite, dans l'ordre. */
interface PushActionProvider {
    val order: Int get() = 0

    fun actions(push: IncomingPush): List<NotificationCompat.Action>
}
