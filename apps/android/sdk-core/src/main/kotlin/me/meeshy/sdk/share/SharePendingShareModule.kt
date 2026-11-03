package me.meeshy.sdk.share

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object SharePendingShareModule {

    @Provides
    @Singleton
    fun sharePendingShareStore(@ApplicationContext context: Context): SharePendingShareStore =
        SharePendingShareStore(File(context.filesDir, "share_pending_sends"))

    @Provides
    @IntoSet
    fun sharePendingShareAccountCache(store: SharePendingShareStore): PerAccountCache = store
}
