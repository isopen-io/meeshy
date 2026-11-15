package me.meeshy.feature.kit

import androidx.compose.runtime.Composable
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.component.kit.MeeshyStatusCapsule
import me.meeshy.ui.component.kit.MeeshyStatusCapsuleAction
import me.meeshy.ui.component.kit.MeeshyStatusCapsuleKind
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/** Les états de K14, ceux d'iOS : le plafond (R10), le hors-ligne (P2), l'échec (P3), puis le ton clair, le thème, la teinte et la capsule fermable. */
internal val entryK14: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K14",
    name = "MeeshyStatusCapsule",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_PLAFOND, boardView = "R10", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_HORS_LIGNE, boardView = "P2", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_ECHEC, boardView = "P3", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_CLAIR, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_TEINTE, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_FERMABLE, backdrop = MeeshyKitCatalogBackdrop.Media),
    ),
)

private const val STATE_PLAFOND = "plafond"
private const val STATE_HORS_LIGNE = "hors-ligne"
private const val STATE_ECHEC = "echec"
private const val STATE_CLAIR = "clair"
private const val STATE_THEME = "theme"
private const val STATE_TEINTE = "teinte"
private const val STATE_FERMABLE = "fermable"

/**
 * L'échantillon d'un état : la FACE, aux mots des vues de la planche (R10 sur deux lignes à 350, P2 avec son Wi-Fi barré, P3
 * avec son détail et « Réessayer »). Le catalogue montre la face : elle ne vibre pas, ne s'annonce pas et ne se retire pas seule.
 */
@Composable
internal fun ContentK14(state: MeeshyKitCatalogState, isPressed: Boolean) {
    when (state.id) {
        STATE_PLAFOND -> MeeshyStatusCapsule(
            message = "Dix scènes au maximum — supprimez-en une pour en créer une autre",
            kind = MeeshyStatusCapsuleKind.Warning,
        )
        STATE_HORS_LIGNE -> MeeshyStatusCapsule(
            message = "Story enregistrée — publiée au retour en ligne",
            icon = MeeshyIcons.WifiOff,
        )
        STATE_ECHEC -> MeeshyStatusCapsule(
            message = "Non publié : le réel",
            detail = "Gardé en brouillon",
            kind = MeeshyStatusCapsuleKind.Failure,
            action = MeeshyStatusCapsuleAction(label = "Réessayer", icon = MeeshyIcons.Refresh) { },
            pressed = if (isPressed) true else null,
        )
        STATE_CLAIR -> MeeshyStatusCapsule(
            message = "Dix scènes au maximum",
            detail = "Supprimez-en une pour en créer une autre",
            kind = MeeshyStatusCapsuleKind.Warning,
            tone = MeeshyGlassTone.OnLight,
        )
        STATE_THEME -> MeeshyStatusCapsule(
            message = "Un seul compte par appareil",
            kind = MeeshyStatusCapsuleKind.Info,
            tone = MeeshyGlassTone.Theme,
        )
        STATE_TEINTE -> MeeshyStatusCapsule(
            message = "La caméra de Camille est coupée",
            icon = MeeshyIcons.VideoOff,
            kind = MeeshyStatusCapsuleKind.Warning,
            tint = MeeshyPalette.Error,
        )
        else -> MeeshyStatusCapsule(
            message = "Brouillon enregistré",
            kind = MeeshyStatusCapsuleKind.Success,
            closeLabel = "Fermer",
            onDismiss = { },
        )
    }
}
