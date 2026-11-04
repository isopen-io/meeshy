package me.meeshy.sdk.post

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object CommentDraftModule {

    @Provides
    @Singleton
    fun commentDraftStore(@ApplicationContext context: Context, json: Json): CommentDraftStore =
        CommentDraftStore(
            storage = SharedPrefsCommentDraftStorage(context),
            scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
            json = json,
        )

    @Provides
    @IntoSet
    fun commentDraftsPerAccount(store: CommentDraftStore): PerAccountCache = store
}
