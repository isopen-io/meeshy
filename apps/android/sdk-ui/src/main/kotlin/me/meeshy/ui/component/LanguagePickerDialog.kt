package me.meeshy.ui.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * One selectable row of the picker — opaque to the SDK, pre-formatted by the
 * caller (e.g. `"${flag}  ${nativeName}"`). [code] is nullable so a picker
 * can offer a non-language sentinel option (e.g. "use device default")
 * without the SDK knowing what that sentinel means.
 */
@Immutable
data class LanguagePickerOption(
    val code: String?,
    val label: String,
    val isSelected: Boolean,
)

/**
 * Shared `AlertDialog` scaffold for a language picker: a scrollable list of
 * radio rows, with an optional search field above it. Extracted from three
 * near-identical dialogs (`feature:settings`'s interface- and
 * regional-language pickers, `feature:feed`'s composer language picker) that
 * each hand-rolled the same `AlertDialog` + radio-row-list shape.
 *
 * Search is opt-in: pass [searchQuery]/[onSearchQueryChange] to render the
 * search field (mirrors the regional-language picker); omit them for a plain
 * list (mirrors the interface-language picker). Filtering itself stays the
 * caller's job — this composable only renders whatever [options] it is
 * given, per SDK purity (the SDK owns no "how to filter" rule).
 */
@Composable
fun LanguagePickerDialog(
    titleText: String,
    options: List<LanguagePickerOption>,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit,
    dismissButtonLabel: String,
    modifier: Modifier = Modifier,
    searchQuery: String? = null,
    onSearchQueryChange: ((String) -> Unit)? = null,
    searchPlaceholder: String? = null,
    emptyStateText: String? = null,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = modifier,
        title = { Text(titleText) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                if (searchQuery != null && onSearchQueryChange != null) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        placeholder = searchPlaceholder?.let { { Text(it) } },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = MeeshySpacing.xs),
                    )
                }
                if (options.isEmpty() && emptyStateText != null) {
                    Text(
                        text = emptyStateText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier.padding(vertical = MeeshySpacing.sm),
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 320.dp)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        options.forEach { option ->
                            LanguagePickerOptionRow(
                                label = option.label,
                                isSelected = option.isSelected,
                                onClick = { onSelect(option.code) },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(dismissButtonLabel)
            }
        },
    )
}

@Composable
private fun LanguagePickerOptionRow(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.RadioButton }
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = isSelected, onClick = onClick)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
    }
}
