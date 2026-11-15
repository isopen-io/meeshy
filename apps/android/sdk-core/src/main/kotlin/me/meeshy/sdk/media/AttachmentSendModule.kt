package me.meeshy.sdk.media

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Le téléverseur de groupes de pièces d'un message : parallèle borné, rendant compte à la barre d'envoi globale. */
@Module
@InstallIn(SingletonComponent::class)
object AttachmentSendModule {
    @Provides
    @Singleton
    fun providesMediaGroupUploading(tus: TusGroupFileUploader, progress: UploadProgressCenter): MediaGroupUploading =
        MediaGroupUploader(tus, progress)
}
