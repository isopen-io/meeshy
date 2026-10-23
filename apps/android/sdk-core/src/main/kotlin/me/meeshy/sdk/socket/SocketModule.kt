package me.meeshy.sdk.socket

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.net.AppVersionHeader
import me.meeshy.sdk.net.ClientInfoProvider
import javax.inject.Singleton

/** L'identité du client telle que la socket la déclare à la poignée de main. */
fun interface SocketClientIdentity {
    fun identity(): me.meeshy.sdk.model.net.ClientIdentity
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class SocketBindingsModule {
    @Binds
    abstract fun bindsSocketFactory(impl: IoSocketFactory): SocketFactory
}

@Module
@InstallIn(SingletonComponent::class)
internal object SocketIdentityModule {
    @Provides
    @Singleton
    fun providesSocketClientIdentity(@ApplicationContext context: Context): SocketClientIdentity {
        val info = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
        val provider = ClientInfoProvider(
            appVersion = info?.versionName?.takeIf { it.isNotBlank() } ?: AppVersionHeader.FALLBACK_VERSION,
            appBuild = info?.let(::buildNumber) ?: "0",
        )
        return SocketClientIdentity { provider.identity() }
    }

    @Suppress("DEPRECATION")
    private fun buildNumber(info: android.content.pm.PackageInfo): String =
        if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else info.versionCode.toString()
}
