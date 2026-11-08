package me.meeshy.sdk.cache.purge

import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CacheMediaIndex
import me.meeshy.sdk.model.mediacache.CacheMediaKind

/**
 * Un stockage disque de médias (cache d'images, vignettes, vidéo, audio). Les fichiers y sont indexés par URL. Toutes
 * les mesures sont réelles (taille de chaque fichier, jamais une estimation) ; une erreur d'E/S sur un fichier ne
 * quitte pas la boucle, elle compte ce fichier pour zéro et passe au suivant.
 */
public interface MediaDiskStore {
    /** Octets occupés par tout le stockage. Dossier absent = zéro. */
    public suspend fun totalBytes(): Long

    /** Octets des fichiers cités par [urls] ; un fichier absent compte pour zéro. */
    public suspend fun bytesFor(urls: Set<String>): Long

    /** Supprime les fichiers cités par [urls] et rend les octets réellement libérés. */
    public suspend fun purge(urls: Set<String>): Long

    /** Octets des fichiers que [keep] ne cite pas : le résidu que personne ne revendique. */
    public suspend fun bytesExcluding(keep: Set<String>): Long

    /** Supprime les fichiers que [keep] ne cite pas et rend les octets réellement libérés. */
    public suspend fun purgeExcluding(keep: Set<String>): Long
}

/**
 * Les stockages disque par nature de fichier. Une URL d'image peut avoir atterri dans le cache d'images OU dans les
 * vignettes : [stores] d'IMAGES rend donc les deux, et un fichier absent d'un stockage compte pour zéro, si bien que la
 * somme reste exacte sans double comptage.
 */
public interface CacheMediaDisks {
    public fun stores(kind: CacheMediaKind): List<MediaDiskStore>

    public fun all(): List<MediaDiskStore> = CacheMediaKind.entries.flatMap { stores(it) }.distinct()
}

/** Une charge JSON gardée en base (messages, conversations, stories, fil). */
public interface CachePayloadStore {
    /** Octets réels de la charge. */
    public suspend fun bytes(): Long

    /** Vide la charge et rend les octets réellement libérés. */
    public suspend fun clear(): Long
}

/** La charge de la case (type x domaine), ou `null` si le croisement n'en a pas. */
public interface CachePayloadStores {
    public fun store(kind: CacheDataKind, domain: CacheDomain): CachePayloadStore?
}

/** D'où vient l'attribution : domaine -> URLs, dérivée des entités encore en cache. */
public fun interface CacheAttributionSource {
    public suspend fun index(): Map<CacheDomain, CacheMediaIndex>
}
