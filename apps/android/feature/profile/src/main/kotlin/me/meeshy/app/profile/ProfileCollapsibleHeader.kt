@file:OptIn(ExperimentalLayoutApi::class)

package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import me.meeshy.sdk.model.profile.ProfileHeaderMetrics
import me.meeshy.sdk.model.profile.ProfilePresenceLine
import me.meeshy.sdk.model.profile.ProfilePresenceTone
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.accessibility.MetaSeparator
import me.meeshy.ui.appearance.BannerDesignView
import me.meeshy.ui.appearance.BannerFrameView
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.RelativeTimeLongText
import me.meeshy.ui.format.rememberRelativeTimeLongStrings
import me.meeshy.ui.profile.ProfileAvatar
import me.meeshy.ui.profile.ProfileFullscreenImage
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.profile.ProfileBanner as SharedProfileBanner

internal const val PROFILE_HEADER_IDENTITY_TAG = "profile-header-identity"

/** Le chevauchement de l'avatar sur la bannière (`padding(.top, -40)` iOS). */
private val AVATAR_OVERLAP = 40.dp

/**
 * Les signes que l'en-tête et la barre compacte peignent, déjà résolus : présence (temps réel puis
 * cliché REST), ligne « il y a X », anneau de story et humeur — ces deux derniers jamais quand l'un
 * a bloqué l'autre.
 */
@Immutable
internal data class ProfileHeaderSigns(
    val presence: PresenceState? = null,
    val presenceLine: ProfilePresenceLine? = null,
    val storyRing: StoryRingState = StoryRingState.None,
    val moodEmoji: String? = null,
    val isBlockedByMe: Boolean = false,
    val isBlockedByTarget: Boolean = false,
) {
    companion object {
        fun of(
            signs: ProfileLiveSigns,
            profile: MeeshyUser,
            isBlockedByMe: Boolean,
            isBlockedByTarget: Boolean,
            nowEpochMillis: Long,
        ): ProfileHeaderSigns {
            val hidesSigns = isBlockedByMe || isBlockedByTarget
            return ProfileHeaderSigns(
                presence = if (isBlockedByTarget) null else signs.presence(profile.isOnline, profile.lastActiveAt, nowEpochMillis),
                presenceLine = if (isBlockedByTarget) null else signs.presenceLine(profile.isOnline, profile.lastActiveAt, nowEpochMillis),
                storyRing = if (hidesSigns) StoryRingState.None else signs.storyRing,
                moodEmoji = if (hidesSigns) null else signs.moodEmoji?.takeIf { it.isNotBlank() },
                isBlockedByMe = isBlockedByMe,
                isBlockedByTarget = isBlockedByTarget,
            )
        }
    }
}

/**
 * Le grand en-tête repliable (miroir de `bigCollapsibleHeader` iOS) : la bannière passe de 130 à
 * 52 dp et perd 60 % d'opacité sur 120 dp de défilement, l'identité (avatar + nom + pseudo) rétrécit
 * de 12 % depuis son bord haut et s'efface ; dès que la barre compacte prend le relais, l'identité
 * étendue se tait pour TalkBack. Bio, langues et le reste vivent dans l'onglet Détails.
 */
@Composable
internal fun ProfileCollapsibleHeader(
    profile: MeeshyUser,
    header: ProfileHeaderPresentation,
    catalog: AppearanceCatalog?,
    accent: Color,
    accentHex: String,
    progress: Float,
    signs: ProfileHeaderSigns,
    onOpenImage: (ProfileFullscreenImage) -> Unit,
    onViewStory: () -> Unit,
    onMoodTap: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(ProfileHeaderMetrics.bannerHeightDp(progress).dp)
                .clipToBounds()
                .graphicsLayer { alpha = ProfileHeaderMetrics.bannerAlpha(progress) },
        ) {
            ProfileSheetBanner(
                profile = profile,
                displayName = header.displayName,
                catalog = catalog,
                accent = accent,
                accentHex = accentHex,
                isBlockedByTarget = signs.isBlockedByTarget,
                onOpenImage = onOpenImage,
                modifier = Modifier.wrapContentHeight(align = Alignment.CenterVertically, unbounded = true),
            )
        }
        val hidden = ProfileHeaderMetrics.compactBarOwnsIdentity(progress)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .overlapUp()
                .graphicsLayer {
                    val scale = ProfileHeaderMetrics.identityScale(progress)
                    scaleX = scale
                    scaleY = scale
                    alpha = ProfileHeaderMetrics.identityAlpha(progress)
                    transformOrigin = TransformOrigin(0.5f, 0f)
                }
                .then(if (hidden) Modifier.clearAndSetSemantics { } else Modifier)
                .padding(horizontal = MeeshySpacing.xl)
                .padding(top = MeeshySpacing.xs)
                .testTag(PROFILE_HEADER_IDENTITY_TAG),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            val apiBaseUrl = LocalMediaBaseUrl.current
            val avatarUrl = remember(profile.avatar, apiBaseUrl) { resolveServedImageUrl(profile.avatar, apiBaseUrl) ?: profile.avatar }
            ProfileAvatar(
                name = header.displayName,
                avatarUrl = avatarUrl,
                accent = accent,
                storyRing = signs.storyRing,
                moodEmoji = signs.moodEmoji,
                presence = signs.presence,
                isBlockedByMe = signs.isBlockedByMe,
                isBlockedByTarget = signs.isBlockedByTarget,
                onOpenImage = onOpenImage,
                onViewStory = onViewStory,
                onMoodTap = onMoodTap,
            )
            Text(
                text = header.displayName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
            ProfileHandleLine(handle = header.handle, accent = accent, line = signs.presenceLine)
        }
    }
}

