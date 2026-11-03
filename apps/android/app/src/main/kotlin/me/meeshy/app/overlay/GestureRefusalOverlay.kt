package me.meeshy.app.overlay

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.R
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.chat.GestureRefusalCenter
import me.meeshy.sdk.chat.GestureRefusalEvent
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.ui.component.feedback.dailyGestureLimitMessage

/**
 * La bannière des refus de gestes, au-dessus du `NavHost` : « Limite du jour atteinte, retour à HH:mm » (à l'heure locale)
 * et le mode lent des nouveaux comptes, depuis n'importe quel écran. Elle ne lit que [GestureRefusalCenter] : une erreur
 * réseau n'y arrive jamais, donc hors ligne aucune bannière de refus ne se lève. Le rendu passe par le présentateur
 * unique des toasts ([FeedbackToastCenter]).
 */
class GestureRefusalOverlay @Inject constructor(
    private val refusals: GestureRefusalCenter,
    private val toasts: FeedbackToastCenter,
) : AppOverlay {
    override val order: Int = 800

    @Composable
    override fun Content(navController: NavHostController) {
        val context = LocalContext.current
        LaunchedEffect(refusals) {
            refusals.events.collect { event ->
                val message = when (event) {
                    is GestureRefusalEvent.DailyLimit -> dailyGestureLimitMessage(context, event.limit)
                    is GestureRefusalEvent.SlowMode -> context.getString(R.string.gesture_refusal_slow_mode, event.mode.retryAfterSeconds)
                }
                toasts.show(message, FeedbackToastKind.ERROR)
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface GestureRefusalOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: GestureRefusalOverlay): AppOverlay
}
