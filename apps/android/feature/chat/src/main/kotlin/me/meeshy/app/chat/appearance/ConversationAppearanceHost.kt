package me.meeshy.app.chat.appearance

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.request.ImageRequest
import me.meeshy.sdk.mediahub.BackgroundPhotoSource
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.model.appearance.ConversationBackgroundResolution
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.AppearanceDesignView
import me.meeshy.ui.component.lottie.PackLottieLayer
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que le fil lit du choix personnel du lecteur : l'accent EFFECTIF (le personnel s'il est choisi, sinon l'accent
 * calculé de la conversation) et le fond à peindre. Immuable pour la composition ; un nouveau choix en crée un neuf.
 */
@Stable
internal class ConversationAppearanceHost(
    val accentHex: String?,
    val appearance: ConversationAppearance,
    val catalog: AppearanceCatalog?,
    val photoSource: (String) -> BackgroundPhotoSource,
    val photoHeaders: (BackgroundPhotoSource) -> Map<String, String>,
    val isDark: Boolean,
) {
    val resolution: ConversationBackgroundResolution
        get() = catalog?.let { ConversationBackgroundResolution.resolve(appearance, isDark, it) } ?: ConversationBackgroundResolution.Signature

    companion object {
        val NONE = ConversationAppearanceHost(null, ConversationAppearance.DEFAULT, null, { BackgroundPhotoSource(null, "") }, { emptyMap() }, false)
    }
}

/** Suit le fond et l'accent personnels de la conversation ouverte ; sans choix, le fil reste celui d'avant. */
@Composable
internal fun rememberConversationAppearance(
    conversationId: String,
    computedAccentHex: String?,
    viewModel: ConversationAppearanceViewModel = hiltViewModel(),
): ConversationAppearanceHost {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(conversationId) { if (conversationId.isNotBlank()) viewModel.start(conversationId) }
    val isDark = MeeshyTheme.isDark
    return remember(ui.appearance, ui.catalog, computedAccentHex, isDark) {
        val accent = if (computedAccentHex == null) null else {
            ui.catalog?.let { ConversationBackgroundResolution.effectiveAccentHex(ui.appearance, computedAccentHex, isDark, it) } ?: computedAccentHex
        }
        ConversationAppearanceHost(accent, ui.appearance, ui.catalog, viewModel::photoSource, viewModel::photoHeaders, isDark)
    }
}

/** Le fond choisi, posé sous le fil : Signature ne peint rien (le fond de marque est dessous), le reste fond en 180 ms. */
@Composable
internal fun ConversationBackgroundLayer(host: ConversationAppearanceHost) {
    if (host.appearance.isDefault) return
    Crossfade(targetState = host.resolution, animationSpec = tween(180), label = "conversation-background") { resolution ->
        val base = Modifier.fillMaxSize().clearAndSetSemantics { }
        when (resolution) {
            ConversationBackgroundResolution.Signature -> Unit
            is ConversationBackgroundResolution.Designed -> Box(base.clipToBounds()) {
                AppearanceDesignView(resolution.design, host.isDark, host.accentHex ?: "#6366F1", Modifier.fillMaxSize())
                PackLottieLayer(
                    resolution.design.lottie,
                    Modifier.fillMaxSize(),
                    animates = host.appearance.animate && !LocalReduceMotion.current,
                    contentScale = ContentScale.Crop,
                )
            }
            is ConversationBackgroundResolution.Solid -> Box(base.background(me.meeshy.ui.theme.hexColor(resolution.hex)))
            is ConversationBackgroundResolution.Photo -> PhotoLayer(resolution, host, base)
        }
    }
}

@Composable
private fun PhotoLayer(photo: ConversationBackgroundResolution.Photo, host: ConversationAppearanceHost, modifier: Modifier) {
    val source = remember(photo.attachmentId) { host.photoSource(photo.attachmentId) }
    val context = LocalContext.current
    val request = remember(source) {
        ImageRequest.Builder(context).data(source.fullUrl).apply {
            host.photoHeaders(source).forEach { (name, value) -> addHeader(name, value) }
        }.build()
    }
    // Une pièce disparue, refusée ou chiffrée rend Signature : la couche s'efface plutôt que de peindre un fond mort.
    var failed by remember(photo.attachmentId) { mutableStateOf(false) }
    if (failed) return
    val backdrop = MeeshyTheme.tokens.backgroundPrimary
    Box(modifier.background(backdrop).clipToBounds()) {
        AsyncImage(
            model = request,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            onError = { failed = true },
            modifier = Modifier.fillMaxSize().blur(photo.blur.dp),
        )
        Box(
            Modifier.fillMaxSize().background(backdrop.copy(alpha = ConversationBackgroundResolution.effectiveVeil(photo.veil, reduceTransparency = false).toFloat())),
        )
    }
}
