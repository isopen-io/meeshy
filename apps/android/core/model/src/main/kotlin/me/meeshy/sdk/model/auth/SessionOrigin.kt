package me.meeshy.sdk.model.auth

/**
 * D'où vient la session ouverte, miroir de `SessionOrigin` (iOS `AuthModels.swift`).
 *
 * Une inscription et une connexion posent le même booléen « authentifié » et
 * n'autorisent pourtant pas la même chose : demander la permission de notification à
 * quelqu'un qui vient de créer son compte, c'est une alerte système avant son premier
 * message ; la fête d'arrivée ne se joue que pour une inscription. Android ajoute
 * [LINK] : l'invité entré par un lien partagé.
 */
public enum class SessionOrigin {
    LOGIN,
    REGISTRATION,
    LINK,

    /** Session relue du stockage au démarrage, ou jeton renouvelé. */
    RESTORED,
}
