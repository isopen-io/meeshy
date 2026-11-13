package me.meeshy.feature.kit

import androidx.compose.runtime.Composable
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState

/**
 * Le catalogue du kit : les 25 entrées du registre, dans l'ordre, et le répartiteur qui rend le contenu d'une tuile.
 * Écrit UNE fois : chaque lot du kit ne modifie que son propre `KitCatalogKxx.kt`. Miroir de `MeeshyKitCatalog` (iOS).
 */
public object MeeshyKitCatalog {
    public val entries: List<MeeshyKitCatalogEntry> = listOf(
        entryK01, entryK02, entryK03, entryK04, entryK05,
        entryK06, entryK07, entryK08, entryK09, entryK10,
        entryK11, entryK12, entryK13, entryK14, entryK15,
        entryK16, entryK17, entryK18, entryK19, entryK20,
        entryK21, entryK22, entryK23, entryK24, entryK25,
    )

    public val listedEntries: List<MeeshyKitCatalogEntry> = listed(entries)

    /** Les entrées LIVRÉES, dans l'ordre : une entrée sans état n'apparaît pas. */
    public fun listed(entries: List<MeeshyKitCatalogEntry>): List<MeeshyKitCatalogEntry> =
        entries.filter { it.isDelivered }

    /** L'entrée livrée dont la clé est [key] (casse ignorée) ; `null` pour une clé inconnue ou non livrée. */
    public fun listedEntry(
        matching: String,
        entries: List<MeeshyKitCatalogEntry> = MeeshyKitCatalog.entries,
    ): MeeshyKitCatalogEntry? = listed(entries).firstOrNull { it.key.equals(matching, ignoreCase = true) }

    @Composable
    public fun Content(key: String, state: MeeshyKitCatalogState, isPressed: Boolean) {
        when (key) {
            "K01" -> ContentK01(state, isPressed)
            "K02" -> ContentK02(state, isPressed)
            "K03" -> ContentK03(state, isPressed)
            "K04" -> ContentK04(state, isPressed)
            "K05" -> ContentK05(state, isPressed)
            "K06" -> ContentK06(state, isPressed)
            "K07" -> ContentK07(state, isPressed)
            "K08" -> ContentK08(state, isPressed)
            "K09" -> ContentK09(state, isPressed)
            "K10" -> ContentK10(state, isPressed)
            "K11" -> ContentK11(state, isPressed)
            "K12" -> ContentK12(state, isPressed)
            "K13" -> ContentK13(state, isPressed)
            "K14" -> ContentK14(state, isPressed)
            "K15" -> ContentK15(state, isPressed)
            "K16" -> ContentK16(state, isPressed)
            "K17" -> ContentK17(state, isPressed)
            "K18" -> ContentK18(state, isPressed)
            "K19" -> ContentK19(state, isPressed)
            "K20" -> ContentK20(state, isPressed)
            "K21" -> ContentK21(state, isPressed)
            "K22" -> ContentK22(state, isPressed)
            "K23" -> ContentK23(state, isPressed)
            "K24" -> ContentK24(state, isPressed)
            "K25" -> ContentK25(state, isPressed)
            else -> Unit
        }
    }
}
