package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CreateShareLinkForm
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val EXPIRATION_OPTIONS = listOf(
    ShareLinkExpiration.Never to R.string.share_link_expiration_never,
    ShareLinkExpiration.Hours24 to R.string.share_link_expiration_24h,
    ShareLinkExpiration.Days7 to R.string.share_link_expiration_7d,
    ShareLinkExpiration.Days30 to R.string.share_link_expiration_30d,
    ShareLinkExpiration.Months3 to R.string.share_link_expiration_3m,
)

private val ShareAccent = MeeshyPalette.ShareAccent
private const val DISABLED_BUTTON_ALPHA = 0.1f

/**
 * The share-link creation screen (iOS `CreateShareLinkView`): the owner picks the
 * conversation inside the form (sectioned, searchable sheet) — or arrives with it
 * seeded from a chat — then sets guest access, anonymous permissions and limits,
 * each rule carrying an explanatory subtitle. On success a haptic confirms and the
 * created link is offered for copy / share — no dead end.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateShareLinkScreen(
    onBack: () -> Unit,
    onCreated: () -> Unit,
    onNewConversation: () -> Unit = {},
    viewModel: CreateShareLinkViewModel = hiltViewModel(),
    pickerViewModel: ShareLinkPickerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val pickerState by pickerViewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    var showPicker by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                CreateShareLinkEffect.SuccessHaptic -> haptics.success()
            }
        }
    }

    state.createdJoinUrl?.let { joinUrl ->
        CreatedShareLinkSheet(joinUrl = joinUrl, onDone = onCreated)
    }

    if (showPicker) {
        ShareLinkConversationPickerSheet(
            state = pickerState,
            selectedConversationId = state.form.conversationId,
            onQueryChange = pickerViewModel::onQueryChange,
            onSelect = { id ->
                viewModel.onConversationSelected(id)
                showPicker = false
            },
            onRetry = pickerViewModel::retry,
            onNewConversation = {
                showPicker = false
                onNewConversation()
            },
            onDismiss = { showPicker = false },
        )
    }

    val selectedConversation = pickerState.eligibleConversations
        .firstOrNull { it.id == state.form.conversationId }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.share_link_create_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.share_link_create_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                ConversationSection(
                    conversation = selectedConversation,
                    currentUserId = pickerState.currentUserId,
                    hasSeededConversation = state.form.canSubmit,
                    enabled = !state.isSubmitting,
                    onOpenPicker = { showPicker = true },
                )
                IdentitySection(state.form, !state.isSubmitting, viewModel)
                AccessSection(state.form, !state.isSubmitting, viewModel)
                PermissionsSection(state.form, !state.isSubmitting, viewModel)
                LimitsSection(state.form, !state.isSubmitting, viewModel)
                CreateButtonArea(
                    errorMessage = state.errorMessage,
                    isSubmitting = state.isSubmitting,
                    canSubmit = state.canSubmit,
                    onClick = viewModel::submit,
                )
            }
        }
    }
}

@Composable
private fun ConversationSection(
    conversation: ApiConversation?,
    currentUserId: String?,
    hasSeededConversation: Boolean,
    enabled: Boolean,
    onOpenPicker: () -> Unit,
) {
    val chooseLabel = stringResource(R.string.share_link_create_choose_group)
    val hint = stringResource(R.string.share_link_conversation_a11y_hint)
    FormSection(
        title = stringResource(R.string.share_link_section_conversation),
        icon = Icons.Filled.Chat,
        accent = ShareAccent,
    ) {
        val summary = conversation?.let {
            "${it.displayTitle(currentUserId)}, ${stringResource(conversationTypeLabelRes(it.type))}"
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .alpha(if (enabled) 1f else 0.6f)
                .clickable(enabled = enabled, onClickLabel = hint, role = Role.Button, onClick = onOpenPicker)
                .semantics { contentDescription = summary ?: chooseLabel }
                .padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            if (conversation != null) {
                val (icon, color) = conversationTypeBadge(conversation.type)
                IconBadge(icon, color)
                RowTexts(
                    title = conversation.displayTitle(currentUserId),
                    subtitle = stringResource(conversationTypeLabelRes(conversation.type)),
                    subtitleColor = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.weight(1f),
                )
            } else {
                Icon(Icons.Filled.AddCircle, contentDescription = null, tint = ShareAccent)
                Text(
                    text = if (hasSeededConversation) {
                        stringResource(R.string.share_link_section_conversation)
                    } else {
                        chooseLabel
                    },
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.weight(1f),
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

private fun conversationTypeBadge(type: String): Pair<androidx.compose.ui.graphics.vector.ImageVector, Color> =
    when (type.lowercase()) {
        "community" -> Icons.Filled.Group to MeeshyPalette.CommunityAccent
        "channel", "broadcast" -> Icons.Filled.Tag to MeeshyPalette.TrackingAccent
        "public", "global" -> Icons.Filled.Public to MeeshyPalette.Indigo300
        else -> Icons.Filled.Group to ShareAccent
    }

@Composable
private fun IdentitySection(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    FormSection(
        title = stringResource(R.string.share_link_section_identity),
        icon = Icons.Filled.Tag,
        accent = ShareAccent,
    ) {
        FormTextField(
            value = form.name,
            onValueChange = vm::onNameChange,
            label = stringResource(R.string.share_link_field_name),
            placeholder = stringResource(R.string.share_link_field_name_placeholder),
            enabled = enabled,
        )
        FormDivider()
        FormTextField(
            value = form.description,
            onValueChange = vm::onDescriptionChange,
            label = stringResource(R.string.share_link_field_description),
            placeholder = stringResource(R.string.share_link_field_description_placeholder),
            enabled = enabled,
        )
        FormDivider()
        FormTextField(
            value = form.slug,
            onValueChange = vm::onSlugChange,
            label = stringResource(R.string.share_link_field_slug),
            placeholder = stringResource(R.string.share_link_field_slug_placeholder),
            enabled = enabled,
        )
        if (form.slug.isNotBlank()) {
            Text(
                text = "meeshy.me/chat/${form.slug.trim().lowercase()}",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = ShareAccent,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = MeeshySpacing.md).padding(bottom = MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun FormTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    enabled: Boolean,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        singleLine = true,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.sm),
    )
}

@Composable
private fun AccessSection(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    val editable = enabled && form.guestRequirementsEditable
    FormSection(
        title = stringResource(R.string.share_link_section_access),
        subtitle = stringResource(R.string.share_link_section_access_subtitle),
        icon = Icons.Filled.Lock,
        accent = ShareAccent,
    ) {
        RuleToggleRow(
            title = stringResource(R.string.share_link_access_account),
            subtitle = stringResource(R.string.share_link_access_account_subtitle),
            icon = Icons.Filled.Person,
            iconColor = ShareAccent,
            accent = ShareAccent,
            checked = form.requireAccount,
            enabled = enabled,
            onCheckedChange = vm::onRequireAccountChange,
        )
        FormDivider()
        RuleToggleRow(
            title = stringResource(R.string.share_link_access_nickname),
            subtitle = stringResource(R.string.share_link_access_nickname_subtitle),
            icon = Icons.Filled.Person,
            iconColor = MeeshyPalette.TrackingAccent,
            accent = ShareAccent,
            checked = form.effectiveRequireNickname,
            enabled = editable,
            onCheckedChange = vm::onRequireNicknameChange,
        )
        FormDivider()
        RuleToggleRow(
            title = stringResource(R.string.share_link_access_email),
            subtitle = stringResource(R.string.share_link_access_email_subtitle),
            icon = Icons.Filled.Email,
            iconColor = MeeshyPalette.CommunityAccent,
            accent = ShareAccent,
            checked = form.effectiveRequireEmail,
            enabled = editable,
            onCheckedChange = vm::onRequireEmailChange,
        )
        FormDivider()
        RuleToggleRow(
            title = stringResource(R.string.share_link_access_birthday),
            subtitle = stringResource(R.string.share_link_access_birthday_subtitle),
            icon = Icons.Filled.Today,
            iconColor = MeeshyPalette.Warning,
            accent = ShareAccent,
            checked = form.effectiveRequireBirthday,
            enabled = editable,
            onCheckedChange = vm::onRequireBirthdayChange,
        )
    }
}

@Composable
private fun PermissionsSection(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    FormSection(
        title = stringResource(R.string.share_link_section_permissions),
        subtitle = stringResource(R.string.share_link_section_permissions_subtitle),
        icon = Icons.Filled.Speed,
        accent = ShareAccent,
    ) {
        RuleToggleRow(
            title = stringResource(R.string.share_link_permission_messages),
            subtitle = stringResource(R.string.share_link_permission_messages_subtitle),
            icon = Icons.Filled.Chat,
            iconColor = ShareAccent,
            accent = ShareAccent,
            checked = form.allowAnonymousMessages,
            enabled = enabled,
            onCheckedChange = vm::onAllowAnonymousMessagesChange,
        )
        FormDivider()
        RuleToggleRow(
            title = stringResource(R.string.share_link_permission_images),
            subtitle = stringResource(R.string.share_link_permission_images_subtitle),
            icon = Icons.Filled.Image,
            iconColor = MeeshyPalette.Indigo300,
            accent = ShareAccent,
            checked = form.allowAnonymousImages,
            enabled = enabled,
            onCheckedChange = vm::onAllowAnonymousImagesChange,
        )
        FormDivider()
        RuleToggleRow(
            title = stringResource(R.string.share_link_permission_files),
            subtitle = stringResource(R.string.share_link_permission_files_subtitle),
            icon = Icons.Filled.AttachFile,
            iconColor = MeeshyPalette.TrackingAccent,
            accent = ShareAccent,
            checked = form.allowAnonymousFiles,
            enabled = enabled,
            onCheckedChange = vm::onAllowAnonymousFilesChange,
        )
        FormDivider()
        RuleToggleRow(
            title = stringResource(R.string.share_link_permission_history),
            subtitle = stringResource(R.string.share_link_permission_history_subtitle),
            icon = Icons.Filled.History,
            iconColor = MeeshyPalette.CommunityAccent,
            accent = ShareAccent,
            checked = form.allowViewHistory,
            enabled = enabled,
            onCheckedChange = vm::onAllowViewHistoryChange,
        )
    }
}

@Composable
private fun LimitsSection(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    FormSection(
        title = stringResource(R.string.share_link_section_limits),
        subtitle = stringResource(R.string.share_link_section_limits_subtitle),
        icon = Icons.Filled.Speed,
        accent = ShareAccent,
    ) {
        MaxUsesToggleRow(form, enabled, vm)
        AnimatedVisibility(visible = form.maxUsesEnabled) {
            Column {
                FormDivider()
                MaxUsesStepper(form, enabled, vm)
            }
        }
        FormDivider()
        ExpirationRow(form, enabled, vm)
    }
}

@Composable
private fun MaxUsesToggleRow(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    val title = stringResource(R.string.share_link_limit_uses)
    val subtitle = if (form.maxUsesEnabled) {
        pluralStringResource(R.plurals.share_link_max_uses, form.maxUses, form.maxUses)
    } else {
        stringResource(R.string.share_link_unlimited)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .toggleable(
                value = form.maxUsesEnabled,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = vm::onMaxUsesEnabledChange,
            )
            .semantics { contentDescription = "$title. $subtitle" }
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        IconBadge(Icons.Filled.Group, ShareAccent)
        RowTexts(
            title = title,
            subtitle = subtitle,
            subtitleColor = if (form.maxUsesEnabled) ShareAccent else MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = form.maxUsesEnabled,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = ShareAccent),
        )
    }
}

@Composable
private fun MaxUsesStepper(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        IconButton(
            onClick = vm::onMaxUsesDecrement,
            enabled = enabled && form.maxUses > CreateShareLinkForm.MIN_MAX_USES,
            modifier = Modifier.size(48.dp),
        ) { Icon(Icons.Filled.Remove, contentDescription = null) }
        Text(
            text = form.maxUses.toString(),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = ShareAccent,
            modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
        )
        Text(
            text = stringResource(R.string.share_link_uses_label),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(end = MeeshySpacing.sm),
        )
        IconButton(
            onClick = vm::onMaxUsesIncrement,
            enabled = enabled && form.maxUses < CreateShareLinkForm.MAX_MAX_USES,
            modifier = Modifier.size(48.dp),
        ) { Icon(Icons.Filled.Add, contentDescription = null) }
    }
}

@Composable
private fun ExpirationRow(form: CreateShareLinkForm, enabled: Boolean, vm: CreateShareLinkViewModel) {
    Column(modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            IconBadge(Icons.Filled.Schedule, MeeshyPalette.Warning)
            Text(
                text = stringResource(R.string.share_link_field_expiration),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
        Row(
            modifier = Modifier
                .padding(top = MeeshySpacing.sm)
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            EXPIRATION_OPTIONS.forEach { (option, labelRes) ->
                FilterChip(
                    selected = form.expiration == option,
                    onClick = { vm.onExpirationChange(option) },
                    enabled = enabled,
                    label = { Text(stringResource(labelRes)) },
                )
            }
        }
    }
}

@Composable
private fun CreateButtonArea(
    errorMessage: String?,
    isSubmitting: Boolean,
    canSubmit: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier.padding(bottom = MeeshySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        errorMessage?.let { message ->
            Row(
                modifier = Modifier.padding(horizontal = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = MeeshyPalette.Error)
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyPalette.Error,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        GradientCreateButton(isSubmitting = isSubmitting, enabled = canSubmit, onClick = onClick)
    }
}

/** iOS create button: shareAccent→indigo300 gradient, translucent when no conversation, spring 0.3/0.8. */
@Composable
private fun GradientCreateButton(isSubmitting: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val gradientAlpha by animateFloatAsState(
        targetValue = if (enabled || isSubmitting) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.8f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f)),
        label = "createButtonGradient",
    )
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(shape)
            .background(Color.White.copy(alpha = DISABLED_BUTTON_ALPHA))
            .background(
                Brush.horizontalGradient(listOf(ShareAccent, MeeshyPalette.Indigo300)),
                alpha = gradientAlpha,
            )
            .clickable(enabled = enabled && !isSubmitting, role = Role.Button, onClick = onClick)
            .padding(vertical = MeeshySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Color.White,
                )
            } else {
                Icon(Icons.Filled.Link, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            Text(
                text = stringResource(
                    if (isSubmitting) R.string.share_link_creating else R.string.share_link_create_submit,
                ),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}
