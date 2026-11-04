package me.meeshy.ui.component.field

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ConversationTagAutocomplete
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Libelles localises du [TagInputField]. */
public data class TagInputLabels(
    public val placeholder: String,
    public val clearInput: String,
    public val remove: (tag: String) -> String,
    public val add: (tag: String) -> String,
    public val create: (tag: String) -> String,
)

/**
 * Champ etiquettes (iOS `TagInputField`) : puces amovibles teintees de l'accent, saisie, suggestions des
 * etiquettes connues au focus (huit au plus) et ligne « Creer » ; la validation ajoute la premiere suggestion
 * ou la saisie creable (loi pure [ConversationTagAutocomplete]).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun TagInputField(
    selectedTags: List<String>,
    knownTags: List<String>,
    accent: Color,
    labels: TagInputLabels,
    onAdd: (String) -> Unit,
    onRemove: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val state = ConversationTagAutocomplete.resolve(knownTags, selectedTags, query)
    val add = { tag: String ->
        ConversationTagAutocomplete.append(selectedTags, tag)?.let { onAdd(tag.trim()) }
        query = ""
    }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        if (selectedTags.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                selectedTags.forEach { tag ->
                    val spoken = labels.remove(tag)
                    InputChip(
                        selected = false,
                        onClick = { onRemove(tag) },
                        label = { Text(tag, color = accent) },
                        trailingIcon = {
                            Icon(MeeshyIcons.Close, contentDescription = null, tint = accent.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
                        },
                        colors = InputChipDefaults.inputChipColors(containerColor = accent.copy(alpha = if (MeeshyTheme.isDark) 0.15f else 0.10f)),
                        modifier = Modifier.semantics { contentDescription = spoken },
                    )
                }
            }
        }
        ChipInputBox(
            value = query,
            onValueChange = { query = it },
            placeholder = labels.placeholder,
            clearLabel = labels.clearInput,
            accent = accent,
            onFocusChange = { focused = it },
            onDone = { state.submitTag?.let(add) },
        )
        if (focused && (state.suggestions.isNotEmpty() || state.canCreate)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(MeeshyTheme.tokens.surfaceFill),
            ) {
                state.suggestions.forEach { tag ->
                    val spoken = labels.add(tag)
                    SuggestionLine(
                        Modifier
                            .clickable(role = Role.Button) { add(tag) }
                            .semantics(mergeDescendants = true) { contentDescription = spoken },
                    ) {
                        Icon(MeeshyIcons.TagFilled, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(14.dp))
                        Text(tag, color = MeeshyTheme.tokens.textPrimary)
                    }
                }
                if (state.canCreate) {
                    val name = query.trim()
                    val spoken = labels.create(name)
                    SuggestionLine(
                        Modifier
                            .clickable(role = Role.Button) { add(name) }
                            .semantics(mergeDescendants = true) { contentDescription = spoken },
                    ) {
                        Icon(MeeshyIcons.AddCircleFilled, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
                        Text(spoken, color = accent, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
