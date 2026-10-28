package me.meeshy.sdk.media

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject

/** À la déconnexion ou au changement de compte, les copies EN CLAIR des médias choisis ([MediaIntake], #13553) ne restent pas pour le compte suivant. */
public class MediaIntakeTeardown @Inject constructor(@ApplicationContext private val context: Context) : PerAccountCache {
    override suspend fun clear(): Unit = withContext(Dispatchers.IO) { MediaIntake.clear(context.cacheDir) }
}

@Module
@InstallIn(SingletonComponent::class)
public interface MediaIntakeTeardownModule {
    @Binds
    @IntoSet
    public fun mediaIntakeTeardown(impl: MediaIntakeTeardown): PerAccountCache
}
