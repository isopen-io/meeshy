package me.meeshy.app.chat.export

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA GALERIE DES STYLES — les 784 cartes, peintes sur le message de l'utilisateur, les plus
 * utilisées d'abord. On y CHERCHE avec les mots de l'interface (« plume sombre »), sans casse ni
 * accents ; les polices et les liaisons s'offrent en suggestions d'un toucher, le ton se filtre.
 * Feuille pleine hauteur : croix et glissé vers le bas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CardExportGallery(
    usage: Map<CardTemplateId, Int>,
    selected: CardTemplateId,
    source: CardThumbSource,
    onPick: (CardTemplateId) -> Unit,
    onClose: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val haptic = LocalHapticFeedback.current
    val vocabulary = CardLabels.vocabulary()
    var query by rememberSaveable { mutableStateOf("") }
    var tone by rememberSaveable { mutableStateOf<CardTone?>(null) }
    val results = remember(query, tone, vocabulary, usage) { CardSearch.search(query, vocabulary, usage, tone) }
    val suggestions = CardTypefaceId.entries.map { CardLabels.typeface(it) } + CardLinkId.entries.map { CardLabels.link(it) }
    val columns = 3
    val cell = ((LocalConfiguration.current.screenWidthDp.dp - 32.dp - 10.dp * (columns - 1)) / columns).coerceAtLeast(60.dp)

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = tokens.backgroundPrimary,
    ) {
        Column(Modifier.fillMaxHeight().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.export_card_gallery_close), tint = tokens.textPrimary)
                }
                Text(
                    stringResource(R.string.export_card_gallery_title), color = tokens.textPrimary,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                )
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.export_card_gallery_placeholder)) },
                leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            LazyVerticalGrid(
                columns = GridCells.Fixed(columns),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                item(span = { GridItemSpan(columns) }, key = "filters") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                            listOf<CardTone?>(null, CardTone.DARK, CardTone.LIGHT).forEach { value ->
                                CardPill(CardLabels.tone(value), tone == value, { tone = value }, Modifier.weight(1f))
                            }
                        }
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(suggestions.size, key = { suggestions[it] }) { index ->
                                val word = suggestions[index]
                                CardPill(word, false, {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    query = "${query.trim()} $word".trim()
                                })
                            }
                        }
                        Text(
                            stringResource(R.string.export_card_gallery_count, results.size),
                            color = tokens.textSecondary, style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                if (results.isEmpty()) {
                    item(span = { GridItemSpan(columns) }, key = "empty") {
                        Text(
                            stringResource(R.string.export_card_gallery_empty), color = tokens.textSecondary,
                            textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 24.dp),
                        )
                    }
                } else {
                    items(results, key = { it.rawValue }) { id ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            CardThumb(id, source, id == selected, cell, {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                onPick(id)
                            })
                            Text(
                                "${id.palette.palette.name} · ${CardLabels.typeface(id.typeface)} · ${CardLabels.link(id.link)}",
                                color = tokens.textSecondary, style = MaterialTheme.typography.labelSmall,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}
