package me.meeshy.feature.kit

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runAndroidComposeUiTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * L'instantané de chaque composant LIVRÉ du catalogue, dans tous ses états : `<Nom>/<id>.<variante>.png` (clair,
 * sombre, et pressé pour un état qui se touche), puis les planches `grande-police` et `rtl`. Générique : un lot du kit
 * ne l'écrit pas, il remplit son `KitCatalogKxx.kt` et enregistre ses images. Aucune entrée livrée ⇒ rien à photographier.
 * Une référence ABSENTE d'un composant livré est un échec (la garde du registre la nomme aussi).
 *
 * Chaque tuile a son propre environnement de test : une règle Compose n'accepte qu'un seul `setContent` par témoin.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class KitCatalogSnapshotTest {

    @Test
    fun `chaque etat livre correspond a son image`() {
        MeeshyKitCatalog.listedEntries.forEach { entry ->
            entry.states.forEach { state ->
                KitSnapshot.variants(state).forEach { variant ->
                    runAndroidComposeUiTest<ComponentActivity> {
                        KitSnapshot.show(this, entry.key, state, variant)
                        KitSnapshot.capture(this, entry.name, KitSnapshot.imageStem(state.id, variant))
                    }
                }
            }
            listOf(KitSnapshot.Variant.GrandePolice, KitSnapshot.Variant.Rtl).forEach { variant ->
                runAndroidComposeUiTest<ComponentActivity> {
                    KitSnapshot.showBoard(this, entry, variant)
                    KitSnapshot.capture(this, entry.name, KitSnapshot.imageStem(KitSnapshot.BOARD_ID, variant))
                }
            }
        }
    }
}
