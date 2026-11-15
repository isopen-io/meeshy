package me.meeshy.sdk.media

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Lie la sonde du tier média au graphe : une seule instance, donc un seul
 * matériel lu pour tous les consommateurs. Les lois de lecture reçoivent
 * [DeviceMediaTierSource] et jamais la sonde concrète.
 */
@Module
@InstallIn(SingletonComponent::class)
public object DeviceMediaModule {

    @Provides
    @Singleton
    public fun deviceMediaTierSource(@ApplicationContext context: Context): DeviceMediaTierSource =
        DeviceMediaProbe.forContext(context)
}
