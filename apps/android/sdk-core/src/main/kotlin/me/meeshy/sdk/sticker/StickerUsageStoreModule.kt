package me.meeshy.sdk.sticker

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
public object StickerUsageStoreModule {
    @Provides
    @Singleton
    public fun provideStickerUsageStore(@ApplicationContext context: Context): StickerUsageStore =
        StickerUsageStore(SharedPrefsStickerUsageStorage(context))
}
