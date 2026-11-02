package me.meeshy.sdk.composer

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class AttachmentIngestionModule {

    @Binds
    abstract fun ingesting(impl: AttachmentIngestor): AttachmentIngesting

    @Binds
    abstract fun thumbnailing(impl: AttachmentThumbnailer): AttachmentThumbnailing
}
