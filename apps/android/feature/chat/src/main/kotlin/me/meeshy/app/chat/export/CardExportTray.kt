package me.meeshy.app.chat.export

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que le plateau lit de l'atelier et les gestes qu'il lui rend. */
internal class CardTrayState(
    val tab: CardTab,
    val tabs: List<CardTab>,
    val focus: CardPartId?,
    val format: CardFormat,
    val popular: List<CardTemplateId>,
    val hasQuote: Boolean,
    val hasTitle: Boolean,
    val hasHandles: Boolean,
    val languages: List<CardLanguage>,
    val exportLanguage: String?,
    val thumbs: CardThumbSource,
)

internal class CardTrayActions(
    val onTab: (CardTab) -> Unit,
    val onFormat: (CardFormat) -> Unit,
    val onLanguage: (String?) -> Unit,
    val onGallery: () -> Unit,
    val onHaptic: () -> Unit,
)

/**
 * LE PLATEAU DE L'ATELIER — une surface sous l'aperçu qui ne montre qu'UN panneau à la fois : les
 * styles, le format de l'image, la disposition (« Frame »), le fond, la police, la liaison, les
 * détails, la langue. Toucher une partie de la carte ouvre l'onglet qui la règle.
 */
@Composable
internal fun CardExportTray(state: CardTrayState, actions: CardTrayActions, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(MeeshyTheme.tokens.surfaceFill)
            .padding(vertical = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        TabBar(state, actions)
        AnimatedContent(
            targetState = state.tab,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            modifier = Modifier.defaultMinSize(minHeight = 96.dp),
            label = "trayPanel",
        ) { tab -> Panel(tab, state, actions) }
    }
}

@Composable
private fun TabBar(state: CardTrayState, actions: CardTrayActions) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        items(state.tabs, key = { it.name }) { tab ->
            val selected = tab == state.tab
            Box(
                modifier = Modifier
                    .defaultMinSize(minHeight = 44.dp)
                    .clip(CircleShape)
                    .background(if (selected) MeeshyTheme.tokens.hairline else androidx.compose.ui.graphics.Color.Transparent)
                    .semantics { role = Role.Tab; this.selected = selected }
                    .clickable { actions.onHaptic(); actions.onTab(tab) }
                    .padding(horizontal = MeeshySpacing.md),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    CardLabels.tab(tab),
                    color = if (selected) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textSecondary,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal),
                )
            }
        }
    }
}

@Composable
private fun LazyRowOf(content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xxs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.Top,
        content = content,
    )
}

