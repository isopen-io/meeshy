package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.syncpill.SyncPillDotStyle
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import me.meeshy.sdk.model.syncpill.SyncPillRow
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshySyncPillTest {
    @get:Rule
    val compose = createComposeRule()

    private val texts = SyncPillTexts(
        multiple = { count, label -> "$count signals. Active: $label." },
        retryHint = "Touch to retry",
        openHint = "Touch to open",
        pause = "Pause",
        resume = "Resume",
    )

    private fun row(
        id: String,
        label: String,
        style: SyncPillDotStyle = SyncPillDotStyle.BRAND,
        dots: Boolean = true,
        target: OutboxNavigationSource? = null,
        retry: String? = null,
        typing: Boolean = false,
    ) = SyncPillUiRow(
        SyncPillRow(id, null, label, SyncPillGlyph.NONE, style, dots, target, retry, typing),
        label,
    )

    private val retried = mutableListOf<String>()
    private val navigated = mutableListOf<OutboxNavigationSource>()

    private fun show(vararg rows: SyncPillUiRow, reduceMotion: Boolean = false, content: @Composable () -> Unit = {}) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                MeeshyTheme {
                    MeeshySyncPill(rows.toList(), texts, onRetry = { retried += it }, onNavigate = { navigated += it })
                    content()
                }
            }
        }
        settle()
    }

    private fun settle() = repeat(4) { compose.mainClock.advanceTimeByFrame() }

    @Test
    fun `une entree courante est annoncee en un seul noeud`() {
        show(row("a", "Envoi de message"))
        compose.onAllNodesWithContentDescription("Envoi de message").assertCountEquals(1)
        compose.onNodeWithContentDescription("Envoi de message").assertIsDisplayed()
    }

    @Test
    fun `plusieurs entrees annoncent leur nombre et l'entree active`() {
        show(row("a", "Hors ligne", SyncPillDotStyle.WARNING, dots = false), row("b", "Envoi de message"))
        compose.onNodeWithContentDescription("2 signals. Active: Hors ligne.").assertIsDisplayed()
    }

    @Test
    fun `la cible tactile fait 48 dp malgre la capsule de 22 dp`() {
        // `minimumInteractiveComponentSize()` réserve la CIBLE TACTILE de 48 dp ; les bornes de mise en page du nœud
        // restent celles du contenu (comme les témoins de Material 3 : `assertTouchHeightIsEqualTo`, jamais la hauteur).
        // Mouvement réduit : l'entrée n'a pas d'échelle, la cible se mesure au repos.
        show(row("a", "Envoi de message"), reduceMotion = true)
        compose.onNodeWithContentDescription("Envoi de message").assertTouchHeightIsEqualTo(48.dp)
    }

    @Test
    fun `la region vivante est polie`() {
        show(row("a", "Envoi de message"))
        compose.onNodeWithContentDescription("Envoi de message")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun `un texte tres long reste annonce en entier`() {
        val long = "Envoi d'un message particulierement long qui depasse largement la largeur maximale de la capsule"
        show(row("a", long))
        compose.onNodeWithContentDescription(long).assertIsDisplayed()
    }

    @Test
    fun `la reduction des animations garde la pastille affichee et annoncee`() {
        show(row("a", "Hors ligne", SyncPillDotStyle.WARNING, dots = false), reduceMotion = true)
        compose.onNodeWithContentDescription("Hors ligne").assertIsDisplayed()
    }

    @Test
    fun `un envoi sans etat persistant s'efface apres six secondes`() {
        show(row("a", "Envoi de message"))
        compose.mainClock.advanceTimeBy(7_000)
        compose.onAllNodesWithContentDescription("Envoi de message").assertCountEquals(0)
    }

    @Test
    fun `hors ligne reste affiche, jamais efface`() {
        show(row("a", "Hors ligne", SyncPillDotStyle.WARNING, dots = false))
        compose.mainClock.advanceTimeBy(30_000)
        compose.onNodeWithContentDescription("Hors ligne").assertIsDisplayed()
    }

    @Test
    fun `toucher une entree avec source navigue`() {
        val source = OutboxNavigationSource.Conversation("c1", "m1")
        show(row("a", "Envoi de message", target = source))
        compose.onNodeWithContentDescription("Envoi de message").performTouchInput { click() }
        assertThat(navigated).containsExactly(source)
        assertThat(retried).isEmpty()
    }

    @Test
    fun `toucher un echec definitif le relance au lieu de naviguer`() {
        show(row("a", "Message non envoye", SyncPillDotStyle.ERROR, dots = false, target = OutboxNavigationSource.Conversation("c1", null), retry = "o1"))
        compose.onNodeWithContentDescription("Message non envoye").performTouchInput { click() }
        assertThat(retried).containsExactly("o1")
        assertThat(navigated).isEmpty()
    }

    @Test
    fun `l'appui long gele la rotation et propose de reprendre`() {
        show(row("a", "Hors ligne", SyncPillDotStyle.WARNING, dots = false), row("b", "Envoi de message"))
        val node = compose.onNodeWithContentDescription("2 signals. Active: Hors ligne.")
        node.performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(600)
        node.performTouchInput { up() }
        settle()
        val actions = node.fetchSemanticsNode().config[SemanticsActions.CustomActions]
        assertThat(actions.map { it.label }).containsExactly("Resume")
        assertThat(navigated).isEmpty()
    }

    @Test
    fun `sans appui long l'action propose de mettre en pause`() {
        show(row("a", "Hors ligne", SyncPillDotStyle.WARNING, dots = false))
        val actions = compose.onNodeWithContentDescription("Hors ligne").fetchSemanticsNode().config[SemanticsActions.CustomActions]
        assertThat(actions.map { it.label }).containsExactly("Pause")
    }

    @Test
    fun `sans entree rien n'est dessine`() {
        show()
        compose.onAllNodes(hasContentDescription("Envoi de message")).assertCountEquals(0)
    }
}
