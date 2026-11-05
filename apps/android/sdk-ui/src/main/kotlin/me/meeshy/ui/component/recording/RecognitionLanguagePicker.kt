package me.meeshy.ui.component.recording

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.speech.RecognitionLanguageList
import me.meeshy.sdk.model.speech.RecognitionLanguageOption
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le sélecteur de langue de reconnaissance (iOS `AudioLanguagePickerView`), en feuille moyenne/haute : par défaut seules
 * les langues dont le modèle est installé sur l'appareil ([installedTags]), la bascule « Afficher toutes les langues » les
 * liste toutes, une recherche filtre, la langue [selected] porte la coche. Choisir ferme la feuille.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun RecognitionLanguagePicker(
    installedTags: Set<String>,
    selected: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        RecognitionLanguagePickerContent(
            installedTags = installedTags,
            selected = selected,
            onSelect = { onSelect(it); onDismiss() },
            accent = accent,
        )
    }
}

@Composable
public fun RecognitionLanguagePickerContent(
    installedTags: Set<String>,
    selected: String,
    onSelect: (String) -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    var showAll by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val options = remember(installedTags, showAll, query) { RecognitionLanguageList.options(installedTags, showAll, query) }
    Column(modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(stringResource(R.string.recognition_language_title), color = tokens.textPrimary, fontSize = 17.sp)
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text(stringResource(R.string.recognition_language_search), color = tokens.textMuted) },
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(value = showAll, role = Role.Switch, onValueChange = { showAll = it }),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(stringResource(R.string.recognition_language_show_all), color = tokens.textPrimary, fontSize = 14.sp)
            Switch(
                checked = showAll,
                onCheckedChange = null,
                colors = SwitchDefaults.colors(checkedTrackColor = accent),
            )
        }
        Text(stringResource(R.string.recognition_language_hint), color = tokens.textMuted, fontSize = 12.sp)
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp)) {
            items(options, key = { it.code }, contentType = { "language" }) { option ->
                val active = RecognitionLanguageList.isSelected(option, selected)
                LanguageRow(option, active, accent) {
                    haptics.light()
                    onSelect(option.code)
                }
            }
        }
    }
}

@Composable
private fun LanguageRow(option: RecognitionLanguageOption, active: Boolean, accent: Color, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .semantics { selected = active }
            .clickable(role = Role.RadioButton, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(option.name, color = tokens.textPrimary, fontSize = 16.sp)
            Text(option.code, color = tokens.textMuted, fontSize = 12.sp)
        }
        if (active) {
            Icon(MeeshyIcons.Check, contentDescription = stringResource(R.string.recognition_language_selected), tint = accent)
        }
    }
}
