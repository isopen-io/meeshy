package me.meeshy.app.profile

import me.meeshy.sdk.media.readMediaUploadItem
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import java.util.Locale
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.ProfileDecorRef
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import me.meeshy.sdk.model.appearance.ProfileDecorOptions
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.appearance.AvatarRingLayer
import me.meeshy.ui.appearance.BannerDesignView
import me.meeshy.ui.appearance.BannerFrameView
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.meeshyText
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import androidx.compose.runtime.rememberCoroutineScope

private val RING_TILE_WIDTH = 84.dp
private val RING_AVATAR = 56.dp
private val RING_FOOTPRINT = 68.dp
private const val BANNER_ASPECT = 3f
private const val BANNER_COLUMNS = 2

/**
 * « Contour et bannière » (miroir de `ProfileDecorSheet` iOS, #10632) : choisir le contour d'avatar, la bannière de
 * design et le cadre posé sur la bannière, visibles des autres. Seuls les packs installés et possédés sont proposés ;
 * équiper est optimiste et la passerelle fait foi (un refus rétablit LE CÔTÉ touché, et le dit). La tuile « Image »
 * ouvre la photothèque : la photo de bannière gagne toujours sur les fonds.
 */
@Composable
fun ProfileDecorSheet(
    onDone: () -> Unit,
    viewModel: ProfileDecorViewModel = hiltViewModel(),
    uploadViewModel: AvatarBannerUploadViewModel = hiltViewModel(),
    onOpenShop: ((AppearancePackDomain) -> Unit)? = null,
) {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    val upload by uploadViewModel.state.collectAsStateWithLifecycle()
    val uploadingBanner = upload.uploading == ImageUploadTarget.BANNER
    val uploadError = upload.error?.let { stringResource(it.messageRes()) }
    val haptics = rememberMeeshyHaptics()
    val pickBanner = rememberBannerPicker(uploadViewModel)
    val errorText = stringResource(R.string.profile_decor_error)
    val view = LocalView.current
    LaunchedEffect(ui.failed) { if (ui.failed) view.announceForAccessibility(errorText) }
    // L'erreur de téléversement est retenue ICI : le téléverseur est celui de ma page, qui la consomme pour sa capsule.
    var shownUploadError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(uploadError) {
        uploadError?.let { shownUploadError = it; view.announceForAccessibility(it) }
    }

    MeeshyBackground {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            DecorHeader(onDone)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(MeeshySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                val catalog = ui.catalog
                if (catalog != null) {
                    RingSection(ui, catalog, shop(AppearancePackDomain.AVATAR_RING, onOpenShop, haptics::light)) { ref -> haptics.light(); viewModel.equip(ref, ProfileDecorSide.AVATAR_RING) }
                    BannerSection(
                        ui, catalog, uploadingBanner,
                        onPickImage = { haptics.light(); shownUploadError = null; pickBanner() },
                        shop = shop(AppearancePackDomain.BANNER, onOpenShop, haptics::light),
                    ) { ref ->
                        haptics.light()
                        viewModel.equip(ref, ProfileDecorSide.BANNER)
                    }
                    FrameSection(ui, catalog, shop(AppearancePackDomain.BANNER_FRAME, onOpenShop, haptics::light)) { ref -> haptics.light(); viewModel.equip(ref, ProfileDecorSide.BANNER_FRAME) }
                }
                listOfNotNull(errorText.takeIf { ui.failed }, shownUploadError).forEach { message ->
                    Text(message, style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium), color = MeeshyPalette.Error)
                }
            }
        }
    }
}

@Composable
private fun DecorHeader(onDone: () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm), contentAlignment = Alignment.Center) {
        Text(
            stringResource(R.string.profile_decor_title),
            style = meeshyText(MeeshyFontSize.callout, FontWeight.SemiBold),
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.semantics { heading() },
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onDone, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.profile_decor_done), style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold), color = MeeshyPalette.Indigo500)
            }
        }
    }
}

