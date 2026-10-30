package me.meeshy.app.chat.options

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationCategoryPicker
import me.meeshy.sdk.model.conversationoptions.ConversationTagsEditor
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Un bouton pleine largeur teinté (iOS `actionButton` / `blockUserButton` de `ConversationInfoSheet`). */
@Composable
internal fun OptionsPillButton(
    icon: ImageVector,
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(MeeshyRadius.md),
        border = BorderStroke(1.dp, color.copy(alpha = 0.3f)),
        colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
            containerColor = color.copy(alpha = if (MeeshyTheme.isDark) 0.12f else 0.08f),
            contentColor = color,
        ),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
        Text(text = label, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = MeeshySpacing.sm))
    }
}

@Composable
private fun FieldLabel(icon: ImageVector, title: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Icon(
            icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(MeeshyRadius.xs))
                .background(color.copy(alpha = 0.15f))
                .padding(6.dp),
        )
        Text(text = title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun OptionsTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    onDone: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    TextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        placeholder = { Text(placeholder) },
        trailingIcon = trailing,
        keyboardOptions = KeyboardOptions(imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default),
        keyboardActions = KeyboardActions(onDone = onDone?.let { done -> { done() } }),
        shape = RoundedCornerShape(MeeshyRadius.sm),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MeeshyTheme.tokens.surfaceFill,
            unfocusedContainerColor = MeeshyTheme.tokens.surfaceFill,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = modifier.fillMaxWidth(),
    )
}

/** « Nom personnalisé » : la saisie s'affiche telle quelle, l'écriture part après une pause (iOS, 500 ms). */
@Composable
internal fun ConversationCustomNameField(draft: String, color: Color, onEdit: (String) -> Unit) {
    Column(
        modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        FieldLabel(MeeshyIcons.Edit, stringResource(R.string.conversation_options_custom_name), color)
        val clearLabel = stringResource(R.string.conversation_options_custom_name_clear)
        OptionsTextField(
            value = draft,
            onValueChange = onEdit,
            placeholder = stringResource(R.string.conversation_options_custom_name_placeholder),
            trailing = if (draft.isEmpty()) {
                null
            } else {
                {
                    IconButton(onClick = { onEdit("") }, modifier = Modifier.semantics { contentDescription = clearLabel }) {
                        Icon(MeeshyIcons.CloseCircleFilled, contentDescription = null, tint = MeeshyTheme.tokens.textMuted)
                    }
                }
            },
        )
    }
}

/** « Catégorie » (iOS `CategoryPickerField`) : la catégorie choisie, la recherche, les autres et la création. */
@Composable
internal fun ConversationCategoryField(
    categories: List<CategoryOption>,
    selectedId: String?,
    color: Color,
    onSelect: (String) -> Unit,
    onCreate: (String) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val picker = ConversationCategoryPicker.resolve(categories, selectedId, query)
    val selected = categories.firstOrNull { it.id == selectedId }
    Column(
        modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        FieldLabel(MeeshyIcons.GridViewFilled, stringResource(R.string.conversation_options_category), color)
        selected?.let { category ->
            Text(
                text = category.name,
                color = color,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(color.copy(alpha = 0.15f))
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            )
        }
        OptionsTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = stringResource(R.string.conversation_options_category_placeholder),
        )
        if (query.isNotBlank() || selected == null) {
            picker.displayed.forEach { category ->
                val label = stringResource(R.string.conversation_options_category_select, category.name)
                CategoryLine(category.name, MeeshyIcons.Folder, color, label) {
                    onSelect(category.id)
                    query = ""
                }
            }
        }
        if (picker.canCreate) {
            val name = query.trim()
            val label = stringResource(R.string.conversation_options_category_create, name)
            CategoryLine(label, MeeshyIcons.Add, color, label) {
                onCreate(name)
                query = ""
            }
        }
    }
}

@Composable
private fun CategoryLine(text: String, icon: ImageVector, color: Color, spoken: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = spoken }
            .padding(vertical = MeeshySpacing.sm, horizontal = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
        Text(text = text, color = MeeshyTheme.tokens.textPrimary)
    }
}

/** « Étiquettes » (iOS `TagInputField`) : les étiquettes posées, la saisie et les étiquettes déjà connues. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ConversationTagsField(
    tags: List<String>,
    knownTags: List<String>,
    color: Color,
    onAdd: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    var entry by remember { mutableStateOf("") }
    val submit = {
        if (entry.isNotBlank()) onAdd(entry)
        entry = ""
    }
    Column(
        modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        FieldLabel(MeeshyIcons.TagFilled, stringResource(R.string.conversation_options_tags), color)
        if (tags.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                tags.forEach { tag ->
                    val removeLabel = stringResource(R.string.conversation_options_tag_remove, tag)
                    InputChip(
                        selected = false,
                        onClick = { onRemove(tag) },
                        label = { Text(tag) },
                        trailingIcon = { Icon(MeeshyIcons.Close, contentDescription = null, modifier = Modifier.size(16.dp)) },
                        modifier = Modifier.semantics { contentDescription = removeLabel },
                    )
                }
            }
        }
        val addLabel = stringResource(R.string.conversation_options_tag_add, entry.trim())
        OptionsTextField(
            value = entry,
            onValueChange = { entry = it },
            placeholder = stringResource(R.string.conversation_options_tag_placeholder),
            onDone = submit,
            trailing = if (entry.isBlank()) {
                null
            } else {
                {
                    IconButton(onClick = submit, modifier = Modifier.semantics { contentDescription = addLabel }) {
                        Icon(MeeshyIcons.AddCircleFilled, contentDescription = null, tint = color)
                    }
                }
            },
        )
        val suggestions = ConversationTagsEditor.suggestions(knownTags, tags, entry).take(MAX_SUGGESTIONS)
        if (suggestions.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                suggestions.forEach { tag ->
                    SuggestionChip(onClick = { onAdd(tag); entry = "" }, label = { Text(tag) })
                }
            }
        }
    }
}

private const val MAX_SUGGESTIONS = 8
