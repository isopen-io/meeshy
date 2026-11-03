package me.meeshy.sdk.story

/**
 * Le schéma de clé (et la taille) du cache disque de la couverture composite locale d'une story ou d'un brouillon
 * (iOS `StoryCoverCacheKey`). Partagé entre l'app (couverture de publication) et le SDK (sauvegarde automatique du brouillon) :
 * une convention de nom et de taille, aucune décision produit.
 */
public object StoryCoverCacheKey {
    /** Largeur de rendu, en pixels : assez nette pour l'anneau du plateau et la carte de la grille « Mes stories ». */
    public const val RENDER_WIDTH: Int = 270

    /** Hauteur de rendu, en pixels : 9:16. */
    public const val RENDER_HEIGHT: Int = 480

    /** Schéma synthétique : il ne peut jamais heurter l'entrée de cache d'une adresse de média. */
    public fun key(id: String): String = "story-cover:$id"
}
