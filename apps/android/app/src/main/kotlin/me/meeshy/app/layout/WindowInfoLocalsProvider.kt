package me.meeshy.app.layout

import androidx.compose.runtime.Composable
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.ui.layout.ProvideMeeshyWindowInfo
import javax.inject.Inject

/**
 * Publie `LocalMeeshyWindowInfo` (taille et classe de la fenetre, posture, zone sure, decoupe) a
 * tout l'arbre de navigation : une seule mesure de fenetre, que les bulles et les ecrans lisent.
 */
class WindowInfoLocalsProvider @Inject constructor() : AppLocalsProvider {
    override val order: Int = -90

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        ProvideMeeshyWindowInfo(content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface WindowInfoLocalsModule {
    @Binds
    @IntoSet
    fun bindWindowInfoLocalsProvider(provider: WindowInfoLocalsProvider): AppLocalsProvider
}