@Composable
private fun rememberBannerPicker(uploadViewModel: AvatarBannerUploadViewModel): () -> Unit {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch { withContext(Dispatchers.IO) { context.readMediaUploadItem(uri) }?.let { uploadViewModel.onImagePicked(ImageUploadTarget.BANNER, it) } }
    }
    return { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

/** « Plus dans la boutique » d'une section, ou rien : sans destination qui l'accueille, le lien n'est pas posé (un contrôle existe s'il a un effet). */
internal fun shop(domain: AppearancePackDomain, onOpenShop: ((AppearancePackDomain) -> Unit)?, haptic: () -> Unit): (() -> Unit)? =
    onOpenShop?.let { open -> { haptic(); open(domain) } }

/** Le lien vers la boutique du domaine (iOS `shopLink`) : 44 dp au moins, un bouton nommé pour TalkBack. */
@Composable
private fun ShopLink(onClick: () -> Unit) {
    Row(
        Modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Shopping, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(16.dp))
        Text(stringResource(R.string.profile_decor_shop), style = meeshyText(MeeshyFontSize.footnote, FontWeight.SemiBold), color = MeeshyPalette.Indigo500)
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = meeshyText(MeeshyFontSize.label, FontWeight.SemiBold),
        color = MeeshyTheme.tokens.textPrimary,
        modifier = Modifier.semantics { heading() },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RingSection(ui: ProfileDecorUiState, catalog: AppearanceCatalog, shop: (() -> Unit)?, onChoose: (ProfileDecorRef?) -> Unit) {
    val language = remember { Locale.getDefault().language }
    val title = stringResource(R.string.profile_decor_ring_section)
    Column(Modifier.semantics(mergeDescendants = false) { contentDescription = title }, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SectionHeader(title)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            RingTile(null, stringResource(R.string.profile_decor_none), ui.current(ProfileDecorSide.AVATAR_RING) == null, ui) { onChoose(null) }
            ProfileDecorOptions.flattened(ui.rings).forEach { entry ->
                val label = catalog.ringName(entry.design.key, language) ?: entry.design.key
                RingTile(entry.design, label, ui.current(ProfileDecorSide.AVATAR_RING) == entry.ref, ui) { onChoose(entry.ref) }
            }
        }
        shop?.let { ShopLink(it) }
    }
}

@Composable
private fun RingTile(design: AvatarRingDesign?, label: String, selected: Boolean, who: ProfileDecorUiState, onClick: () -> Unit) {
    val base = LocalMediaBaseUrl.current
    DecorTile(label, selected, Modifier.width(RING_TILE_WIDTH), onClick) {
        Box(
            Modifier
                .size(RING_FOOTPRINT)
                .clip(CircleShape)
                .background(MeeshyPalette.Indigo950)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            AvatarRingLayer(design, footprint = RING_AVATAR, modifier = Modifier.size(RING_FOOTPRINT)) {
                MeeshyAvatar(name = who.name, size = RING_AVATAR, imageUrl = resolveServedImageUrl(who.avatarUrl, base))
            }
        }
        TileLabel(label)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BannerSection(ui: ProfileDecorUiState, catalog: AppearanceCatalog, uploading: Boolean, onPickImage: () -> Unit, shop: (() -> Unit)?, onChoose: (ProfileDecorRef) -> Unit) {
    val language = remember { Locale.getDefault().language }
    val title = stringResource(R.string.profile_decor_banner_section)
    val choice = ui.bannerChoice
    val accent = ui.accentHex
    Column(Modifier.semantics(mergeDescendants = false) { contentDescription = title }, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SectionHeader(title)
        FlowRow(
            maxItemsInEachRow = BANNER_COLUMNS,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            ImageTile(choice.imagePreview, stringResource(R.string.profile_decor_image), choice.imageSelected, uploading, Modifier.weight(1f), onPickImage)
            ProfileDecorOptions.flattened(ui.banners).forEach { entry ->
                val label = catalog.designName(entry.design.key, language) ?: entry.design.key
                BannerTile(entry.design, label, choice.isSelected(entry.ref), accent, Modifier.weight(1f)) { onChoose(entry.ref) }
            }
        }
        if (choice.photoHidesDesigns) {
            Text(stringResource(R.string.profile_decor_image_hides_designs), style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium), color = MeeshyTheme.tokens.textMuted)
        }
        shop?.let { ShopLink(it) }
    }
}

@Composable
private fun ImageTile(preview: String?, label: String, selected: Boolean, uploading: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val hint = stringResource(R.string.profile_decor_image_hint)
    val base = LocalMediaBaseUrl.current
    DecorTile(label, selected, modifier, onClick.takeUnless { uploading } ?: {}, hint = hint) {
        Box(Modifier.fillMaxWidth().aspectRatio(BANNER_ASPECT).clip(RoundedCornerShape(MeeshyRadius.sm)).background(MeeshyPalette.Indigo500.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            val url = resolveServedImageUrl(preview, base)
            if (url != null) {
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Icon(MeeshyIcons.AddPhoto, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(28.dp))
            }
            if (uploading) CircularProgressIndicator(color = MeeshyPalette.Indigo500, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
        }
        TileLabel(label)
    }
}

@Composable
private fun BannerTile(design: AppearanceDesign, label: String, selected: Boolean, accent: String, modifier: Modifier, onClick: () -> Unit) {
    DecorTile(label, selected, modifier, onClick) {
        BannerDesignView(design, MeeshyTheme.isDark, accent, Modifier.fillMaxWidth().aspectRatio(BANNER_ASPECT).clip(RoundedCornerShape(MeeshyRadius.sm)))
        TileLabel(label)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FrameSection(ui: ProfileDecorUiState, catalog: AppearanceCatalog, shop: (() -> Unit)?, onChoose: (ProfileDecorRef?) -> Unit) {
    val language = remember { Locale.getDefault().language }
    val title = stringResource(R.string.profile_decor_frame_section)
    val accent = ui.accentHex
    Column(Modifier.semantics(mergeDescendants = false) { contentDescription = title }, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SectionHeader(title)
        FlowRow(
            maxItemsInEachRow = BANNER_COLUMNS,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            val current = ui.current(ProfileDecorSide.BANNER_FRAME)
            FrameTile(null, ui.bannerPaint, accent, stringResource(R.string.profile_decor_none), current == null, Modifier.weight(1f)) { onChoose(null) }
            ProfileDecorOptions.flattened(ui.frames).forEach { entry ->
                val label = catalog.frameName(entry.design.key, language) ?: entry.design.key
                FrameTile(entry.design, ui.bannerPaint, accent, label, current == entry.ref, Modifier.weight(1f)) { onChoose(entry.ref) }
            }
        }
        shop?.let { ShopLink(it) }
    }
}

/** Le cadre se pose SUR la bannière, centre transparent : la tuile le montre sur la bannière du profil. */
@Composable
private fun FrameTile(design: BannerFrameDesign?, paint: ProfileBannerPaint, accent: String, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val base = LocalMediaBaseUrl.current
    DecorTile(label, selected, modifier, onClick) {
        Box(Modifier.fillMaxWidth().aspectRatio(BANNER_ASPECT).clip(RoundedCornerShape(MeeshyRadius.sm))) {
            when (paint) {
                is ProfileBannerPaint.Design -> BannerDesignView(paint.design, MeeshyTheme.isDark, accent, Modifier.fillMaxSize())
                is ProfileBannerPaint.Photo -> AsyncImage(
                    model = resolveServedImageUrl(paint.url, base), contentDescription = null,
                    contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                )
                ProfileBannerPaint.Plain -> Box(
                    Modifier.fillMaxSize().background(
                        Brush.linearGradient(listOf(hexColor(accent).copy(alpha = 0.3f), MeeshyPalette.Indigo300.copy(alpha = 0.2f))),
                    ),
                )
            }
            if (design != null) BannerFrameView(design, Modifier.fillMaxSize())
        }
        TileLabel(label)
    }
}

/** Une tuile choisissable : liseré plein sur la tuile choisie, nom + état « sélectionné » pour le lecteur d'écran. */
@Composable
private fun DecorTile(
    label: String,
    selected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
    hint: String? = null,
    content: @Composable () -> Unit,
) {
    val outline = if (selected) MeeshyPalette.Indigo500 else androidx.compose.ui.graphics.Color.Transparent
    Column(
        modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .border(2.dp, outline, RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = hint?.let { "$label. $it" } ?: label
                this.selected = selected
                role = Role.Button
            }
            .padding(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) { content() }
}

@Composable
private fun TileLabel(text: String) {
    Text(
        text,
        style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium),
        color = MeeshyTheme.tokens.textPrimary,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.clearAndSetSemantics { },
    )
}
