package me.meeshy.app.feed

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'explorateur de langues d'un post (iOS `PostTranslationSheet`) : l'original, les traductions
 * disponibles (avec leur confiance) et les langues du lecteur que le post n'a pas encore. Choisir
 * une ligne change le texte lu ET la puce de la carte — le même [PostLanguageExplorer] sert l'un
 * et l'autre. Feuille : croix en haut à gauche, glissé vers le bas pour fermer.
 *
 * @param translating codes de langue dont la traduction à la demande est en vol.
 * @param onSelectLanguage choisit une langue ; une langue sans contenu est demandée au serveur.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PostTranslationSheet(
    explorer: PostLanguageExplorer,
    translating: Set<String>,
    onSelectLanguage: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    var sheetState by remember { mutableStateOf(PostTranslationSheetState()) }
    LaunchedEffect(translating, explorer.missing) {
        sheetState = sheetState.observing(translating, explorer.missing.toSet())
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(Modifier.padding(horizontal = MeeshySpacing.lg)) {
            SheetHeader(onDismiss)
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = MeeshySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                OriginalSection(explorer) {
                    haptics.light()
                    explorer.originalCode?.let(onSelectLanguage)
                    onDismiss()
                }
                SectionTitle(stringResource(R.string.feed_translation_available))
                explorer.translations.forEach { row ->
                    TranslationRow(row) {
                        haptics.light()
                        onSelectLanguage(row.code)
                        onDismiss()
                    }
                }
                if (explorer.missing.isNotEmpty()) {
                    SectionTitle(stringResource(R.string.feed_translation_other_languages))
                    explorer.missing.forEach { code ->
                        MissingRow(code, status = sheetState.statusOf(code, translating)) {
                            haptics.light()
                            sheetState = sheetState.asked(code)
                            onSelectLanguage(code)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetHeader(onDismiss: () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.sm)) {
        IconButton(
            onClick = onDismiss,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .size(40.dp)
                .clip(CircleShape)
                .background(MeeshyTheme.tokens.inputBackground),
        ) {
            Icon(
                imageVector = MeeshyIcons.Close,
                contentDescription = stringResource(R.string.feed_translation_close),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
        Text(
            text = stringResource(R.string.feed_translation_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.align(Alignment.Center),
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textPrimary,
    )
}

@Composable
private fun OriginalSection(explorer: PostLanguageExplorer, onClick: () -> Unit) {
    val name = explorer.originalInfo?.name ?: explorer.originalCode ?: "?"
    val label = "${stringResource(R.string.feed_translation_original)} ($name)"
    Column(
        modifier = rowChrome(selected = explorer.originalIsActive, onClick = onClick, label = label)
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(text = flagOf(explorer.originalInfo, explorer.originalCode.orEmpty()), style = MaterialTheme.typography.titleMedium)
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            if (explorer.originalIsActive) ActiveMark()
        }
        Text(
            text = explorer.originalText,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TranslationRow(row: PostLanguageRow, onClick: () -> Unit) {
    val name = row.info?.name ?: row.code
    val spoken = row.confidencePercent
        ?.let { "$name, ${stringResource(R.string.feed_translation_confidence_a11y, "$it%")}" }
        ?: name
    Row(
        modifier = rowChrome(selected = row.isActive, onClick = onClick, label = spoken).padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(text = flagOf(row.info, row.code), style = MaterialTheme.typography.titleMedium)
        Column(Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = row.text,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        row.confidencePercent?.let { percent ->
            val label = stringResource(R.string.feed_translation_confidence_a11y, "$percent%")
            Text(
                text = "$percent%",
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.semantics { contentDescription = label },
            )
        }
        if (row.isActive) ActiveMark()
        else Icon(
            imageVector = MeeshyIcons.ChevronForward,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun MissingRow(code: String, status: PostTranslationStatus, onRequest: () -> Unit) {
    val info = LanguageData.info(code)
    val name = info?.name ?: code
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.inputBackground)
            .border(BorderStroke(1.dp, MeeshyTheme.tokens.inputBorder.copy(alpha = 0.5f)), RoundedCornerShape(MeeshyRadius.md))
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(text = flagOf(info, code), style = MaterialTheme.typography.titleMedium)
        Column(Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textPrimary,
            )
            if (status == PostTranslationStatus.FAILED) {
                Text(
                    text = stringResource(R.string.feed_notice_translation_failed),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.error,
                )
            }
        }
        when (status) {
            PostTranslationStatus.TRANSLATING ->
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            PostTranslationStatus.REQUESTED -> RequestedMark(name)
            PostTranslationStatus.IDLE, PostTranslationStatus.FAILED -> TranslateButton(name, onRequest)
        }
    }
}

@Composable
private fun RequestedMark(name: String) {
    val requested = stringResource(R.string.feed_translation_requested)
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "$requested: $name" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(imageVector = MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyTheme.tokens.success, modifier = Modifier.size(14.dp))
        Text(text = requested, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.success)
    }
}

@Composable
private fun TranslateButton(name: String, onRequest: () -> Unit) {
    val translate = stringResource(R.string.feed_translation_translate)
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(MeeshyGradients.brand)
            .clickable(role = Role.Button, onClick = onRequest)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .semantics { contentDescription = "$translate: $name" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(imageVector = MeeshyIcons.Translate, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(14.dp))
        Text(text = translate, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MeeshyPalette.White)
    }
}

@Composable
private fun ActiveMark() {
    Icon(
        imageVector = MeeshyIcons.CheckCircleFilled,
        contentDescription = null,
        tint = MeeshyTheme.tokens.success,
        modifier = Modifier.size(20.dp),
    )
}

@Composable
private fun rowChrome(selected: Boolean, onClick: () -> Unit, label: String): Modifier =
    Modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(MeeshyRadius.md))
        .background(MeeshyTheme.tokens.inputBackground)
        .border(BorderStroke(1.dp, MeeshyTheme.tokens.inputBorder), RoundedCornerShape(MeeshyRadius.md))
        .clickable(role = Role.Button, onClick = onClick)
        .semantics(mergeDescendants = true) {
            this.selected = selected
            this.role = Role.Button
            contentDescription = label
        }

private fun flagOf(info: LanguageInfo?, code: String): String = info?.flag ?: code.uppercase()
