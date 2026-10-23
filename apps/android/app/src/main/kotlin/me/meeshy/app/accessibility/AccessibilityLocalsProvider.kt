package me.meeshy.app.accessibility

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.preferences.AccessibilityPreferencesStore
import me.meeshy.ui.accessibility.ProvideReduceMotion
import javax.inject.Inject

/** Fournit `LocalReduceMotion` a tout l'arbre : reglage systeme OU override applicatif persiste. */
class AccessibilityLocalsProvider @Inject constructor(
    private val store: AccessibilityPreferencesStore,
) : AppLocalsProvider {
    override val order: Int = -100

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        val settings = store.settings.collectAsState().value
        ProvideReduceMotion(userForced = settings.reduceMotion, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface AccessibilityLocalsModule {
    @Binds
    @IntoSet
    fun bindAccessibilityLocalsProvider(provider: AccessibilityLocalsProvider): AppLocalsProvider
}
