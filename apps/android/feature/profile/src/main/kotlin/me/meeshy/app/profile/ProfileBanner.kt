package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import me.meeshy.sdk.model.appearance.ProfileDecorResolver
import me.meeshy.sdk.model.profile.ProfileHeaderMetrics
import me.meeshy.ui.appearance.BannerDesignView
import me.meeshy.ui.appearance.BannerFrameView
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que l'en-tête d'un profil peint en bannière : le fond (photo, design ou uni) et le cadre posé dessus. */
internal data class ProfileBannerContent(val paint: ProfileBannerPaint, val frame: BannerFrameDesign?) {
    companion object {
        /**
         * `null` ⇒ ni bannière ni cadre : l'en-tête reste tel quel. Un cadre inconnu du catalogue (version plus
         * récente) se résout en `null` et ne casse rien ; la photo gagne toujours sur le design équipé.
         */
        fun of(user: MeeshyUser, catalog: AppearanceCatalog): ProfileBannerContent? {
            val decor = user.servedDecor
            val paint = ProfileDecorResolver.bannerPaint(user.banner, decor.banner, catalog)
            val frame = ProfileDecorResolver.bannerFrame(decor.bannerFrame, catalog)
            if (paint is ProfileBannerPaint.Plain && frame == null) return null
            return ProfileBannerContent(paint, frame)
        }
    }
}

/**
 * La bannière du profil (miroir de `UserProfileSheet+Header.bannerSection`) : la photo, sinon le design équipé,
 * sinon un fond uni, avec le cadre ornemental posé PAR-DESSUS sans jamais les remplacer. Rien à peindre ⇒ rien.
 */
@Composable
internal fun ProfileBanner(user: MeeshyUser, modifier: Modifier = Modifier, viewModel: ProfileBannerViewModel = hiltViewModel()) {
    val catalog by viewModel.catalog.collectAsStateWithLifecycle()
    val content = remember(user.banner, user.profileDecor, catalog) { catalog?.let { ProfileBannerContent.of(user, it) } } ?: return
    val isDark = MeeshyTheme.isDark
    val apiBaseUrl = LocalMediaBaseUrl.current
    val accent = remember { String.format("#%06X", MeeshyPalette.Indigo500.toArgb() and 0xFFFFFF) }
    Box(
        modifier
            .fillMaxWidth()
            .height(ProfileHeaderMetrics.EXPANDED_BANNER_DP.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg)),
    ) {
        when (val paint = content.paint) {
            is ProfileBannerPaint.Photo -> {
                val photo = resolveServedImageUrl(paint.url, apiBaseUrl)
                if (photo != null) {
                    AsyncImage(
                        model = photo,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundTertiary))
                }
            }
            is ProfileBannerPaint.Design -> BannerDesignView(
                design = paint.design,
                isDark = isDark,
                accentHex = accent,
                modifier = Modifier.fillMaxSize(),
            )
            ProfileBannerPaint.Plain -> Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundTertiary))
        }
        content.frame?.let { BannerFrameView(design = it, modifier = Modifier.fillMaxSize()) }
    }
}
