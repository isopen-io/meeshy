package me.meeshy.ui.component.field

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.CategoryCreationGate
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.CategorySubmit
import me.meeshy.sdk.model.ConversationCategoryPicker
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Libelles localises du [CategoryPickerField], fournis par l'ecran hote (aucun litteral dans l'atome). */
public data class CategoryPickerLabels(
    public val placeholderEmpty: String,
    public val placeholderChange: String,
    public val clearInput: String,
    public val remove: (name: String) -> String,
    public val select: (name: String) -> String,
    public val create: (name: String) -> String,
)

/**
 * Champ categorie (iOS `CategoryPickerField`) : la categorie choisie en puce amovible, une saisie, la liste
 * des autres au focus (filtree par la saisie) et la creation a la volee. [onCreate] est asynchrone : la ligne
 * « Creer » montre un indicateur et reste inerte jusqu'a ce que la categorie creee apparaisse (selection immediate).
 */
@Composable
public fun CategoryPickerField(
    categories: List<CategoryOption>,
    selectedId: String?,
    accent: Color,
    labels: CategoryPickerLabels,
    onSelect: (String) -> Unit,
    onCreate: (String) -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    LaunchedEffect(selectedId, categories.size) { creating = false }
    val focus = LocalFocusManager.current
    val picker = ConversationCategoryPicker.resolve(categories, selectedId, query)
    val selected = categories.firstOrNull { it.id == selectedId }
    val select = { id: String ->
        onSelect(id)
        query = ""
        focus.clearFocus()
    }
    val create = { name: String ->
        CategoryCreationGate.begin(name, creating)?.let {
            creating = true
            onCreate(it)
            query = ""
            focus.clearFocus()
        }
        Unit
    }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        selected?.let { SelectedCategoryChip(it.name, accent, labels.remove(it.name), onRemove) }
        ChipInputBox(
            value = query,
            onValueChange = { query = it },
            placeholder = if (selected == null) labels.placeholderEmpty else labels.placeholderChange,
            clearLabel = labels.clearInput,
            accent = accent,
            onFocusChange = { focused = it },
            onDone = {
                when (val outcome = picker.submit) {
                    is CategorySubmit.Select -> select(outcome.id)
                    is CategorySubmit.Create -> create(outcome.name)
                    CategorySubmit.None -> Unit
                }
            },
        )
        if (focused && (picker.displayed.isNotEmpty() || picker.canCreate)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(MeeshyTheme.tokens.surfaceFill),
            ) {
                picker.displayed.forEach { category ->
                    val spoken = labels.select(category.name)
                    SuggestionLine(
                        Modifier
                            .clickable(role = Role.Button) { select(category.id) }
                            .semantics(mergeDescendants = true) { contentDescription = spoken },
                    ) {
                        Icon(MeeshyIcons.Folder, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
                        Text(category.name, color = MeeshyTheme.tokens.textPrimary)
                    }
                }
                if (picker.canCreate) {
                    val name = query.trim()
                    val spoken = labels.create(name)
                    SuggestionLine(
                        Modifier
                            .clickable(enabled = !creating, role = Role.Button) { create(name) }
                            .semantics(mergeDescendants = true) { contentDescription = spoken },
                    ) {
                        if (creating) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = accent)
                        } else {
                            Icon(MeeshyIcons.AddCircleFilled, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
                        }
                        Text(spoken, color = accent, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun SelectedCategoryChip(name: String, accent: Color, removeLabel: String, onRemove: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(accent.copy(alpha = if (MeeshyTheme.isDark) 0.18f else 0.12f))
            .padding(start = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = name, color = accent, fontWeight = FontWeight.SemiBold)
        IconButton(
            onClick = onRemove,
            modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = removeLabel },
        ) {
            Icon(MeeshyIcons.Close, contentDescription = null, tint = accent.copy(alpha = 0.8f), modifier = Modifier.size(14.dp))
        }
    }
}
