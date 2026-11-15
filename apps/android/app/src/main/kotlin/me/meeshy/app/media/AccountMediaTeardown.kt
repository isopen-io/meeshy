package me.meeshy.app.media

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.ui.component.media.AccountMediaWipe

/** À la déconnexion ou au changement de compte, l'audio obtenu avec le jeton du compte quitté quitte le disque. */
class AccountMediaTeardown @Inject constructor(
    @ApplicationContext private val context: Context,
) : PerAccountCache {
    override suspend fun clear() = withContext(Dispatchers.IO) { AccountMediaWipe.wipe(context) }
}

@Module
@InstallIn(SingletonComponent::class)
interface AccountMediaTeardownModule {
    @Binds
    @IntoSet
    fun accountMediaTeardown(impl: AccountMediaTeardown): PerAccountCache
}
