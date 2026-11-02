package me.meeshy.app.lottie

import android.content.Context
import androidx.compose.runtime.Composable
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.ui.component.lottie.BundledPackFileReader
import me.meeshy.ui.component.lottie.DiskCachedPackFileReader
import me.meeshy.ui.component.lottie.LottieLayerSource
import me.meeshy.ui.component.lottie.PackFileReaders
import me.meeshy.ui.component.lottie.ProvideLottieLayerSource
import okhttp3.OkHttpClient
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fournit la source des couches Lottie à tout l'arbre (#13952) : sans elle, contours, bannières et fonds animés
 * restaient à leur image fixe. Les couches du catalogue sont embarquées ; une couche servie plus tard par un pack se
 * télécharge une fois, se vérifie par empreinte et se garde sur disque — comme `ContentAddressedStore` d'iOS.
 */
class LottieLayerLocalsProvider @Inject constructor(
    private val source: LottieLayerSource,
) : AppLocalsProvider {
    override val order: Int = -90

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        ProvideLottieLayerSource(source, content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface LottieLayerLocalsModule {
    @Binds
    @IntoSet
    fun bindLottieLayerLocalsProvider(provider: LottieLayerLocalsProvider): AppLocalsProvider

    companion object {
        @Provides
        @Singleton
        fun providesLottieLayerSource(
            @ApplicationContext context: Context,
            config: MeeshyConfig,
            client: OkHttpClient,
        ): LottieLayerSource = LottieLayerSource(
            PackFileReaders.firstOf(
                BundledPackFileReader { path -> context.assets.open(path) },
                DiskCachedPackFileReader(File(context.cacheDir, "pack-lottie"), HttpPackFileReader(client, config.apiBaseUrl)),
            ),
        )
    }
}
