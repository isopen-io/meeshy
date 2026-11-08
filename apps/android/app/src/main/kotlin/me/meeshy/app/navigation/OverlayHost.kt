package me.meeshy.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import javax.inject.Inject
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.ui.component.feedback.FeedbackToastCenterHost
import me.meeshy.ui.theme.MeeshyTheme

/** Les emplacements de l'hôte global (iOS `OverlayHost`) : chacun se remplit par un [RootOverlaySlotContent]. */
enum class RootOverlaySlot { AGE_GATE, CLOSURE_NOTICE, CRASH_REPORT }

/** Le contenu d'un emplacement, contribué en `@IntoSet` par le lot qui le possède ; vide par défaut. */
interface RootOverlaySlotContent {
    val slot: RootOverlaySlot

    @Composable
    fun Content()
}

@Module
@InstallIn(SingletonComponent::class)
internal interface RootOverlaySlotsModule {
    @Multibinds
    fun slots(): Set<@JvmSuppressWildcards RootOverlaySlotContent>
}

@HiltViewModel
class OverlayHostViewModel @Inject constructor(
    val toasts: FeedbackToastCenter,
    slots: Set<@JvmSuppressWildcards RootOverlaySlotContent>,
) : ViewModel() {
    /** Dans l'ordre de [RootOverlaySlot] : barrière d'âge, avis de fermeture, rapport de plantage. */
    val orderedSlots: List<RootOverlaySlotContent> = slots.sortedBy { it.slot.ordinal }
}

/**
 * L'hôte global des superpositions de la racine : les emplacements (barrière d'âge, avis de fermeture, rapport de
 * plantage) d'abord, puis les toasts de retour TOUT AU SOMMET — au-dessus des couvertures invité, visiteur et accueil.
 * Monté une fois par [MeeshyApp], au-dessus de tout sauf du rideau de démarrage.
 */
@Composable
internal fun OverlayHost() {
    val host: OverlayHostViewModel = hiltViewModel()
    host.orderedSlots.forEach { content -> key(content.slot) { content.Content() } }
    FeedbackToastCenterHost(center = host.toasts, modifier = Modifier)
}

/**
 * Tant que la session stockée n'est pas vérifiée (route NONE), un fond plein recouvre le graphe : l'écran de connexion
 * ne clignote jamais. Il avale les touchers, et le graphe reste monté dessous (les liens de lancement le trouvent prêt).
 */
@Composable
internal fun RootUndecidedCover(visible: Boolean) {
    if (!visible) return
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .pointerInput(Unit) {},
    )
}
