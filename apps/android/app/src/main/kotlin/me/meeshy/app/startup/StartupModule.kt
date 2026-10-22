package me.meeshy.app.startup

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.app.navigation.graph.NavGraphContributor

/**
 * Declare VIDES les quatre multibindings de la coque, pour que l'app demarre sans aucun
 * contributeur : un lot contribue avec `@Binds @IntoSet` depuis son propre module.
 */
@Module
@InstallIn(SingletonComponent::class)
interface StartupModule {
    @Multibinds
    fun appInitializers(): Set<@JvmSuppressWildcards AppInitializer>

    @Multibinds
    fun appOverlays(): Set<@JvmSuppressWildcards AppOverlay>

    @Multibinds
    fun appLocalsProviders(): Set<@JvmSuppressWildcards AppLocalsProvider>

    @Multibinds
    fun navGraphContributors(): Set<@JvmSuppressWildcards NavGraphContributor>
}
