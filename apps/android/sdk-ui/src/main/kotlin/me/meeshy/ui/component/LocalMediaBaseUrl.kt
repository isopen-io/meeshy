package me.meeshy.ui.component

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * La base d'API CONFIGURÉE (origine + préfixe versionné), fournie une fois par l'application à la
 * racine de chaque activité. [MeeshyAvatar] s'en sert pour résoudre la référence d'avatar qu'on lui
 * passe (clé de stockage, `static:`, URL héritée) — aucun appelant ne compose d'adresse (#12569).
 * `null` hors fourniture : une clé nue ne se charge pas et l'avatar reste en initiales.
 */
public val LocalMediaBaseUrl: ProvidableCompositionLocal<String?> = staticCompositionLocalOf { null }
