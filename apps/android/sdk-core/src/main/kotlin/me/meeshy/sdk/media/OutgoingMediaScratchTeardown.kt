package me.meeshy.sdk.media

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject

/**
 * À la déconnexion ou au changement de compte, les copies nettoyées EN CLAIR du cache privé (`outgoing-clean`, #13551) qu'un
 * envoi interrompu a laissées ne restent pas pour le compte suivant.
 */
public class OutgoingMediaScratchTeardown @Inject constructor(private val sanitizer: OutgoingMediaSanitizer) : PerAccountCache {
    override suspend fun clear(): Unit = withContext(Dispatchers.IO) { sanitizer.clearScratch() }
}

@Module
@InstallIn(SingletonComponent::class)
public interface OutgoingMediaScratchTeardownModule {
    @Binds
    @IntoSet
    public fun outgoingMediaScratchTeardown(impl: OutgoingMediaScratchTeardown): PerAccountCache
}
