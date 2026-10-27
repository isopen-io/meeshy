package me.meeshy.app.reels

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MediaCaptionRule
import me.meeshy.sdk.model.ReelCaption
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.fullscreen.LocalFullscreenChromeInteractive
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import java.time.ZoneId
import java.util.Locale

/** La hauteur au-delà de laquelle une légende dépliée défile au lieu de monter hors de l'écran. */
private val EXPANDED_CAPTION_MAX_HEIGHT = 240.dp

/**
 * La colonne d'information d'un réel (iOS `ReelPageView.infoOverlay`) : l'auteur et sa ligne méta,
 * la légende repliable, puis l'horodatage et les drapeaux de langue — toucher un drapeau lit la
 * légende dans cette langue (Prisme Linguistique), le retoucher revient à la langue servie.
 */
@Composable
internal fun ReelInfo(
    reel: ReelPresentation,
    isOwn: Boolean,
    onOpenAuthor: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    var expanded by rememberSaveable(reel.id) { mutableStateOf(false) }
    var selectedLanguage by rememberSaveable(reel.id) { mutableStateOf<String?>(null) }
    val caption = ReelCaption.displayed(
        selected = selectedLanguage,
        originalLanguage = reel.captionOriginalLanguage,
        original = reel.captionOriginal,
        translations = reel.captionTranslations,
        served = reel.caption,
    )
    Column(modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        ReelAuthorRow(reel = reel, isOwn = isOwn, onOpenAuthor = onOpenAuthor)
        if (!caption.isNullOrBlank()) {
            ReelCaptionText(
                text = caption,
                isTranslated = selectedLanguage?.let { it.lowercase() != reel.captionOriginalLanguage?.lowercase() }
                    ?: reel.isCaptionTranslated,
                expanded = expanded,
                onToggle = { expanded = !expanded },
            )
        }
        ReelMetaRow(
            createdAtIso = reel.createdAtIso,
            codes = ReelCaption.codes(reel.captionOriginalLanguage, reel.captionTranslations.keys),
            selected = selectedLanguage,
            onSelect = { code -> selectedLanguage = ReelCaption.toggled(selectedLanguage, code) },
        )
    }
}

@Composable
private fun ReelAuthorRow(
    reel: ReelPresentation,
    isOwn: Boolean,
    onOpenAuthor: (() -> Unit)?,
) {
    val interactive = LocalFullscreenChromeInteractive.current
    val profileLabel = stringResource(R.string.reels_author_profile)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .let { base ->
                if (onOpenAuthor == null || !interactive) base
                else base.clickable(onClickLabel = profileLabel, role = Role.Button, onClick = onOpenAuthor)
            }
            .heightIn(min = 44.dp)
            .padding(end = MeeshySpacing.sm),
    ) {
        MeeshyAvatar(name = reel.authorName ?: "?", size = 36.dp, imageUrl = reel.authorAvatarUrl)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column {
            Text(
                text = reel.authorName ?: "",
                color = MeeshyPalette.White,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            ReelAuthorMeta(username = reel.username, reel = reel, isOwn = isOwn)
        }
    }
}

/** `@pseudo`, puis — pour l'auteur seul, à qui la passerelle les sert — impressions et vues. */
@Composable
private fun ReelAuthorMeta(username: String?, reel: ReelPresentation, isOwn: Boolean) {
    val locale = Locale.getDefault()
    val parts = buildList {
        username?.let { add("@$it") }
        if (isOwn) {
            add(stringResource(R.string.reels_impressions) + " " + CompactCountFormat.text(reel.impressionCount, locale))
            add(stringResource(R.string.reels_views) + " " + CompactCountFormat.text(reel.viewCount, locale))
        }
    }
    if (parts.isEmpty()) return
    Text(
        text = parts.joinToString(" · "),
        color = MeeshyPalette.White.copy(alpha = 0.7f),
        style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/**
 * Trois lignes repliée, quinze mots de tête au-delà de trente (la règle partagée
 * [MediaCaptionRule], la même que la story) ; dépliée, bornée en hauteur et défilante. Un toucher
 * bascule ; la taille s'anime.
 */
@Composable
private fun ReelCaptionText(
    text: String,
    isTranslated: Boolean,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val folded = remember(text) { MediaCaptionRule.collapse(text) }
    val toggles = folded.isTruncated
    val shown = if (toggles && !expanded) folded.head + "…" else text
    Column(
        Modifier
            .fillMaxWidth()
            .animateContentSize()
            .let { base -> if (toggles) base.clickable(role = Role.Button, onClick = onToggle) else base },
    ) {
        Text(
            text = shown,
            color = MeeshyPalette.White.copy(alpha = 0.92f),
            maxLines = if (expanded) Int.MAX_VALUE else 3,
            overflow = TextOverflow.Ellipsis,
            modifier = if (expanded) {
                Modifier.heightIn(max = EXPANDED_CAPTION_MAX_HEIGHT).verticalScroll(rememberScrollState())
            } else {
                Modifier
            },
        )
        if (isTranslated) {
            Icon(
                imageVector = MeeshyIcons.Translate,
                contentDescription = stringResource(R.string.reels_caption_translated),
                tint = MeeshyPalette.White.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = MeeshySpacing.xs).size(14.dp),
            )
        }
    }
}

@Composable
private fun ReelMetaRow(
    createdAtIso: String?,
    codes: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
) {
    val strings = rememberRelativeTimeStrings()
    val timestamp = remember(createdAtIso, strings) {
        isoToEpochMillisOrNull(createdAtIso)?.let {
            RelativeTimeFormat.short(it, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), strings)
        }
    }
    if (timestamp == null && codes.isEmpty()) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        timestamp?.let {
            Text(text = it, color = MeeshyPalette.White.copy(alpha = 0.7f), style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
        }
        codes.forEach { code ->
            ReelLanguageFlag(code = code, active = selected?.lowercase() == code.lowercase(), onClick = { onSelect(code) })
        }
    }
}

/** Le drapeau d'une langue de la légende, souligné quand c'est celle qu'on lit. */
@Composable
private fun ReelLanguageFlag(code: String, active: Boolean, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val interactive = LocalFullscreenChromeInteractive.current
    val info = LanguageData.info(code)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .sizeIn(minWidth = 32.dp, minHeight = 32.dp)
            .clip(RoundedCornerShape(MeeshySpacing.xs))
            .let { base ->
                if (!interactive) base else base.clickable(role = Role.Button) { haptics.selection(); onClick() }
            }
            .semantics(mergeDescendants = true) { contentDescription = info?.name ?: code },
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = info?.flag ?: code.uppercase(), color = Color.White)
        Box(
            Modifier
                .width(14.dp)
                .size(width = 14.dp, height = 2.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(if (active) Color.White else Color.Transparent),
        )
    }
}
