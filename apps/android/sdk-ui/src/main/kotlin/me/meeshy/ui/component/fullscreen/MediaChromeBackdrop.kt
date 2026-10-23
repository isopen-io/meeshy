package me.meeshy.ui.component.fullscreen

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import me.meeshy.sdk.model.fullscreen.ChromeScheme
import me.meeshy.sdk.model.fullscreen.MediaChromeBackdrop
import me.meeshy.sdk.model.fullscreen.MediaChromeProbe
import me.meeshy.sdk.model.fullscreen.MediaChromeSample
import me.meeshy.sdk.model.fullscreen.MediaChromeScheme
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LightMeeshyTokens
import me.meeshy.ui.theme.LocalMeeshyTokens

/** Le schéma que la luminance du média affiché commande ; Dark par défaut. */
public val LocalMediaChromeScheme = compositionLocalOf { ChromeScheme.Dark }

/** Le mesureur de l'application, remplaçable (tests, aperçus). */
public val LocalMediaLuminanceSampler = compositionLocalOf { MediaLuminanceSampler.shared }

/** Dark : glyphe blanc sur verre sombre ; Light : encre sombre qui suit le thème clair. */
public fun ChromeScheme.toTone(): FullscreenChromeTone =
    if (this == ChromeScheme.Light) FullscreenChromeTone.Adaptive else FullscreenChromeTone.OnMedia

/**
 * Le schéma d'un média. La mesure mémorisée sert dès la première image (une carte recyclée naît avec sa
 * teinte) ; une mesure d'un autre média n'entre jamais, donc deux pages voisines ne clignotent pas.
 */
@Composable
public fun rememberMediaChromeScheme(
    backdrop: MediaChromeBackdrop?,
    sampler: MediaLuminanceSampler = LocalMediaLuminanceSampler.current,
): ChromeScheme {
    val sample by produceState<MediaChromeSample?>(sampler.memoized(backdrop), backdrop, sampler) {
        value = sampler.memoized(backdrop)
        value = sampler.sample(backdrop) ?: value
    }
    return MediaChromeScheme.scheme(backdrop, sample)
}

/** Le schéma d'un glyphe NU, d'après la part du média sous lui. */
@Composable
public fun rememberGlyphChromeScheme(
    probe: MediaChromeProbe?,
    fallback: ChromeScheme = LocalMediaChromeScheme.current,
    sampler: MediaLuminanceSampler = LocalMediaLuminanceSampler.current,
): ChromeScheme {
    if (probe == null) return fallback
    val sample by produceState<MediaChromeSample?>(sampler.memoized(probe), probe.key, sampler) {
        value = sampler.memoized(probe)
        value = sampler.sample(probe) ?: value
    }
    return MediaChromeScheme.glyphScheme(probe, sample)
}

/**
 * Mesure le média et fournit son schéma aux descendants : [LocalMediaChromeScheme] et, en schéma clair,
 * les jetons clairs (glyphe et verre « Adaptive » lisibles sur une image claire).
 */
@Composable
public fun MediaChromeScope(
    backdrop: MediaChromeBackdrop?,
    sampler: MediaLuminanceSampler = LocalMediaLuminanceSampler.current,
    content: @Composable () -> Unit,
) {
    val scheme = rememberMediaChromeScheme(backdrop, sampler)
    val tokens = remember(scheme) { if (scheme == ChromeScheme.Light) LightMeeshyTokens else DarkMeeshyTokens }
    CompositionLocalProvider(
        LocalMediaChromeScheme provides scheme,
        LocalMeeshyTokens provides tokens,
        content = content,
    )
}
