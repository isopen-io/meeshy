package me.meeshy.core.crypto.session

/** Pourquoi une session n'est pas disponible. L'interface explique ; aucune cause ne produit un envoi en clair. */
public enum class E2eeSessionFailure {
    /** Un établissement a échoué il y a moins de 600 s : on ne re-sollicite pas la passerelle. */
    COOLDOWN,

    /** Le pair n'a jamais publié de clés. */
    KEYS_NOT_PUBLISHED,

    /** Réseau, droits ou serveur : la passerelle n'a pas pu servir le bundle ou noter la session. */
    UNAVAILABLE,

    /** Le bundle du pair est mal formé. */
    MALFORMED_BUNDLE,

    /** Les clés de CET appareil ne se relisent pas : réinitialisation consciente requise. */
    IDENTITY_UNREADABLE,

    /** Aucun compte connecté. */
    NO_ACCOUNT,

    /** Le coffre n'a pas gardé la clé de session. */
    PERSISTENCE,
}

public class E2eeSessionException(public val failure: E2eeSessionFailure) : Exception("Session E2EE indisponible : $failure")
