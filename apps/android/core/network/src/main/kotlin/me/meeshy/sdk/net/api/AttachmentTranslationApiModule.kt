package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object AttachmentTranslationApiModule {
    @Provides
    @Singleton
    fun provideAttachmentTranslationApi(retrofit: Retrofit): AttachmentTranslationApi =
        retrofit.create(AttachmentTranslationApi::class.java)
}
