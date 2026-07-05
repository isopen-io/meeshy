package me.meeshy.app.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
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
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.DateFormat
import java.util.Date

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
            val header = state.user?.let { ProfileHeaderBuilder.build(it, System.currentTimeMillis()) }

            // Avatar — completion ring + presence dot when viewing (not editing).
            Box(contentAlignment = Alignment.Center) {
                val user = state.user
                val avatarDescription = stringResource(R.string.profile_avatar)
                if (!state.isEditing) {
                    header?.completionPercent?.let { percent ->
                        ProfileCompletionRing(
                            percent = percent,
                            color = MaterialTheme.colorScheme.primary,
                            track = MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.size(108.dp),
                        )
                    }
                }
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
                if (!state.isEditing) {
                    presenceDotColor(header?.presence)?.let { dot ->
                        Surface(
                            color = dot,
                            shape = CircleShape,
                            border = BorderStroke(2.dp, MeeshyTheme.tokens.backgroundPrimary),
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(20.dp),
                        ) {}
                    }
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
                Text(
                    text = header?.displayName ?: stringResource(R.string.profile_unknown),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                header?.handle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                header?.bio?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(text = it, style = MaterialTheme.typography.bodyMedium)
                }
                if (header?.hasE2EE == true) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.profile_e2ee),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                header?.completionPercent?.let { percent ->
                    Text(
                        text = stringResource(R.string.profile_completion, percent),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                header?.memberSinceEpochMillis?.let { millis ->
                    Text(
                        text = stringResource(R.string.profile_member_since, formatMemberSince(millis)),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Presence dot colours (semantic, static per the design system): green online, amber away. */
private val OnlineIndicator = Color(0xFF34D399)
private val AwayIndicator = Color(0xFFFBBF24)

/** The dot colour for a resolved presence, or null when no dot should show (offline/unknown). */
private fun presenceDotColor(state: PresenceState?): Color? = when (state) {
    PresenceState.ONLINE -> OnlineIndicator
    PresenceState.AWAY -> AwayIndicator
    PresenceState.OFFLINE, null -> null
}

/** Localized medium-date label for the "member since" line. */
private fun formatMemberSince(epochMillis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))

/** A circular progress ring around the avatar showing the profile-completion percentage. */
@Composable
private fun ProfileCompletionRing(
    percent: Int,
    color: Color,
    track: Color,
    modifier: Modifier = Modifier,
) {
    val sweep = 360f * (percent.coerceIn(0, 100) / 100f)
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
        val inset = stroke.width / 2f
        val arcSize = androidx.compose.ui.geometry.Size(size.width - stroke.width, size.height - stroke.width)
        val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
        drawArc(
            color = track,
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = stroke,
        )
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = sweep,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = stroke,
        )
    }
}
