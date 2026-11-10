package me.meeshy.feature.kit

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * K00 n'a pas d'entrée à son catalogue : il EST le catalogue. Son propre état vide en est le premier instantané
 * (`Catalogue/vide.clair`, `vide.sombre`, `planche.grande-police`, `planche.rtl`), sur la même vue que l'écran.
 *
 * Les références s'enregistrent par l'entrée `record_snapshots` d'android.yml, jamais sur un poste. Tant que le
 * dépôt n'en porte pas, le témoin se suspend (hypothèse JUnit, lisible comme « ignoré » dans le rapport) au lieu de
 * tomber sur une référence absente ; dès qu'elles y sont, il compare — et un mode `record` les réécrit.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CatalogueSnapshotTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun check(stem: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        assumeTrue(
            "référence $NAME/$stem absente : à enregistrer par android.yml (record_snapshots)",
            KitSnapshot.isRecording || KitSnapshot.file(NAME, stem).isFile,
        )
        compose.setContent(content)
        KitSnapshot.capture(compose, NAME, stem)
    }

    @Test
    fun `l'etat vide au clair`() = check(KitSnapshot.imageStem("vide", KitSnapshot.Variant.Clair)) {
        MeeshyTheme(darkTheme = false) { MeeshyKitCatalogEmptyState() }
    }

    @Test
    fun `l'etat vide au sombre`() = check(KitSnapshot.imageStem("vide", KitSnapshot.Variant.Sombre)) {
        MeeshyTheme(darkTheme = true) { MeeshyKitCatalogEmptyState() }
    }

    @Test
    fun `la planche en grande police`() = check(KitSnapshot.imageStem(KitSnapshot.BOARD_ID, KitSnapshot.Variant.GrandePolice)) {
        KitSnapshot.BoardEnvironment(KitSnapshot.Variant.GrandePolice) { EmptyBoard() }
    }

    @Test
    fun `la planche en RTL`() = check(KitSnapshot.imageStem(KitSnapshot.BOARD_ID, KitSnapshot.Variant.Rtl)) {
        KitSnapshot.BoardEnvironment(KitSnapshot.Variant.Rtl) { EmptyBoard() }
    }

    @androidx.compose.runtime.Composable
    private fun EmptyBoard() {
        Column(Modifier.padding(MeeshySpacing.lg)) { MeeshyKitCatalogEmptyState() }
    }

    private companion object {
        const val NAME = "Catalogue"
    }
}
