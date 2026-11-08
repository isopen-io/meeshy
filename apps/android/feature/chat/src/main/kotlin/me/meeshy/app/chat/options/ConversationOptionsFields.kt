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
import androidx.compose.ui.platform.LocalContext
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
import me.meeshy.ui.component.field.CategoryPickerField
import me.meeshy.ui.component.field.CategoryPickerLabels
import me.meeshy.ui.component.field.TagInputField
import me.meeshy.ui.component.field.TagInputLabels
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

/** « Catégorie » (iOS `CategoryPickerField`) : champ partagé de `:sdk-ui`, habillé de son libellé de rangée. */
@Composable
internal fun ConversationCategoryField(
    categories: List<CategoryOption>,
    selectedId: String?,
    color: Color,
    onSelect: (String) -> Unit,
    onCreate: (String) -> Unit,
    onRemove: () -> Unit,
) {
    val context = LocalContext.current
    val labels = CategoryPickerLabels(
        placeholderEmpty = stringResource(R.string.conversation_options_category_placeholder),
        placeholderChange = stringResource(R.string.conversation_options_category_placeholder),
        clearInput = stringResource(R.string.conversation_options_custom_name_clear),
        remove = { context.getString(R.string.conversation_options_category_remove, it) },
        select = { context.getString(R.string.conversation_options_category_select, it) },
        create = { context.getString(R.string.conversation_options_category_create, it) },
    )
    Column(
        modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        FieldLabel(MeeshyIcons.GridViewFilled, stringResource(R.string.conversation_options_category), color)
        CategoryPickerField(categories, selectedId, color, labels, onSelect, onCreate, onRemove)
    }
}

/** « Étiquettes » (iOS `TagInputField`) : champ partagé de `:sdk-ui`, habillé de son libellé de rangée. */
@Composable
internal fun ConversationTagsField(
    tags: List<String>,
    knownTags: List<String>,
    color: Color,
    onAdd: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    val context = LocalContext.current
    val labels = TagInputLabels(
        placeholder = stringResource(R.string.conversation_options_tag_placeholder),
        clearInput = stringResource(R.string.conversation_options_custom_name_clear),
        remove = { context.getString(R.string.conversation_options_tag_remove, it) },
        add = { context.getString(R.string.conversation_options_tag_add, it) },
        create = { context.getString(R.string.conversation_options_tag_add, it) },
    )
    Column(
        modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        FieldLabel(MeeshyIcons.TagFilled, stringResource(R.string.conversation_options_tags), color)
        TagInputField(tags, knownTags, color, labels, onAdd, onRemove)
    }
}
