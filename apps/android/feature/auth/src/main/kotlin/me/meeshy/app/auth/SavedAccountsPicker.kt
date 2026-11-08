package me.meeshy.app.auth

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** The remembered-account list — iOS `LoginView.savedAccountsList`. */
@Composable
internal fun SavedAccountsPicker(
    accounts: List<SavedAccount>,
    errorText: String?,
    onAccountTap: (SavedAccount) -> Unit,
    onAccountRemove: (String) -> Unit,
    onOtherAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        accounts.forEach { account ->
            SavedAccountRow(
                account = account,
                onTap = { onAccountTap(account) },
                onRemove = { onAccountRemove(account.id) },
                modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
            )
        }

        AuthErrorMessage(text = errorText, modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md))

        TextButton(onClick = onOtherAccount, modifier = Modifier.padding(top = MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.login_other_account),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/**
 * One row of [SavedAccountsPicker] — tap selects the account. Removal hides behind a long
 * press (iOS `LoginView` `.contextMenu`), so a stray touch can no longer erase an account.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun SavedAccountRow(
    account: SavedAccount,
    onTap: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val removeLabel = stringResource(R.string.login_remove_account)
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Box {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .combinedClickable(
                        onClick = onTap,
                        onLongClick = { menuOpen = true },
                        onLongClickLabel = removeLabel,
                    )
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            ) {
                MeeshyAvatar(name = account.shortName, size = 44.dp, imageUrl = account.avatarUrl)

                Column(modifier = Modifier.padding(start = MeeshySpacing.md).weight(1f)) {
                    Text(
                        text = account.shortName,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                    Text(
                        text = "@${account.username}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                    )
                }

                Icon(
                    imageVector = MeeshyIcons.ChevronForward,
                    contentDescription = null,
                    tint = MeeshyTheme.tokens.textMuted,
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(removeLabel, color = MeeshyTheme.tokens.error) },
                    leadingIcon = { Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyTheme.tokens.error) },
                    onClick = {
                        menuOpen = false
                        onRemove()
                    },
                )
            }
        }
    }
}

