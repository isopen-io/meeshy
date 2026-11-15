package me.meeshy.sdk.net

import android.content.Context
import android.content.pm.PackageInfo
import android.os.Build
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.model.net.AppVersionHeader

/** Contribue l'identité du client (version, build, appareil) à toutes les requêtes. */
@Module
@InstallIn(SingletonComponent::class)
internal object ClientInfoModule {

    @Provides
    @IntoSet
    fun providesClientInfoContributor(@ApplicationContext context: Context): HttpClientContributor {
        val info = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
        val provider = ClientInfoProvider(
            appVersion = info?.versionName?.takeIf { it.isNotBlank() } ?: AppVersionHeader.FALLBACK_VERSION,
            appBuild = info?.let(::buildNumber) ?: "0",
        )
        return HttpClientContributor.of("client-info", HttpPriority.CLIENT_INFO) {
            it.addInterceptor(ClientInfoInterceptor(provider))
        }
    }

    @Suppress("DEPRECATION")
    private fun buildNumber(info: PackageInfo): String =
        if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else info.versionCode.toString()
}
