package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object SharedTranslationApiModule {
    @Provides
    @Singleton
    fun provideSharedTranslationApi(retrofit: Retrofit): SharedTranslationApi =
        retrofit.create(SharedTranslationApi::class.java)
}
