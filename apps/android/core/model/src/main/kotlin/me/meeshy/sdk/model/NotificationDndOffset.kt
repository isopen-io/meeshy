package me.meeshy.sdk.model

/**
 * Ré-estampille le décalage UTC de l'appareil sur le bloc notifications (iOS `updateNotification`) :
 * la passerelle évalue la fenêtre « Ne pas déranger » dans l'heure LOCALE de l'utilisateur, donc
 * chaque écriture (voyage, changement d'heure) pose le décalage du moment, en minutes à AJOUTER à l'UTC.
 */
public fun UserNotificationPreferences.withDeviceUtcOffset(offsetMinutes: Int): UserNotificationPreferences =
    if (dndUtcOffsetMinutes == offsetMinutes) this else copy(dndUtcOffsetMinutes = offsetMinutes)
