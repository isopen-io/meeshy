package me.meeshy.sdk.model

/**
 * Pourquoi CET appareil ne montre pas le clair d'un message chiffré de bout en bout (#18983, #18980) : la bulle dit le cas,
 * jamais « à lire sur iPhone ». Posé EN MÉMOIRE par la projection du coffre (`EndToEndPlaintextOverlay`), jamais servi par
 * la passerelle ni écrit sur le disque.
 */
public enum class EndToEndSeal {
    /** L'enveloppe n'est pas encore arrivée sur cet appareil, ou s'ouvre en ce moment. */
    PENDING,

    /** Cet appareil l'a reçue mais ne peut pas l'ouvrir (spec § 4.1) : rien ne repart en clair. */
    UNREADABLE,

    /** Une version plus récente de Meeshy sait la lire : son clair est gardé sur l'appareil, il suffit de mettre à jour. */
    UPDATE_REQUIRED,

    /** Écrite sur un autre de MES appareils, que celui-ci n'a pas encore approuvé : sa copie attend. */
    OTHER_DEVICE,
}
