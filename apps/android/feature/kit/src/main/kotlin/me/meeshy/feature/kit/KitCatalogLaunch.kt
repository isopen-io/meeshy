package me.meeshy.feature.kit

import android.content.Intent
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry

/**
 * **Accès DEBUG au catalogue du kit**, sans compte ni réseau — pour voir chaque composant dans tous ses états :
 *
 * ```
 * adb shell am start -n me.meeshy.app.debug/me.meeshy.feature.kit.KitCatalogActivity --es kit K02
 * ```
 *
 * Sans clé, la liste des composants livrés s'ouvre ; avec une clé livrée, le détail de ce composant. Une clé inconnue
 * ou non livrée laisse la liste. Lecture pure, donc testable sans activité. Miroir de `KitCatalogLaunch` (iOS).
 */
public object KitCatalogLaunch {
    public const val EXTRA_KIT: String = "kit"

    /** La clé du composant à ouvrir si elle est livrée, `null` pour laisser la liste. */
    public fun initialKey(
        requested: String?,
        entries: List<MeeshyKitCatalogEntry> = MeeshyKitCatalog.entries,
    ): String? = requested?.let { MeeshyKitCatalog.listedEntry(matching = it, entries = entries)?.key }

    public fun initialKey(
        intent: Intent?,
        entries: List<MeeshyKitCatalogEntry> = MeeshyKitCatalog.entries,
    ): String? = initialKey(requested = intent?.getStringExtra(EXTRA_KIT), entries = entries)
}
