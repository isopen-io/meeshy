package me.meeshy.sdk.model.chrome

/**
 * Le libelle affiche par TOUTE pastille de compteur non-lu de l'app (chrome
 * flottant, futurs en-tetes repliables) — source unique du plafond, parite iOS
 * (99+). Pur : aucune dependance Compose, testable en JVM.
 */
public fun unreadBadgeLabel(count: Int): String =
    if (count > 99) "99+" else count.coerceAtLeast(0).toString()
