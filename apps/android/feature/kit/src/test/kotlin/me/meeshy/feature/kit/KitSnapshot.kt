package me.meeshy.feature.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.ComposeUiTest
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import com.github.takahirom.roborazzi.RoborazziOptions
import com.github.takahirom.roborazzi.captureRoboImage
import java.io.File
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'aide d'instantané du kit (Roborazzi sur Robolectric). Les noms d'image sont les mêmes qu'en iOS :
 * `<Nom>/<id>.<variante>.png`, une planche `grande-police` et une planche `rtl` sous l'`id` `planche`.
 *
 * Mode : `verify` (le défaut, DANS `testDebugUnitTest`) compare à la référence versionnée ; `record` la réécrit — par
 * l'entrée `record_snapshots` d'android.yml seulement, jamais sur un poste (la machine qui enregistre est celle qui juge).
 */
internal object KitSnapshot {

    enum class Variant(val label: String) {
        Clair("clair"),
        Sombre("sombre"),
        Presse("presse"),
        GrandePolice("grande-police"),
        Rtl("rtl"),
    }

    const val BOARD_ID: String = "planche"
    const val LARGE_FONT_SCALE: Float = 2f

    /** Les variantes d'un état : clair et sombre ; pressé en plus s'il se touche. */
    fun variants(state: MeeshyKitCatalogState): List<Variant> =
        if (state.isTouchable) listOf(Variant.Clair, Variant.Sombre, Variant.Presse) else listOf(Variant.Clair, Variant.Sombre)

    fun imageStem(id: String, variant: Variant): String = "$id.${variant.label}"

    /** Vrai quand la CI enregistre les références (`-Pmeeshy.kit.snapshots=record`), faux quand elle les compare. */
    val isRecording: Boolean
        get() = System.getProperty("meeshy.kit.snapshots") == "record"

    val directory: File
        get() = System.getProperty("meeshy.kit.snapshotsDir")?.let(::File) ?: KitRepository.snapshots

    fun file(name: String, stem: String): File = File(directory, "$name/$stem.png")

    // Paresseux : RoborazziOptions s'initialise avec l'environnement Android, que l'audit pur (JVM nue) n'a pas.
    private val options: RoborazziOptions by lazy {
        RoborazziOptions(compareOptions = RoborazziOptions.CompareOptions(changeThreshold = 0.001f))
    }

    /** Photographie la racine du contenu posé : l'image est cadrée au composant, jamais à l'appareil. */
    fun capture(provider: SemanticsNodeInteractionsProvider, name: String, stem: String) {
        provider.onRoot().captureRoboImage(file(name, stem), options)
    }

    /** Une tuile, dans la variante demandée, sur la scène partagée avec l'écran du catalogue. */
    @OptIn(ExperimentalTestApi::class)
    fun show(test: ComposeUiTest, key: String, state: MeeshyKitCatalogState, variant: Variant) {
        test.setContent {
            MeeshyTheme(darkTheme = variant != Variant.Clair) {
                MeeshyKitCatalogStage(key = key, state = state, isPressed = variant == Variant.Presse)
            }
        }
    }

    /** Toutes les tuiles d'un composant empilées, en grande police ou en RTL. */
    @OptIn(ExperimentalTestApi::class)
    fun showBoard(test: ComposeUiTest, entry: MeeshyKitCatalogEntry, variant: Variant) {
        test.setContent {
            BoardEnvironment(variant) {
                Column(Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
                    entry.tiles.forEach { tile ->
                        MeeshyKitCatalogStage(key = entry.key, state = tile.state, isPressed = tile.isPressed)
                    }
                }
            }
        }
    }

    @Composable
    fun BoardEnvironment(variant: Variant, content: @Composable () -> Unit) {
        val density = LocalDensity.current
        MeeshyTheme(darkTheme = true) {
            CompositionLocalProvider(
                LocalLayoutDirection provides if (variant == Variant.Rtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
                LocalDensity provides if (variant == Variant.GrandePolice) Density(density.density, fontScale = LARGE_FONT_SCALE) else density,
                content = content,
            )
        }
    }
}
