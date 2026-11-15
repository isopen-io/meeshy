package me.meeshy.app.appearance

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.model.appearance.AppearanceGamut
import me.meeshy.ui.theme.LocalConversationAccentGamut
import javax.inject.Inject

/** Fournit la gamme d'accents personnels à toute surface en contexte de conversation (liste, fil, appels). */
class ConversationAccentGamutProvider @Inject constructor(
    private val loader: AppearanceCatalogLoader,
) : AppLocalsProvider {
    override val order: Int = -40

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        LaunchedEffect(Unit) { runCatching { loader.catalog() } }
        val catalog by loader.state.collectAsState()
        val gamut = remember(catalog) { catalog?.gamut ?: AppearanceGamut.EMPTY }
        CompositionLocalProvider(LocalConversationAccentGamut provides gamut, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationAccentGamutModule {
    @Binds
    @IntoSet
    abstract fun bindConversationAccentGamutProvider(provider: ConversationAccentGamutProvider): AppLocalsProvider
}
