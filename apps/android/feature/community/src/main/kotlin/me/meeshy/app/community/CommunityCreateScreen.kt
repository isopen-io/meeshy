package me.meeshy.app.community

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private val PopularEmojis = listOf("🚀", "🎮", "🎵", "📚", "💻", "🎨", "❤️", "🔥", "⭐", "🌱", "🌍", "🏆", "📸", "🍿", "🎉")

/**
 * La création d'une communauté (iOS `CommunityCreateScreen`) : aperçu vivant, champs, emoji, vie privée,
 * membres à ajouter. Chaque contrôle agit : le bouton reste grisé tant que le nom est vide, l'aperçu
 * suit la frappe, un refus du serveur s'affiche tel quel.
 */
@Composable
fun CommunityCreateScreen(
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    viewModel: CommunityCreateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is CommunityCreateEffect.Created -> {
                    haptics.success()
                    onCreated(effect.communityId)
                }
            }
        }
    }
    val tokens = MeeshyTheme.tokens
    Column(Modifier.fillMaxSize().background(tokens.backgroundPrimary).statusBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            CommunityRoundButton(
                Icons.AutoMirrored.Filled.ArrowBack,
                stringResource(R.string.community_back),
                onBack,
                tint = tokens.textPrimary,
                fill = tokens.backgroundSecondary,
            )
            Text(
                stringResource(R.string.community_create_title),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = tokens.textPrimary,
                modifier = Modifier.weight(1f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Spacer(Modifier.width(48.dp))
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            PreviewCard(state)
            Fields(state, viewModel)
            EmojiPicker(state.draft.emoji, state.accentHex) { haptics.selection(); viewModel.onEmoji(it) }
            PrivacyToggle(state.draft.isPrivate) { haptics.selection(); viewModel.onPrivate(it) }
            MembersSection(state, viewModel) { haptics.selection(); viewModel.toggleMember(it) }
            CreateButton(state) { viewModel.create() }
        }
    }
    state.errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            title = { Text(stringResource(R.string.community_create_error_title)) },
            text = { Text(message.ifBlank { stringResource(R.string.community_create_error_default) }) },
            confirmButton = { TextButton(onClick = viewModel::dismissError) { Text(stringResource(R.string.community_common_ok)) } },
        )
    }
}

@Composable
private fun PreviewCard(state: CommunityCreateUiState) {
    val accent = remember(state.accentHex) { hexColor(state.accentHex) }
    val animatedAccent by animateColorAsState(accent, MeeshyMotion.springDefault(), label = "previewAccent")
    val draft = state.draft
    Box(
        Modifier
            .fillMaxWidth()
            .height(160.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(animatedAccent, animatedAccent.copy(alpha = 0.6f)))),
    ) {
        androidx.compose.animation.AnimatedContent(
            targetState = draft.emoji,
            transitionSpec = { (scaleIn(MeeshyMotion.springBouncy()) + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
            modifier = Modifier.align(Alignment.TopEnd).padding(end = 14.dp, top = 12.dp),
            label = "previewEmoji",
        ) { emoji ->
            if (emoji.isNotEmpty()) Text(emoji, fontSize = 44.sp, modifier = Modifier.rotate(-8f).graphicsLayer { alpha = 0.85f })
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, 0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.55f))))
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                draft.name.ifEmpty { stringResource(R.string.community_create_preview_placeholder) },
                color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            if (draft.description.isNotBlank()) {
                Text(draft.description, color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(if (draft.isPrivate) Icons.Filled.Lock else Icons.Filled.Public, null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(11.dp))
                Text(
                    stringResource(if (draft.isPrivate) R.string.community_privacy_private else R.string.community_privacy_public),
                    color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun Fields(state: CommunityCreateUiState, viewModel: CommunityCreateViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        FieldGroup(stringResource(R.string.community_create_field_name), required = true) {
            PlainField(state.draft.name, viewModel::onName, stringResource(R.string.community_create_field_name_placeholder), ImeAction.Next)
        }
        FieldGroup(stringResource(R.string.community_create_field_identifier), required = false) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("mshy_", fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textMuted)
                Spacer(Modifier.width(4.dp))
                PlainField(state.draft.identifier, viewModel::onIdentifier, stringResource(R.string.community_create_field_identifier_placeholder), ImeAction.Next)
            }
        }
        FieldGroup(stringResource(R.string.community_create_field_description), required = false) {
            PlainField(state.draft.description, viewModel::onDescription, stringResource(R.string.community_create_field_description_placeholder), ImeAction.Default, singleLine = false, minLines = 3)
        }
    }
}

@Composable
private fun FieldGroup(label: String, required: Boolean, content: @Composable () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tokens.textSecondary)
            if (required) Text("*", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = tokens.error)
        }
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(12.dp)) { content() }
    }
}

