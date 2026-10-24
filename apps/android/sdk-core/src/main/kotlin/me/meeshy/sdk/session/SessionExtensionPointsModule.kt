package me.meeshy.sdk.session

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.sdk.socket.RealtimeBinding

/**
 * Declare VIDES les multibindings de session pour que le SDK fonctionne sans aucun
 * contributeur ; un lot contribue avec `@Binds @IntoSet` depuis son propre module.
 */
@Module
@InstallIn(SingletonComponent::class)
public interface SessionExtensionPointsModule {
    @Multibinds
    public fun perAccountCaches(): Set<@JvmSuppressWildcards PerAccountCache>

    @Multibinds
    public fun realtimeBindings(): Set<@JvmSuppressWildcards RealtimeBinding>
}
