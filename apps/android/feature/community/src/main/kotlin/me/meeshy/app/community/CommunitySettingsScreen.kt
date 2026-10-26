package me.meeshy.app.community

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private val PresetColors = listOf(
    "FF2E63", "A855F7", "08D9D6", "FF6B6B", "4ECDC4", "45B7D1",
    "F59E0B", "10B981", "6366F1", "EC4899", "14B8A6", "F97316",
)

/** Les réglages d'une communauté (iOS `CommunitySettingsScreen`) : visuel, infos, confidentialité, zone dangereuse. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CommunitySettingsScreen(
    onCancel: () -> Unit,
    onSaved: () -> Unit,
    onDeleted: () -> Unit,
    viewModel: CommunitySettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 2) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    var pickTarget by rememberSaveable { mutableStateOf(ImageUploadTarget.AVATAR) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { context.contentResolver.readMediaUploadItem(it) }?.let { viewModel.upload(pickTarget, it) }
    }
    fun pick(target: ImageUploadTarget) {
        pickTarget = target
        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                CommunitySettingsEffect.Saved -> {
                    haptics.success()
                    toasts.emit(FeedbackToastRequest(R.string.community_settings_toast_updated, FeedbackKind.Success))
                    onSaved()
                }
                CommunitySettingsEffect.Deleted -> onDeleted()
                is CommunitySettingsEffect.UploadResult -> {
                    val avatar = effect.target == ImageUploadTarget.AVATAR
                    if (effect.succeeded) haptics.success() else haptics.error()
                    val res = when {
                        avatar && effect.succeeded -> R.string.community_settings_toast_avatar_uploaded
                        avatar -> R.string.community_settings_toast_avatar_failed
                        effect.succeeded -> R.string.community_settings_toast_banner_uploaded
                        else -> R.string.community_settings_toast_banner_failed
                    }
                    toasts.emit(FeedbackToastRequest(res, if (effect.succeeded) FeedbackKind.Success else FeedbackKind.Error))
                }
            }
        }
    }

    val tokens = MeeshyTheme.tokens
    Box(Modifier.fillMaxSize().background(tokens.backgroundPrimary)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onCancel) { Text(stringResource(R.string.community_common_cancel), color = tokens.textSecondary) }
                Text(
                    stringResource(R.string.community_settings_title),
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = tokens.textPrimary,
                )
                TextButton(onClick = viewModel::save, enabled = state.canSave) {
                    if (state.isSaving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text(stringResource(R.string.community_common_save), fontWeight = FontWeight.Bold)
                }
            }
            val draft = state.draft
            when {
                draft == null && state.failedToLoad -> MeeshyEmptyState(
                    icon = Icons.Filled.Warning,
                    title = stringResource(R.string.community_common_error),
                    subtitle = stringResource(R.string.community_settings_error_default),
                    actionLabel = stringResource(R.string.community_common_retry),
                    onAction = viewModel::load,
                )
                draft == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                else -> Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    val fields = draft.current
                    val accent = remember(fields.color) { hexColor(fields.color) }
                    Box(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(16.dp))) {
                        CommunityBanner(fields.bannerUrl.ifEmpty { null }, fields.color, Modifier.fillMaxSize())
                        Row(
                            Modifier
                                .align(Alignment.BottomEnd).padding(10.dp)
                                .clip(CircleShape).background(Color.Black.copy(alpha = 0.45f))
                                .pressableScale(onClick = { pick(ImageUploadTarget.BANNER) }, enabled = state.uploading == null)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.Filled.PhotoLibrary, null, tint = Color.White, modifier = Modifier.size(14.dp))
                            Text(stringResource(R.string.community_settings_banner_edit), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        }
                        if (state.uploading == ImageUploadTarget.BANNER) UploadScrim()
                    }
                    Column(Modifier.fillMaxWidth().offset(y = (-40).dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box {
                            MeeshyAvatar(
                                name = fields.name, size = 88.dp, containerColor = accent,
                                imageUrl = fields.avatarUrl.ifEmpty { null },
                                modifier = Modifier.border(4.dp, tokens.backgroundPrimary, CircleShape),
                            )
                            Box(
                                Modifier.align(Alignment.BottomEnd).size(48.dp).offset(x = 8.dp, y = 8.dp)
                                    .pressableScale(onClick = { pick(ImageUploadTarget.AVATAR) }, enabled = state.uploading == null)
                                    .semantics { contentDescription = fields.name },
                                contentAlignment = Alignment.Center,
                            ) {
                                Box(Modifier.size(28.dp).clip(CircleShape).background(accent).border(2.dp, tokens.backgroundPrimary, CircleShape), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Filled.Edit, null, tint = Color.White, modifier = Modifier.size(14.dp))
                                }
                            }
                            if (state.uploading == ImageUploadTarget.AVATAR) Box(Modifier.matchParentSize().clip(CircleShape)) { UploadScrim() }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(fields.name, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = tokens.textPrimary, maxLines = 1)
                    }
                    Column(Modifier.offset(y = (-40).dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        SettingsCard(stringResource(R.string.community_settings_color)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                PresetColors.forEachIndexed { index, hex ->
                                    Swatch(hex, index, fields.color.equals(hex, true)) { haptics.selection(); viewModel.onColor(hex) }
                                }
                            }
                        }
                        SettingsCard(stringResource(R.string.community_settings_emoji)) {
                            PlainField(fields.emoji, viewModel::onEmoji, "🏘️", ImeAction.Done)
                        }
                        SectionTitle(stringResource(R.string.community_settings_section_info))
                        SettingsCard(stringResource(R.string.community_settings_field_name)) {
                            PlainField(fields.name, viewModel::onName, stringResource(R.string.community_settings_field_name_placeholder), ImeAction.Next)
                        }
                        SettingsCard(stringResource(R.string.community_settings_field_description)) {
                            PlainField(fields.description, viewModel::onDescription, stringResource(R.string.community_settings_field_description), ImeAction.Default, singleLine = false, minLines = 3)
                        }
                        SectionTitle(stringResource(R.string.community_settings_section_privacy))
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(R.string.community_settings_privacy_title), fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
                                Text(
                                    stringResource(if (fields.isPrivate) R.string.community_settings_privacy_by_invitation else R.string.community_settings_privacy_open_to_all),
                                    fontSize = 13.sp, color = tokens.textSecondary,
                                )
                            }
                            Switch(checked = fields.isPrivate, onCheckedChange = { haptics.selection(); viewModel.onPrivate(it) })
                        }
                        if (viewModel.isCreator) {
                            SectionTitle(stringResource(R.string.community_settings_section_danger))
                            val error = tokens.error
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(error.copy(alpha = 0.1f))
                                    .pressableScale(onClick = { haptics.warning(); confirmDelete = true }, enabled = !state.isDeleting)
                                    .padding(vertical = 14.dp),
                                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (state.isDeleting) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = error)
                                else Icon(Icons.Filled.Delete, null, tint = error, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(stringResource(R.string.community_settings_delete_label), color = error, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Spacer(Modifier.navigationBarsPadding())
                    }
                }
            }
        }
        FeedbackToastHost(toasts = toasts, modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
    }

    state.errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            title = { Text(stringResource(R.string.community_settings_error_title)) },
            text = { Text(message.ifBlank { stringResource(R.string.community_settings_error_default) }) },
            confirmButton = { TextButton(onClick = viewModel::dismissError) { Text(stringResource(R.string.community_common_ok)) } },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.community_settings_delete_confirm_title)) },
            text = { Text(stringResource(R.string.community_settings_delete_confirm_message)) },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; viewModel.delete() }) {
                    Text(stringResource(R.string.community_settings_delete_button), color = MeeshyTheme.tokens.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.community_common_cancel)) } },
        )
    }
}

@Composable
private fun UploadScrim() {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = Color.White)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textMuted)
}

@Composable
private fun SettingsCard(label: String, content: @Composable () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tokens.textSecondary)
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(12.dp)) { content() }
    }
}

@Composable
private fun Swatch(hex: String, index: Int, selected: Boolean, onClick: () -> Unit) {
    val scale by animateFloatAsState(if (selected) 1.1f else 1f, MeeshyMotion.springFast(), label = "swatch")
    val description = stringResource(R.string.community_settings_color_swatch_a11y, index + 1, PresetColors.size)
    Box(
        Modifier
            .size(44.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(hexColor(hex))
            .border(2.dp, Color.White.copy(alpha = if (selected) 0.6f else 0f), CircleShape)
            .pressableScale(onClick = onClick, role = androidx.compose.ui.semantics.Role.RadioButton)
            .semantics { contentDescription = description; this.selected = selected },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}
