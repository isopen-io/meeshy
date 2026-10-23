package me.meeshy.sdk.model.mediacache

/** Axe « type de donnée » de la purge sélective (miroir de `CacheDataKind`, iOS). L'ordre est l'ordre d'affichage. */
public enum class CacheDataKind {
    IMAGES,
    VIDEOS,
    AUDIO,
    DOCUMENTS,
    MESSAGES,
    REACTIONS,
    PAYLOADS,
    ;

    /** Vrai pour les trois types portés par un store disque de médias. */
    public val isMedia: Boolean
        get() = this == IMAGES || this == VIDEOS || this == AUDIO
}
