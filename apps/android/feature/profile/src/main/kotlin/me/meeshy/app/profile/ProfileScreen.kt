package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.isEditing) stringResource(R.string.profile_edit_title) else stringResource(R.string.profile_title)) },
                navigationIcon = {
                    IconButton(onClick = if (state.isEditing) viewModel::cancelEditing else onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.profile_back))
                    }
                },
                actions = {
                    if (!state.isEditing) {
                        IconButton(onClick = viewModel::startEditing) {
                            Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.profile_edit))
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) { padding ->
        if (state.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            // Avatar
            Box(contentAlignment = Alignment.Center) {
                val user = state.user
                val avatarDescription = stringResource(R.string.profile_avatar)
                if (user?.avatar != null) {
                    AsyncImage(
                        model = user.avatar,
                        contentDescription = user.displayName ?: avatarDescription,
                        modifier = Modifier
                            .size(96.dp)
                            .clip(CircleShape),
                    )
                } else {
                    MeeshyAvatar(
                        name = user?.displayName ?: user?.username ?: "?",
                        modifier = Modifier.size(96.dp),
                    )
                }
            }

            if (state.isEditing) {
                OutlinedTextField(
                    value = state.displayName,
                    onValueChange = viewModel::onDisplayNameChange,
                    label = { Text(stringResource(R.string.profile_display_name_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.bio,
                    onValueChange = viewModel::onBioChange,
                    label = { Text(stringResource(R.string.profile_bio_label)) },
                    minLines = 3,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    TextButton(onClick = viewModel::cancelEditing, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.profile_cancel))
                    }
                    Button(
                        onClick = viewModel::saveProfile,
                        enabled = !state.isSaving,
                        modifier = Modifier.weight(1f),
                    ) {
                        if (state.isSaving) CircularProgressIndicator(Modifier.size(20.dp))
                        else Text(stringResource(R.string.profile_save))
                    }
                }
            } else {
                val user = state.user
                Text(
                    text = user?.displayName ?: user?.username ?: stringResource(R.string.profile_unknown),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                if (!user?.username.isNullOrEmpty()) {
                    Text(
                        text = "@${user?.username}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!user?.bio.isNullOrEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(text = user?.bio ?: "", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