/**
 * « @pseudo · il y a X » (miroir de la ligne d'identité iOS) : le pseudo dans la couleur du profil,
 * puis — seulement si un instant d'activité est connu — la date relative teintée par la présence :
 * vert actif, orange absent, gris au-delà. La ligne passe à la ligne plutôt que de rogner en gros
 * corps de texte ; le point médian est muet pour TalkBack.
 */
@Composable
private fun ProfileHandleLine(handle: String?, accent: Color, line: ProfilePresenceLine?) {
    if (handle == null && line == null) return
    ProvideTextStyle(MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
            modifier = Modifier.fillMaxWidth(),
        ) {
            handle?.let { Text(text = it, color = accent) }
            line?.let { presence ->
                if (handle != null) {
                    CompositionLocalProvider(LocalContentColor provides MeeshyTheme.tokens.textSecondary) { MetaSeparator() }
                }
                val strings = rememberRelativeTimeLongStrings()
                val relative = RelativeTimeLongText.long(
                    epochMillis = presence.lastActiveAtEpochMillis,
                    referenceMillis = System.currentTimeMillis(),
                    zone = ZoneId.systemDefault(),
                    locale = Locale.getDefault(),
                    strings = strings,
                )
                Text(text = relative, color = presence.tone.color())
            }
        }
    }
}

@Composable
private fun ProfilePresenceTone.color(): Color = when (this) {
    ProfilePresenceTone.ACTIVE -> MeeshyPalette.Success
    ProfilePresenceTone.AWAY -> MeeshyPalette.Warning
    ProfilePresenceTone.MUTED -> MeeshyTheme.tokens.textSecondary
}

/**
 * La bannière de la fiche (miroir de `bannerSection` iOS) dans la COULEUR DU PROFIL : la photo (qui
 * s'ouvre en plein écran), sinon le design équipé teinté de l'accent, sinon le dégradé d'accent ; le
 * cadre équipé se pose par-dessus, sans capter le doigt.
 */
@Composable
private fun ProfileSheetBanner(
    profile: MeeshyUser,
    displayName: String,
    catalog: AppearanceCatalog?,
    accent: Color,
    accentHex: String,
    isBlockedByTarget: Boolean,
    onOpenImage: (ProfileFullscreenImage) -> Unit,
    modifier: Modifier = Modifier,
) {
    val content = remember(profile.banner, profile.profileDecor, catalog) {
        catalog?.let { ProfileBannerContent.of(profile, it) }
    }
    val apiBaseUrl = LocalMediaBaseUrl.current
    val paint = content?.paint
    val photo = (paint as? ProfileBannerPaint.Photo)?.let { resolveServedImageUrl(it.url, apiBaseUrl) }
        ?: profile.banner?.takeIf { catalog == null && it.isNotBlank() }?.let { resolveServedImageUrl(it, apiBaseUrl) }
    val design = (paint as? ProfileBannerPaint.Design)?.design
    val frame = content?.frame
    val isDark = MeeshyTheme.isDark
    val designSlot: (@Composable BoxScope.(String) -> Unit)? = design?.let { equipped ->
        val slot: @Composable BoxScope.(String) -> Unit = { _ ->
            BannerDesignView(design = equipped, isDark = isDark, accentHex = accentHex, modifier = Modifier.fillMaxSize())
        }
        slot
    }
    val frameSlot: (@Composable BoxScope.() -> Unit)? = frame?.let { equipped ->
        val slot: @Composable BoxScope.() -> Unit = { BannerFrameView(design = equipped, modifier = Modifier.fillMaxSize()) }
        slot
    }
    SharedProfileBanner(
        photoUrl = photo,
        accent = accent,
        modifier = modifier,
        designKey = design?.let { DESIGN_SLOT_KEY },
        design = designSlot,
        decor = frameSlot,
        isBlockedByTarget = isBlockedByTarget,
        userId = profile.id,
        displayName = displayName,
        onOpenImage = onOpenImage,
    )
}

/** La bannière partagée ne lit la clé que pour savoir qu'un design existe : le dessin vient du catalogue. */
private const val DESIGN_SLOT_KEY = "equipped"

/** Remonte l'identité de [AVATAR_OVERLAP] sur la bannière sans laisser de vide dessous. */
private fun Modifier.overlapUp(): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val shift = AVATAR_OVERLAP.roundToPx()
    layout(placeable.width, (placeable.height - shift).coerceAtLeast(0)) {
        placeable.place(IntOffset(0, -shift))
    }
}

/**
 * La bulle d'humeur (miroir de la bulle que l'app iOS présente au toucher de l'humeur) : l'emoji et,
 * s'il existe, le texte du statut, en verre au-dessus de la fiche ; un toucher dehors la ferme.
 */
@Composable
internal fun ProfileMoodBubble(emoji: String, text: String?, onDismiss: () -> Unit) {
    Popup(
        alignment = Alignment.TopCenter,
        offset = IntOffset(0, 0),
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        MeeshyGlassSurface(
            modifier = Modifier.padding(top = MeeshySpacing.xxxl * 3).widthIn(max = 280.dp),
            shape = RoundedCornerShape(MeeshyRadius.lg),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = emoji, style = MaterialTheme.typography.headlineSmall)
                text?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.width(MeeshySpacing.sm))
                    Text(text = it, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
                }
            }
        }
    }
}
