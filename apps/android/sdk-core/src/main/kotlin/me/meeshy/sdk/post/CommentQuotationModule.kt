package me.meeshy.sdk.post

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object CommentQuotationModule {

    @Provides
    @Singleton
    fun commentQuotationStore(): CommentQuotationStore = CommentQuotationStore()

    @Provides
    @IntoSet
    fun commentQuotationPerAccount(store: CommentQuotationStore): PerAccountCache = store
}
