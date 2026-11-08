package me.meeshy.sdk.story

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton
import kotlinx.serialization.json.Json

@Module
@InstallIn(SingletonComponent::class)
internal object ComposerAutosaveModule {

    @Provides
    @Singleton
    fun providesComposerAutosaveStore(@ApplicationContext context: Context, json: Json): ComposerAutosaveStoring =
        ComposerAutosaveDiskStore(
            filesDir = context.filesDir,
            sessionRoot = File(context.cacheDir, "composer_autosave_sessions"),
            json = json,
        )
}
