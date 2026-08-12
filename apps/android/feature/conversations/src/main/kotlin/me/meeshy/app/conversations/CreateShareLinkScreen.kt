package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val EXPIRATION_OPTIONS = listOf(
    ShareLinkExpiration.Never to R.string.share_link_expiration_never,
    ShareLinkExpiration.Hours24 to R.string.share_link_expiration_24h,
    ShareLinkExpiration.Days7 to R.string.share_link_expiration_7d,
    ShareLinkExpiration.Days30 to R.string.share_link_expiration_30d,
    ShareLinkExpiration.Months3 to R.string.share_link_expiration_3m,
)

/**
 * The share-link creation screen: an admin configures the guest-access rules,
 * anonymous permissions, and usage limits, then creates a link for the current
 * conversation. Reached from a group's chat top bar (moderator+). On success it
 * hands the created link back to the caller — no dead end.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateShareLinkScreen(
    onBack: () -> Unit,
    onCreated: () -> Unit,
    viewModel: CreateShareLinkViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    state.createdJoinUrl?.let { joinUrl ->
        CreatedShareLinkSheet(joinUrl = joinUrl, onDone = onCreated)
    }

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
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                val form = state.form

                SectionLabel(stringResource(R.string.share_link_section_identity))
                OutlinedTextField(
                    value = form.name,
                    onValueChange = viewModel::onNameChange,
                    label = { Text(stringResource(R.string.share_link_field_name)) },
                    singleLine = true,
                    enabled = !state.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.description,
                    onValueChange = viewModel::onDescriptionChange,
                    label = { Text(stringResource(R.string.share_link_field_description)) },
                    enabled = !state.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.slug,
                    onValueChange = viewModel::onSlugChange,
                    label = { Text(stringResource(R.string.share_link_field_slug)) },
                    singleLine = true,
                    enabled = !state.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                )

                SectionLabel(stringResource(R.string.share_link_section_access))
                ToggleRow(
                    label = stringResource(R.string.share_link_access_account),
                    checked = form.requireAccount,
                    enabled = !state.isSubmitting,
                    onCheckedChange = viewModel::onRequireAccountChange,
                )
                ToggleRow(
                    label = stringResource(R.string.share_link_access_nickname),
                    checked = form.requireNickname && !form.requireAccount,
                    enabled = !state.isSubmitting && !form.requireAccount,
                    onCheckedChange = viewModel::onRequireNicknameChange,
                )
                ToggleRow(
                    label = stringResource(R.string.share_link_access_email),
                    checked = form.requireEmail && !form.requireAccount,
                    enabled = !state.isSubmitting && !form.requireAccount,
                    onCheckedChange = viewModel::onRequireEmailChange,
                )
                ToggleRow(
                    label = stringResource(R.string.share_link_access_birthday),
                    checked = form.requireBirthday && !form.requireAccount,
                    enabled = !state.isSubmitting && !form.requireAccount,
                    onCheckedChange = viewModel::onRequireBirthdayChange,
                )

                SectionLabel(stringResource(R.string.share_link_section_permissions))
                ToggleRow(
                    label = stringResource(R.string.share_link_permission_messages),
                    checked = form.allowAnonymousMessages,
                    enabled = !state.isSubmitting,
                    onCheckedChange = viewModel::onAllowAnonymousMessagesChange,
                )
                ToggleRow(
                    label = stringResource(R.string.share_link_permission_images),
                    checked = form.allowAnonymousImages,
                    enabled = !state.isSubmitting,
                    onCheckedChange = viewModel::onAllowAnonymousImagesChange,
                )
                ToggleRow(
                    label = stringResource(R.string.share_link_permission_files),
                    checked = form.allowAnonymousFiles,
                    enabled = !state.isSubmitting,
                    onCheckedChange = viewModel::onAllowAnonymousFilesChange,
                )
                ToggleRow(
                    label = stringResource(R.string.share_link_permission_history),
                    checked = form.allowViewHistory,
                    enabled = !state.isSubmitting,
                    onCheckedChange = viewModel::onAllowViewHistoryChange,
                )

                SectionLabel(stringResource(R.string.share_link_section_limits))
                ToggleRow(
                    label = stringResource(R.string.share_link_limit_uses),
                    checked = form.maxUsesEnabled,
                    enabled = !state.isSubmitting,
                    onCheckedChange = viewModel::onMaxUsesEnabledChange,
                )
                if (form.maxUsesEnabled) {
                    OutlinedTextField(
                        value = form.maxUses.toString(),
                        onValueChange = { raw ->
                            raw.filter { it.isDigit() }.take(5).toIntOrNull()
                                ?.let(viewModel::onMaxUsesChange)
                        },
                        label = { Text(stringResource(R.string.share_link_field_max_uses)) },
                        singleLine = true,
                        enabled = !state.isSubmitting,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Text(
                    text = stringResource(R.string.share_link_field_expiration),
                    style = MaterialTheme.typography.labelLarge,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(top = MeeshySpacing.xs),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    EXPIRATION_OPTIONS.forEach { (option, labelRes) ->
                        FilterChip(
                            selected = form.expiration == option,
                            onClick = { viewModel.onExpirationChange(option) },
                            enabled = !state.isSubmitting,
                            label = { Text(stringResource(labelRes)) },
                        )
                    }
                }

                state.errorMessage?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyPalette.Error,
                        fontWeight = FontWeight.Medium,
                    )
                }

                MeeshyPrimaryButton(
                    text = stringResource(
                        if (state.isSubmitting) R.string.share_link_creating else R.string.share_link_create_submit,
                    ),
                    onClick = viewModel::submit,
                    enabled = state.canSubmit,
                    loading = state.isSubmitting,
                    modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.sm),
                )
            }
        }
    }
}

/**
 * Success sheet surfaced once the link is created: shows the shareable join URL and
 * offers Copy / Share, then Done returns the caller to the previous screen. Replaces
 * the earlier bare pop so the owner never loses the freshly minted link.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreatedShareLinkSheet(joinUrl: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDone,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.share_link_created_title),
                style = MaterialTheme.typography.titleLarge,
                color = MeeshyTheme.tokens.textPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(R.string.share_link_created_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            MeeshyCard {
                Text(
                    text = joinUrl,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyPalette.Indigo400,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                OutlinedButton(
                    onClick = {
                        copyToClipboard(context, joinUrl)
                        Toast.makeText(
                            context,
                            context.getString(R.string.share_link_created_copied),
                            Toast.LENGTH_SHORT,
                        ).show()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        Icons.Filled.ContentCopy,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = stringResource(R.string.share_link_created_copy),
                        modifier = Modifier.padding(start = MeeshySpacing.xs),
                    )
                }
                OutlinedButton(
                    onClick = { shareLink(context, joinUrl) },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        Icons.Filled.Share,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = stringResource(R.string.share_link_created_share),
                        modifier = Modifier.padding(start = MeeshySpacing.xs),
                    )
                }
            }
            MeeshyPrimaryButton(
                text = stringResource(R.string.share_link_created_done),
                onClick = onDone,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("meeshy-share-link", text))
}

private fun shareLink(context: Context, joinUrl: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.share_link_created_share_subject))
        putExtra(Intent.EXTRA_TEXT, joinUrl)
    }
    context.startActivity(Intent.createChooser(send, null))
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MeeshyTheme.tokens.textSecondary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = MeeshySpacing.sm),
    )
}

@Composable
private fun ToggleRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f).padding(end = MeeshySpacing.md),
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}