@Composable
internal fun PlainField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    imeAction: ImeAction,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
) {
    val tokens = MeeshyTheme.tokens
    Box(modifier.fillMaxWidth()) {
        if (value.isEmpty()) Text(placeholder, color = tokens.textMuted, fontSize = 16.sp)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = minLines,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.textPrimary),
            cursorBrush = SolidColor(MeeshyPalette.Indigo500),
            keyboardOptions = KeyboardOptions(imeAction = imeAction),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun EmojiPicker(selected: String, accentHex: String, onPick: (String) -> Unit) {
    val tokens = MeeshyTheme.tokens
    val accent = remember(accentHex) { hexColor(accentHex) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.community_create_field_emoji), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tokens.textSecondary)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(PopularEmojis, key = { it }) { emoji ->
                val isSelected = emoji == selected
                val scale by animateFloatAsState(if (isSelected) 1.1f else 1f, MeeshyMotion.springBouncy(), label = "emojiScale")
                Box(
                    Modifier
                        .size(48.dp)
                        .graphicsLayer { scaleX = scale; scaleY = scale }
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isSelected) accent.copy(alpha = 0.25f) else tokens.backgroundSecondary.copy(alpha = 0.5f))
                        .border(BorderStroke(2.dp, if (isSelected) accent else Color.Transparent), RoundedCornerShape(10.dp))
                        .pressableScale(onClick = { onPick(emoji) })
                        .semantics { contentDescription = emoji },
                    contentAlignment = Alignment.Center,
                ) { Text(emoji, fontSize = 26.sp) }
            }
        }
    }
}

@Composable
private fun PrivacyToggle(isPrivate: Boolean, onChange: (Boolean) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            if (isPrivate) Icons.Filled.Lock else Icons.Filled.Public,
            null,
            tint = if (isPrivate) MeeshyPalette.Indigo500 else MeeshyPalette.Success,
            modifier = Modifier.size(24.dp),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(stringResource(R.string.community_create_privacy_title), fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = tokens.textPrimary)
            Text(
                stringResource(if (isPrivate) R.string.community_create_privacy_private_description else R.string.community_create_privacy_public_description),
                fontSize = 13.sp,
                color = tokens.textSecondary,
            )
        }
        Switch(checked = isPrivate, onCheckedChange = onChange)
    }
}

@Composable
private fun MembersSection(state: CommunityCreateUiState, viewModel: CommunityCreateViewModel, onToggle: (UserSearchResult) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.community_create_members_title), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tokens.textSecondary)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, null, tint = tokens.textMuted, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Box(Modifier.weight(1f)) {
                PlainField(state.memberQuery, viewModel::onMemberQuery, stringResource(R.string.community_create_members_search_placeholder), ImeAction.Search)
            }
            if (state.memberQuery.isNotEmpty()) {
                Icon(
                    Icons.Filled.Close, stringResource(R.string.community_common_close), tint = tokens.textMuted,
                    modifier = Modifier.size(18.dp).clip(CircleShape).pressableScale(onClick = { viewModel.onMemberQuery("") }),
                )
            }
        }
        AnimatedVisibility(visible = state.selected.isNotEmpty(), enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.selected, key = { it.id }) { user -> SelectedChip(user, onRemove = { onToggle(user) }) }
            }
        }
        when {
            state.isSearching -> Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
            }
            else -> Column {
                state.results.forEach { user ->
                    key(user.id) { ResultRow(user, isSelected = state.selected.any { it.id == user.id }, onClick = { onToggle(user) }) }
                }
            }
        }
    }
}

@Composable
private fun SelectedChip(user: UserSearchResult, onRemove: () -> Unit) {
    Row(
        Modifier
            .clip(CircleShape)
            .background(Brush.horizontalGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo700)))
            .pressableScale(onClick = onRemove)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(user.displayName ?: user.username, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        Icon(Icons.Filled.Close, stringResource(R.string.community_common_close), tint = Color.White, modifier = Modifier.size(12.dp))
    }
}

@Composable
private fun ResultRow(user: UserSearchResult, isSelected: Boolean, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val name = user.displayName ?: user.username
    val background by animateColorAsState(
        if (isSelected) MeeshyPalette.SuccessDeep.copy(alpha = 0.08f) else tokens.backgroundSecondary.copy(alpha = 0.3f),
        MeeshyMotion.springFast(),
        label = "resultBackground",
    )
    Row(
        Modifier.fillMaxWidth().background(background).pressableScale(onClick = onClick, pressedScale = 0.98f, role = androidx.compose.ui.semantics.Role.Checkbox).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        MeeshyAvatar(
            name = name,
            size = 40.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(user.username)),
            presence = PresenceState.ONLINE.takeIf { user.isOnline == true },
            imageUrl = user.avatar,
        )
        Column(Modifier.weight(1f)) {
            Text(name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("@${user.username}", fontSize = 12.sp, color = tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        AnimatedVisibility(visible = isSelected, enter = scaleIn(MeeshyMotion.springBouncy()) + fadeIn(), exit = scaleOut() + fadeOut()) {
            Icon(Icons.Filled.CheckCircle, null, tint = MeeshyPalette.SuccessDeep, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun CreateButton(state: CommunityCreateUiState, onClick: () -> Unit) {
    val enabled = state.canSubmit
    val fill = if (state.draft.isValid) {
        Brush.horizontalGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo700))
    } else {
        SolidColor(Color.Gray.copy(alpha = 0.4f))
    }
    Row(
        Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .clip(RoundedCornerShape(14.dp))
            .background(fill)
            .pressableScale(onClick = onClick, enabled = enabled, pressedScale = 0.97f)
            .padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.isCreating) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
        } else {
            Icon(Icons.Filled.AddCircle, null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.community_create_button), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}