@Composable
private fun Panel(tab: CardTab, state: CardTrayState, actions: CardTrayActions) {
    val format = state.format
    fun change(next: CardFormat) { actions.onHaptic(); actions.onFormat(next) }
    when (tab) {
        CardTab.STYLES -> LazyRowOf {
            state.popular.forEach { id ->
                CardThumb(id, state.thumbs, id == format.template, 72.dp, { change(format.copy(template = id)) })
            }
            AllStylesTile(actions)
        }
        CardTab.FORMAT -> LazyRowOf {
            CardAspect.entries.forEach { aspect ->
                CardTile(CardLabels.aspect(aspect), aspect == format.aspect, { change(format.copy(aspect = aspect)) }) {
                    Text(aspectRatio(aspect), color = MeeshyTheme.tokens.textPrimary, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        CardTab.FRAME -> FramePanel(state, ::change)
        CardTab.PALETTE -> LazyRowOf {
            CardPaletteId.entries.forEach { id ->
                CardTile(id.palette.name, id == format.template.palette, { change(format.copy(template = format.template.with(palette = id))) }) {
                    CardSwatch(id.palette, Modifier.size(40.dp))
                }
            }
        }
        CardTab.TYPEFACE -> TypefacePanel(state, ::change)
        CardTab.LINK -> LazyRowOf {
            CardLinkId.entries.forEach { id ->
                CardTile(CardLabels.link(id), id == format.template.link, { change(format.copy(template = format.template.with(link = id))) }) {
                    Text(linkGlyph(id), color = MeeshyTheme.tokens.textPrimary, style = MaterialTheme.typography.titleLarge)
                }
            }
        }
        CardTab.DETAILS -> LazyRowOf {
            format.offeredToggles(state.hasTitle, state.hasQuote).forEach { toggle ->
                CardPill(CardLabels.toggle(toggle), format[toggle], { change(format.with(toggle, !format[toggle])) })
            }
        }
        CardTab.LANGUAGE -> LazyRowOf {
            CardPill(stringResource(R.string.export_card_language_asRead), state.exportLanguage == null, { actions.onHaptic(); actions.onLanguage(null) })
            state.languages.forEach { language ->
                CardPill(
                    Locale.forLanguageTag(language.code).getDisplayLanguage(Locale.getDefault()).ifBlank { language.code.uppercase() },
                    state.exportLanguage == language.code,
                    { actions.onHaptic(); actions.onLanguage(language.code) },
                )
            }
        }
    }
}

@Composable
private fun AllStylesTile(actions: CardTrayActions) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier
            .size(72.dp, 76.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(tokens.controlFill)
            .semantics { role = Role.Button }
            .clickable { actions.onHaptic(); actions.onGallery() },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("${CardTemplates.all.size}", color = tokens.textPrimary, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
        Text(stringResource(R.string.export_card_gallery_open), color = tokens.textSecondary, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun FramePanel(state: CardTrayState, change: (CardFormat) -> Unit) {
    val format = state.format
    LazyRowOf {
        format.frameToggles(state.hasHandles).forEach { toggle ->
            CardPill(CardLabels.toggle(toggle), format[toggle], { change(format.with(toggle, !format[toggle])) })
        }
        CardAuthorPlacement.entries.forEach { placement ->
            CardPill(CardLabels.placement(placement), placement == format.authorPlacement, { change(format.copy(authorPlacement = placement)) })
        }
        CardTilt.entries.forEach { tilt ->
            CardPill(CardLabels.tilt(tilt), tilt == format.tilt, { change(format.copy(tilt = tilt)) })
        }
    }
}

@Composable
private fun TypefacePanel(state: CardTrayState, change: (CardFormat) -> Unit) {
    val format = state.format
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        LazyRowOf {
            CardTypefaceId.entries.forEach { id ->
                CardTile(CardLabels.typeface(id), id == format.template.typeface, { change(format.copy(template = format.template.with(typeface = id))) }) {
                    CardTypefaceGlyph(id)
                }
            }
        }
        val toggle = anonymizeToggle(state)
        Row(
            Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.export_card_typeface_pairs), color = MeeshyTheme.tokens.textSecondary,
                style = MaterialTheme.typography.bodySmall, maxLines = 2, modifier = Modifier.weight(1f),
            )
            if (toggle != null) CardPill(CardLabels.toggle(toggle), format[toggle], { change(format.with(toggle, !format[toggle])) })
        }
    }
}

/** L'anonymat de la partie touchée — seulement si un nom y est peint. */
private fun anonymizeToggle(state: CardTrayState): CardToggle? {
    if (!state.format.showAuthors) return null
    return when (state.focus) {
        CardPartId.QUOTE -> CardToggle.ANONYMIZE_QUOTED.takeIf { state.hasQuote }
        CardPartId.REPLY -> CardToggle.ANONYMIZE_REPLY
        else -> null
    }
}

private fun aspectRatio(aspect: CardAspect): String = when (aspect) {
    CardAspect.AUTO -> "∞"
    CardAspect.STORY -> "9:16"
    CardAspect.PORTRAIT -> "4:5"
    CardAspect.SQUARE -> "1:1"
    CardAspect.LANDSCAPE -> "16:9"
}

private fun linkGlyph(id: CardLinkId): String = when (id) {
    CardLinkId.ORBITE -> "· ◯ ·"
    CardLinkId.FILET -> "▬"
    CardLinkId.GUILLEMETS -> "“"
    CardLinkId.FLECHE -> "↳"
    CardLinkId.BULLES -> "◔"
    CardLinkId.FIL -> "┃•"
    CardLinkId.SILENCE -> "∅"
}
