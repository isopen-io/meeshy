package me.meeshy.app.overlay

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.ui.component.feedback.FeedbackToastCenterHost

/** L'hôte unique des toasts de retour, au-dessus du `NavHost` : tout `FeedbackToastCenter.show` s'y voit, depuis n'importe quel écran. */
class FeedbackToastOverlay @Inject constructor(
    private val center: FeedbackToastCenter,
) : AppOverlay {
    override val order: Int = 900

    @Composable
    override fun Content(navController: NavHostController) {
        FeedbackToastCenterHost(center = center, modifier = Modifier)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FeedbackToastOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: FeedbackToastOverlay): AppOverlay
}
