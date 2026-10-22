package me.meeshy.sdk.model.playback

/**
 * Ce que la session audio partagée accepte de cohabiter avec les autres applications.
 *
 * Port de `AVAudioSession.CategoryOptions` d'iOS réduit à ce que Meeshy décide : [NonMixable]
 * (aucune option) met la musique des autres applications en PAUSE et rend Meeshy interruptible par
 * elles — côté Android, une demande de focus audio exclusive. [Mixable] ne demande rien : Meeshy
 * joue par-dessus. Décision porteur du 2026-10-19 (#11039) : plus de baisse (`duckOthers`), plus de
 * mélange pour un son audible.
 */
public enum class SessionMixing {
    NonMixable,
    Mixable,
}

/**
 * La catégorie de la session partagée à un instant donné — port de `AVAudioSession.Category`
 * réduit aux trois états que les lois de Meeshy distinguent.
 */
public enum class SessionCategory {
    /** Lecture de contenu : un son Meeshy s'entend, les autres applications se taisent. */
    Playback,

    /** Lecture ET enregistrement : un vocal ou une vidéo se filme. */
    PlayAndRecord,

    /** Posée sans activer : une image muette ne touche pas à la musique des autres applications. */
    Ambient,
}

/**
 * Profil de session qu'un moteur de lecture transmet à la loi de session — port de iOS
 * `AudioSessionProfile`.
 *
 * Les deux profils posent la MÊME session, celle de [ContentPlaybackSessionLaw] : non mélangeable.
 * Toute surface Meeshy qui lance un son le fait, aperçus et réels compris. Ce qui les distingue
 * reste la carte « À l'écoute » : [Content] est le moteur qui la publie (vocaux de conversation),
 * [Transient] ne la prend jamais. QUEL moteur est [Content] est une décision produit côté
 * application (règle SDK purity), pas de cette loi.
 */
public enum class AudioSessionProfile {
    Content,
    Transient,
    ;

    /** Les deux profils mettent les autres applications en pause. */
    public val mixing: SessionMixing
        get() = ContentPlaybackSessionLaw.AUDIBLE_MIXING

    /** Seul le moteur de contenu publie la carte « À l'écoute » (lecture en cours, écran verrouillé). */
    public val publishesListeningCard: Boolean
        get() = this == Content
}
