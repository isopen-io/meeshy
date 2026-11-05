package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.ui.accessibility.LocalReduceMotion
import javax.inject.Inject

/** Relaie « Réduire les animations » aux transitions du Flux : sous ce réglage, la surcouche n'est qu'un fondu. */
class FeedOverlayMotionLocalsProvider @Inject constructor() : AppLocalsProvider {
    override val order: Int = 0

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        val reduce = LocalReduceMotion.current
        SideEffect { FeedOverlayTransition.reduceMotion = reduce }
        content()
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface FeedOverlayMotionModule {
    @Binds
    @IntoSet
    fun bindFeedOverlayMotionLocalsProvider(provider: FeedOverlayMotionLocalsProvider): AppLocalsProvider
}
