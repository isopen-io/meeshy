package me.meeshy.sdk.pack

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.pack.FramePack
import me.meeshy.sdk.model.pack.FramePackSerializer
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.session.SessionRepository

/** L'étagère des cadres de packs : le service de détail, la langue du lecteur, et le chargeur. Le libellé d'usage est lié par l'app. */
@Module
@InstallIn(SingletonComponent::class)
object FramePackShelfModule {
    @Provides
    @Singleton
    fun provideFramePackDetails(transport: PackTransport): FramePackDetails {
        val service = PackService(PackDomain.GLORY_FRAME, FramePackSerializer, transport)
        return FramePackDetails { slug -> service.detail(slug) }
    }

    @Provides
    @Singleton
    fun provideShelfLanguage(session: SessionRepository): ShelfLanguage =
        ShelfLanguage { session.currentUser.value?.systemLanguage?.takeIf { it.isNotBlank() } ?: LanguageResolver.FALLBACK_LANGUAGE }

    @Provides
    @Singleton
    fun provideFramePackContractStore(store: ContentAddressedStore, index: PackFileIndex): FramePackContractStore =
        FramePackContractStore(store, index)

    @Provides
    @Singleton
    fun provideFramePackShelfLoader(
        details: FramePackDetails,
        contracts: FramePackContractStore,
        language: ShelfLanguage,
        usageCopy: FrameUsageCopy,
    ): FramePackShelfLoader = FramePackShelfLoader(details, contracts, language, usageCopy)
}
