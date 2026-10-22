package me.meeshy.sdk.appearance

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import timber.log.Timber

/**
 * Les deux coutures du [AppearanceCatalogLoader] : le fichier en assets et le journal. La logique
 * décidable (lecture une fois, catalogue vide plutôt que plantage) vit dans le chargeur, et dans
 * `AppearanceCatalog` côté `:core:model` ; ceci n'est que du câblage.
 */
@Module
@InstallIn(SingletonComponent::class)
public object AppearanceModule {

    @Provides
    @Singleton
    public fun providesAppearanceCatalogAsset(
        @ApplicationContext context: Context,
    ): AppearanceCatalogAsset =
        AppearanceCatalogAsset { context.assets.open(AppearanceCatalogLoader.ASSET_NAME) }

    @Provides
    @Singleton
    public fun providesAppearanceCatalogErrorLog(): AppearanceCatalogErrorLog =
        AppearanceCatalogErrorLog { cause, message -> Timber.e(cause, message) }
}
