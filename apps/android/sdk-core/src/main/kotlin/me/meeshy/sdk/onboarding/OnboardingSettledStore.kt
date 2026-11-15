package me.meeshy.sdk.onboarding

import android.content.Context
import android.content.SharedPreferences
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Retient, par compte, qu'un parcours est RÉGLÉ (fini, passé, non éligible) : le lancement suivant n'interroge plus le
 * serveur (iOS `OnboardingSettledStoring`).
 */
interface OnboardingSettledStore {
    fun isSettled(userId: String): Boolean
    fun markSettled(userId: String)
}

@Singleton
class SharedPreferencesOnboardingSettledStore @Inject constructor(
    @ApplicationContext context: Context,
) : OnboardingSettledStore {
    private val preferences: SharedPreferences =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun isSettled(userId: String): Boolean = preferences.getBoolean(key(userId), false)

    override fun markSettled(userId: String) {
        preferences.edit().putBoolean(key(userId), true).apply()
    }

    private fun key(userId: String) = "onboarding.settled.$userId"

    private companion object {
        const val FILE = "meeshy_onboarding"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface OnboardingSettledStoreModule {
    @Binds
    fun bind(store: SharedPreferencesOnboardingSettledStore): OnboardingSettledStore
}
