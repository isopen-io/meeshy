package me.meeshy.app.appearance

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ProfileDecorResolver
import me.meeshy.ui.appearance.AvatarRingResolver
import me.meeshy.ui.appearance.LocalAvatarRingResolver
import javax.inject.Inject

/** Le résolveur de contours d'un catalogue : un `builtin` se lit dans l'APK, un autre modèle ne se peint pas. */
internal fun avatarRingResolver(catalog: AppearanceCatalog?): AvatarRingResolver =
    if (catalog == null) AvatarRingResolver.Absent else AvatarRingResolver { ProfileDecorResolver.ring(it, catalog) }

/**
 * Fournit `LocalAvatarRingResolver` à tout l'arbre : chaque `MeeshyAvatar` qui reçoit la référence du contour équipé
 * d'une personne le résout par le catalogue embarqué (chargé une fois, hors du fil principal). Tant qu'il n'est pas
 * là, aucun contour — l'avatar se peint comme avant, puis le contour arrive sans rien décaler.
 */
class AvatarRingResolverProvider @Inject constructor(
    private val loader: AppearanceCatalogLoader,
) : AppLocalsProvider {
    override val order: Int = -40

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        LaunchedEffect(loader) { loader.catalog() }
        val catalog = loader.state.collectAsState().value
        val resolver = remember(catalog) { avatarRingResolver(catalog) }
        CompositionLocalProvider(LocalAvatarRingResolver provides resolver, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AvatarRingResolverModule {
    @Binds
    @IntoSet
    abstract fun bindAvatarRingResolverProvider(provider: AvatarRingResolverProvider): AppLocalsProvider
}
