package me.meeshy.sdk.net

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Le coffre de session hors de l'app (#14058), propre au serveur que ce processus sert et lié à CET appareil.
 * Sans identifiant d'appareil, aucun coffre : la session ne vit que dans l'app, comme avant.
 */
@Module
@InstallIn(SingletonComponent::class)
internal object SessionBackupModule {

    @Provides
    @Singleton
    fun providesSessionBackup(@ApplicationContext context: Context, config: MeeshyConfig): SessionBackup {
        val deviceId = deviceId(context) ?: return NoSessionBackup
        return BlockStoreSessionBackup(context, SessionBackupKey.of(config.apiBaseUrl), deviceId)
    }

    @SuppressLint("HardwareIds")
    private fun deviceId(context: Context): String? =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)?.takeIf { it.isNotBlank() }
}
