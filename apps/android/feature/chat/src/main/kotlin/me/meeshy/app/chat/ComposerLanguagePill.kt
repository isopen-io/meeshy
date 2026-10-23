package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.LanguageData
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The composer's live language pill — the "smart context zone" affordance. Shows
 * the flag of the resolved source language ([ChatUiState.composerLanguageCode]),
 * following on-device detection as the viewer types, and opens a picker so they can
 * override it (long messages lock the detection, exactly like iOS). Thin,
 * coverage-exempt Compose glue over the pure [me.meeshy.sdk.model.ComposerLanguageState];
 * the picker offers the curated [LanguageData.commonLanguageCodes] set.
 */
@Composable
internal fun ComposerLanguagePill(
    languageCode: String,
    accentColor: Color,
    onPick: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val description = stringResource(R.string.chat_composer_language)
    Box {
        Text(
            text = ComposerLanguage.flag(languageCode),
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshySpacing.sm))
                .clickable { expanded = true }
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)
                .semantics { contentDescription = description },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            LanguageData.commonLanguageCodes.forEach { code ->
                val info = LanguageData.info(code) ?: return@forEach
                DropdownMenuItem(
                    text = { Text("${info.flag}  ${info.nativeName}") },
                    onClick = {
                        expanded = false
                        onPick(code)
                    },
                    trailingIcon = if (code == languageCode) {
                        {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = null,
                                tint = accentColor,
                            )
                        }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

