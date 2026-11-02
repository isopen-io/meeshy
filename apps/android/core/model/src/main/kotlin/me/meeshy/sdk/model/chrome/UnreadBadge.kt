package me.meeshy.sdk.model.chrome

/**
 * Le libelle affiche par TOUTE pastille de compteur non-lu de l'app (chrome
 * flottant, futurs en-tetes repliables) — source unique du plafond, parite iOS
 * (99+). Pur : aucune dependance Compose, testable en JVM.
 */
public fun unreadBadgeLabel(count: Int): String =
    if (count > 99) "99+" else count.coerceAtLeast(0).toString()

/**
 * Lois de la pastille rouge chiffree d'une rangee (`UnreadCountBadge`, UnreadCountBadge.swift).
 *
 * Le portillon `count > 0` vit ICI : un appelant n'ecrit jamais `if (unread > 0)`. A zero (ou en negatif,
 * valeur qu'un decodage optimiste peut produire) la pastille ne rend RIEN et n'occupe aucune place.
 */
public object UnreadBadge {
    public const val HORIZONTAL_PADDING: Float = 7f
    public const val VERTICAL_PADDING: Float = 4f

    /** Plancher CARRE : a un chiffre la pastille reste un disque. */
    public const val MINIMUM_SIZE: Float = 24f
    public const val SHADOW_RADIUS: Float = 3f
    public const val SHADOW_OPACITY: Float = 0.25f

    public fun isVisible(count: Int): Boolean = count > 0

    /** Le texte rendu, ou `null` quand la pastille ne se monte pas. */
    public fun displayedText(count: Int): String? = if (isVisible(count)) unreadBadgeLabel(count) else null

    /** Le nombre lu par TalkBack : le VRAI compte, jamais le « 99+ » du dessin. */
    public fun spokenCount(count: Int): Int = count.coerceAtLeast(0)
}
