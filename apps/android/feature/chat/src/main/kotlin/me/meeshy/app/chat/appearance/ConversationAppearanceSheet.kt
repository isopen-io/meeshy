package me.meeshy.app.chat.appearance

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.app.chat.mediahub.ConversationMediaHubViewModel
import me.meeshy.feature.chat.R
import me.meeshy.sdk.mediahub.BackgroundPhotoSource
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceScheme
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.model.appearance.ConversationBackground
import me.meeshy.sdk.model.appearance.ConversationBackgroundResolution
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.MediaHubItem
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.AppearanceDesignView
import me.meeshy.ui.component.lottie.PackLottieLayer
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private val TILE_WIDTH = 72.dp
private val TILE_HEIGHT = 96.dp

/**
 * « Fond et accent » (miroir de `ConversationAppearanceSheet` iOS, #10631) : Signature, les modèles des packs
 * installés, une couleur unie de la gamme, une photo envoyée dans la conversation (voile et flou) et l'accent
 * personnel. Chaque choix s'applique au toucher — le fond du fil change aussitôt, l'écriture part par l'outbox —,
 * avec un ressort sur la sélection et une haptique légère. Cibles ≥ 48 dp, nom localisé et état « sélectionné ».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationAppearanceSheet(
    conversationId: String,
    computedAccentHex: String?,
    onDismiss: () -> Unit,
    viewModel: ConversationAppearanceViewModel = hiltViewModel(),
    photos: ConversationMediaHubViewModel = hiltViewModel(key = "appearance-photos"),
) {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    val media by photos.state.collectAsStateWithLifecycle()
    LaunchedEffect(conversationId) {
        viewModel.start(conversationId)
        photos.start(conversationId)
    }
    val haptics = rememberMeeshyHaptics()
    val isDark = MeeshyTheme.isDark
    val scheme = AppearanceScheme.of(isDark)
    val catalog = ui.catalog
    val appearance = ui.appearance
    val language = remember { Locale.getDefault().language }
    val effectiveHex = remember(appearance, computedAccentHex, isDark, catalog) {
        val computed = computedAccentHex ?: "#6366F1"
        catalog?.let { ConversationBackgroundResolution.effectiveAccentHex(appearance, computed, isDark, it) } ?: computed
    }
    val accent = hexColor(effectiveHex)
    val candidates = remember(media.items) {
        media.items.filter { item -> item.attachment?.let { !it.isVideo && !it.isEncrypted } == true }
    }
    val gridState = rememberLazyGridState()
    val nearEnd by remember(gridState) {
        derivedStateOf { gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
    }
    LaunchedEffect(nearEnd, candidates.size, media.canLoadMore, media.isLoadingMore) {
        if (media.canLoadMore && !media.isLoadingMore && !media.loadMoreFailed && nearEnd >= gridState.layoutInfo.totalItemsCount - 6) photos.loadMore()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(TILE_WIDTH + MeeshySpacing.md),
            state = gridState,
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            header("title") {
                SheetTitleRow(stringResource(R.string.conversation_appearance_sheet_title), stringResource(R.string.common_done), onDismiss, accent)
            }
            section("models", R.string.conversation_appearance_section_models)
            item(key = "signature") {
                Tile(
                    label = stringResource(R.string.conversation_appearance_signature),
                    selected = appearance.background == ConversationBackground.Signature,
                    accent = accent,
                    onClick = { haptics.light(); viewModel.selectSignature() },
                ) {
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(accent.copy(alpha = 0.25f), MeeshyTheme.tokens.backgroundPrimary))))
                }
            }
            if (catalog != null) {
                ui.packs.forEach { pack ->
                    items(pack.designs, key = { "design-${pack.slug}-${it.key}" }) { design ->
                        Tile(
                            label = catalog.designName(design.key, language) ?: design.key,
                            selected = appearance.background == ConversationBackground.Design(pack.slug, design.key),
                            accent = accent,
                            onClick = { haptics.light(); viewModel.selectDesign(pack.slug, design.key) },
                        ) {
                            AppearanceDesignView(design, isDark, effectiveHex, Modifier.fillMaxSize())
                            PackLottieLayer(design.lottie, Modifier.fillMaxSize(), animates = !LocalReduceMotion.current, contentScale = ContentScale.Crop)
                        }
                    }
                }
                section("solid", R.string.conversation_appearance_section_solid)
                items(catalog.gamut.entries, key = { "solid-${it.key}" }) { entry ->
                    Tile(
                        label = catalog.gamutName(entry.key, language) ?: entry.name,
                        selected = appearance.background == ConversationBackground.Solid(entry.key),
                        accent = accent,
                        onClick = { haptics.light(); viewModel.selectSolid(entry.key) },
                    ) { Box(Modifier.fillMaxSize().background(hexColor(entry.shade(scheme).surface))) }
                }
            }
            photoSection(candidates, media, appearance, accent, viewModel, haptics::light)
            accentSection(catalog, scheme, language, appearance, effectiveHex, computedAccentHex, accent, viewModel, haptics::light)
            header("reset") {
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    if (ui.saveFailed) {
                        Text(stringResource(R.string.conversation_appearance_error), color = MeeshyTheme.tokens.error, fontSize = MeeshyFontSize.subhead)
                    }
                    OutlinedButton(
                        onClick = { haptics.medium(); viewModel.reset() },
                        enabled = !appearance.isDefault,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(stringResource(R.string.conversation_appearance_reset), color = if (appearance.isDefault) MeeshyTheme.tokens.textMuted else MeeshyTheme.tokens.error) }
                }
            }
        }
    }
}

private fun LazyGridScope.header(key: String, content: @Composable () -> Unit) {
    item(key = key, span = { GridItemSpan(maxLineSpan) }) { content() }
}

private fun LazyGridScope.section(key: String, @androidx.annotation.StringRes titleRes: Int) {
    header("section-$key") {
        val title = stringResource(titleRes)
        Text(
            title,
            modifier = Modifier.padding(top = MeeshySpacing.md).semantics { contentDescription = title },
            color = MeeshyTheme.tokens.textSecondary,
            fontSize = MeeshyFontSize.footnote,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun SheetTitleRow(title: String, action: String, onAction: () -> Unit, accent: Color) {
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.headline, fontWeight = FontWeight.Bold)
        TextButton(onClick = onAction) { Text(action, color = accent, fontWeight = FontWeight.SemiBold) }
    }
}

private fun LazyGridScope.photoSection(
    candidates: List<MediaHubItem>,
    state: me.meeshy.app.chat.mediahub.MediaHubUiState,
    appearance: ConversationAppearance,
    accent: Color,
    viewModel: ConversationAppearanceViewModel,
    haptic: () -> Unit,
) {
    header("photo-title") { PhotoTitle() }
    if (candidates.isEmpty()) {
        header("photo-empty") { PhotoEmpty(state) }
    } else {
        items(candidates, key = { "photo-${it.id}" }) { item ->
            val piece = item.attachment ?: return@items
            val selected = (appearance.background as? ConversationBackground.Photo)?.attachmentId == piece.id
            val dateLabel = remember(item.sentAtMillis) {
                DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(Locale.getDefault())
                    .format(Instant.ofEpochMilli(item.sentAtMillis).atZone(ZoneId.systemDefault()))
            }
            Tile(
                label = stringResource(R.string.conversation_appearance_photo_label, dateLabel),
                selected = selected,
                accent = accent,
                onClick = {
                    haptic()
                    viewModel.selectPhoto(piece.id, BackgroundPhotoSource(piece.thumbnailUrl, piece.url))
                },
            ) {
                AsyncImage(model = piece.tileUrl(240), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
        }
    }
    if (appearance.background is ConversationBackground.Photo) header("photo-sliders") { PhotoSliders(appearance, accent, viewModel) }
}

@Composable
private fun PhotoTitle() {
    Text(
        stringResource(R.string.conversation_appearance_section_photo),
        color = MeeshyTheme.tokens.textSecondary,
        fontSize = MeeshyFontSize.footnote,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun PhotoEmpty(state: me.meeshy.app.chat.mediahub.MediaHubUiState) {
    val text = when (state.phase) {
        me.meeshy.sdk.model.mediahub.MediaHubPhase.LOADING -> stringResource(R.string.media_hub_loading)
        me.meeshy.sdk.model.mediahub.MediaHubPhase.OFFLINE -> stringResource(R.string.media_hub_offline_empty)
        me.meeshy.sdk.model.mediahub.MediaHubPhase.FAILED -> stringResource(R.string.media_hub_error)
        me.meeshy.sdk.model.mediahub.MediaHubPhase.LOADED -> stringResource(R.string.conversation_appearance_photo_empty)
    }
    Text(text, color = MeeshyTheme.tokens.textMuted, fontSize = MeeshyFontSize.subhead)
}

@Composable
private fun PhotoSliders(appearance: ConversationAppearance, accent: Color, viewModel: ConversationAppearanceViewModel) {
    val photo = appearance.background as? ConversationBackground.Photo ?: return
    var veil by remember(photo.veil) { mutableFloatStateOf(photo.veil.toFloat()) }
    var blur by remember(photo.blur) { mutableFloatStateOf(photo.blur.toFloat()) }
    val veilLabel = stringResource(R.string.conversation_appearance_photo_veil)
    val blurLabel = stringResource(R.string.conversation_appearance_photo_blur)
    val colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent)
    Column {
        Text(veilLabel, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.SemiBold)
        Slider(
            value = veil,
            onValueChange = { veil = it },
            onValueChangeFinished = { viewModel.setPhotoVeil(veil.toDouble()) },
            valueRange = 0f..ConversationBackground.PHOTO_VEIL_MAX.toFloat(),
            steps = (ConversationBackground.PHOTO_VEIL_MAX / ConversationBackground.PHOTO_VEIL_STEP).toInt() - 1,
            colors = colors,
            modifier = Modifier.semantics { contentDescription = veilLabel },
        )
        Text(blurLabel, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.SemiBold)
        Slider(
            value = blur,
            onValueChange = { blur = it },
            onValueChangeFinished = { viewModel.setPhotoBlur(blur.toInt()) },
            valueRange = 0f..ConversationBackground.PHOTO_BLUR_MAX.toFloat(),
            steps = ConversationBackground.PHOTO_BLUR_MAX - 1,
            colors = colors,
            modifier = Modifier.semantics { contentDescription = blurLabel },
        )
    }
}

private fun LazyGridScope.accentSection(
    catalog: AppearanceCatalog?,
    scheme: AppearanceScheme,
    language: String,
    appearance: ConversationAppearance,
    effectiveHex: String,
    computedHex: String?,
    accent: Color,
    viewModel: ConversationAppearanceViewModel,
    haptic: () -> Unit,
) {
    header("accent-title") {
        Text(stringResource(R.string.conversation_appearance_section_accent), color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.footnote, fontWeight = FontWeight.Bold)
    }
    item(key = "accent-auto") {
        Swatch(
            label = stringResource(R.string.conversation_appearance_accent_auto),
            selected = appearance.accent == null,
            color = hexColor(computedHex ?: effectiveHex),
            ring = MeeshyTheme.tokens.textPrimary,
            onClick = { haptic(); viewModel.setAccent(null) },
        ) { Icon(MeeshyIcons.MagicWand, null, tint = Color.White, modifier = Modifier.size(20.dp)) }
    }
    catalog?.gamut?.entries?.let { entries ->
        items(entries, key = { "accent-${it.key}" }) { entry ->
            Swatch(
                label = catalog.gamutName(entry.key, language) ?: entry.name,
                selected = appearance.accent == entry.key,
                color = hexColor(entry.shade(scheme).accent),
                ring = MeeshyTheme.tokens.textPrimary,
                onClick = { haptic(); viewModel.setAccent(entry.key) },
            ) {}
        }
    }
}

@Composable
private fun Tile(label: String, selected: Boolean, accent: Color, onClick: () -> Unit, preview: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit) {
    val scale by animateFloatAsState(if (selected) 1.04f else 1f, spring(dampingRatio = 0.55f, stiffness = 420f), label = "tile-scale")
    val border by animateDpAsState(if (selected) 3.dp else 1.dp, label = "tile-border")
    val borderColor by animateColorAsState(if (selected) accent else MeeshyTheme.tokens.textMuted.copy(alpha = 0.3f), label = "tile-border-color")
    Box(
        modifier = Modifier
            .size(TILE_WIDTH, TILE_HEIGHT)
            .scale(scale)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .border(BorderStroke(border, borderColor), RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label; this.selected = selected },
    ) {
        preview()
        if (selected) {
            Icon(
                MeeshyIcons.CheckCircleFilled, null, tint = accent,
                modifier = Modifier.align(Alignment.BottomEnd).padding(MeeshySpacing.xs).size(18.dp).background(Color.White, CircleShape),
            )
        }
    }
}

@Composable
private fun Swatch(label: String, selected: Boolean, color: Color, ring: Color, onClick: () -> Unit, glyph: @Composable () -> Unit) {
    val scale by animateFloatAsState(if (selected) 1.12f else 1f, spring(dampingRatio = 0.55f, stiffness = 420f), label = "swatch-scale")
    Box(
        modifier = Modifier
            .size(48.dp)
            .scale(scale)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label; this.selected = selected },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(color).border(if (selected) 3.dp else 0.dp, if (selected) ring else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) { glyph() }
    }
}
