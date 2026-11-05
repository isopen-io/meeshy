package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.settings.R
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.appearance.AppearanceDesignView
import me.meeshy.ui.appearance.AvatarRingLayer
import me.meeshy.ui.appearance.BannerDesignView
import me.meeshy.ui.appearance.BannerFrameView
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.lottie.PackLottieLayer
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.meeshyText

private const val BANNER_ASPECT = 3f
private const val WALLPAPER_ASPECT = 9f / 16f
private const val RING_ROOM = 1.3f

/**
 * Un élément de la boutique POSÉ sur ce qu'il décore (#16269) : mon avatar pour un contour, ma bannière pour une bannière
 * ou un cadre, une conversation pour un fond. [compact] : la vignette de la grille ou d'« Autres propositions » (sans les
 * bulles ni le nom) ; [animates] faux fige les films (vignettes). Un élément pas encore peignable montre l'état
 * « téléchargement requis », jamais un vide. Décoratif pour TalkBack : c'est l'hôte qui nomme l'élément.
 */
@Composable
internal fun ShopItemStage(
    item: ShopItem?,
    me: ShopViewerMe,
    compact: Boolean,
    animates: Boolean,
    modifier: Modifier = Modifier,
) {
    val art = item?.art
    Box(modifier.then(if (art != null) Modifier.clearAndSetSemantics { } else Modifier), contentAlignment = Alignment.Center) {
        when (art) {
            null -> DownloadRequiredArt(compact)
            is ShopItemArt.Ring -> RingStage(art, me, compact, animates)
            is ShopItemArt.Banner -> ProfileHeaderStage(me, compact) { mod ->
                BannerDesignView(art.design, MeeshyTheme.isDark, me.accentHex, mod, animates = animates)
            }
            is ShopItemArt.BannerFrame -> ProfileHeaderStage(me, compact) { mod ->
                Box(mod.aspectRatio(BANNER_ASPECT)) {
                    MyBanner(me, Modifier.fillMaxSize())
                    BannerFrameView(art.design, Modifier.fillMaxSize(), animates = animates)
                }
            }
            is ShopItemArt.Wallpaper -> WallpaperStage(art, me, compact, animates)
        }
    }
}

@Composable
private fun RingStage(art: ShopItemArt.Ring, me: ShopViewerMe, compact: Boolean, animates: Boolean) {
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val side: Dp = if (compact) minOf(maxWidth, maxHeight) / RING_ROOM else minOf(minOf(maxWidth, maxHeight) * 0.55f, 240.dp)
        AvatarRingLayer(art.design, footprint = side, modifier = Modifier.size(side * RING_ROOM), animates = animates) {
            MeeshyAvatar(name = me.name, size = side, imageUrl = resolveServedImageUrl(me.avatarUrl, LocalMediaBaseUrl.current))
        }
    }
}

/** La bannière 3:1 ; hors vignette, sous elle mon avatar et mon nom, comme sur ma fiche. */
@Composable
private fun ProfileHeaderStage(me: ShopViewerMe, compact: Boolean, banner: @Composable (Modifier) -> Unit) {
    val shape = RoundedCornerShape(if (compact) MeeshyRadius.sm else MeeshyRadius.md)
    if (compact) {
        banner(Modifier.fillMaxWidth().clip(shape))
        return
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg), horizontalAlignment = Alignment.Start) {
        banner(Modifier.fillMaxWidth().clip(shape))
        Row(
            Modifier.offset(y = (-28).dp).padding(start = MeeshySpacing.lg),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            MeeshyAvatar(name = me.name, size = 64.dp, imageUrl = resolveServedImageUrl(me.avatarUrl, LocalMediaBaseUrl.current))
            Text(me.name, style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold), color = MeeshyTheme.tokens.textPrimary)
        }
    }
}

/** Ma bannière telle qu'elle est : ma photo, sinon le dégradé de mon accent — le cadre se pose dessus. */
@Composable
private fun MyBanner(me: ShopViewerMe, modifier: Modifier) {
    val url = resolveServedImageUrl(me.bannerPhoto, LocalMediaBaseUrl.current)
    Box(
        modifier.background(
            Brush.linearGradient(listOf(hexColor(me.accentHex).copy(alpha = 0.45f), MeeshyPalette.Indigo300.copy(alpha = 0.3f))),
        ),
    ) {
        if (url != null) AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    }
}

/** Un fond de conversation, et hors vignette quelques bulles factices pour juger la lisibilité. */
@Composable
private fun WallpaperStage(art: ShopItemArt.Wallpaper, me: ShopViewerMe, compact: Boolean, animates: Boolean) {
    val shape = RoundedCornerShape(if (compact) MeeshyRadius.sm else MeeshyRadius.lg)
    Box(
        Modifier
            .then(if (compact) Modifier.fillMaxSize() else Modifier.fillMaxHeight().aspectRatio(WALLPAPER_ASPECT, matchHeightConstraintsFirst = true))
            .clip(shape),
    ) {
        AppearanceDesignView(art.design, MeeshyTheme.isDark, me.accentHex, Modifier.fillMaxSize())
        art.design.lottie?.let { PackLottieLayer(it, Modifier.fillMaxSize(), animates = animates, contentScale = ContentScale.Crop) }
        if (!compact) SampleBubbles(me)
    }
}

@Composable
private fun SampleBubbles(me: ShopViewerMe) {
    Column(
        Modifier.fillMaxSize().padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.Bottom),
    ) {
        Bubble(stringResource(R.string.pack_shop_preview_bubble_in), mine = false, me)
        Bubble(stringResource(R.string.pack_shop_preview_bubble_out), mine = true, me)
        Bubble(stringResource(R.string.pack_shop_preview_bubble_in_2), mine = false, me)
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean, me: ShopViewerMe) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Text(
            text = text,
            style = meeshyText(MeeshyFontSize.subhead),
            color = if (mine) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary,
            modifier = Modifier
                .widthIn(max = 240.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(if (mine) hexColor(me.accentHex) else MeeshyTheme.tokens.backgroundPrimary.copy(alpha = 0.92f))
                .padding(horizontal = 14.dp, vertical = 9.dp),
        )
    }
}

/** L'élément n'est pas encore sur l'appareil : un état dessiné, jamais un vide. */
@Composable
private fun DownloadRequiredArt(compact: Boolean) {
    Column(
        Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.surfaceFill)
            .padding(MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(MeeshyIcons.Download, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(if (compact) 20.dp else 40.dp))
        if (!compact) {
            Text(
                stringResource(R.string.pack_shop_download_required),
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
    }
}
