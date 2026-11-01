package me.meeshy.app.feed

import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.foundation.layout.PaddingValues
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.ui.component.message.MeeshyCommentComposer
import me.meeshy.ui.component.message.MeeshyMentionSuggestions
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * La page plein écran d'une humeur reçue (iOS `MoodSpotlightView`, #10814), ouverte par la
 * notification « nouvelle humeur » : la bannière de l'auteur en fond total, son avatar au centre,
 * le texte de l'humeur sur du verre, la pluie de l'emoji et un champ qui répond en privé.
 */
@Composable
fun MoodSpotlightScreen(
    onClose: () -> Unit,
    viewModel: MoodSpotlightViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val mention by viewModel.mention.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val snackbar = remember { SnackbarHostState() }
    val sentMessage = stringResource(R.string.mood_spotlight_reply_sent)
    val failedMessage = stringResource(R.string.mood_spotlight_reply_failed)

    LaunchedEffect(state.replyState) {
        when (state.replyState) {
            MoodReplyState.SENT -> {
                haptics.success()
                snackbar.showSnackbar(sentMessage)
                viewModel.consumeReplyOutcome()
            }
            MoodReplyState.FAILED -> {
                haptics.error()
                snackbar.showSnackbar(failedMessage)
                viewModel.consumeReplyOutcome()
            }
            MoodReplyState.IDLE, MoodReplyState.SENDING -> Unit
        }
    }

    val entry = state.entry
    val fallback = hexColor(entry?.avatarColor?.takeIf { it.isNotBlank() } ?: "6366F1")
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(fallback, MeeshyPalette.Indigo950)))) {
        state.author?.banner?.takeIf { it.isNotBlank() }?.let { banner ->
            AsyncImage(model = banner, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.5f), Color.Black.copy(alpha = 0.35f), Color.Black.copy(alpha = 0.7f))),
            ),
        )
        entry?.let { MoodEmojiRainLayer(emoji = it.moodEmoji, modifier = Modifier.fillMaxSize()) }

        AnimatedContent(
            targetState = state.content,
            transitionSpec = { (fadeIn() + scaleIn(initialScale = 0.92f)) togetherWith fadeOut() },
            contentAlignment = Alignment.Center,
            modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
            label = "moodContent",
        ) { content ->
            when (content) {
                MoodSpotlightContent.Loading -> LoadingAvatar()
                is MoodSpotlightContent.Mood -> MoodCard(content.entry, state.author?.avatar)
                MoodSpotlightContent.Unavailable -> Unavailable()
            }
        }

        IconButton(
            onClick = { haptics.light(); onClose() },
            modifier = Modifier.statusBarsPadding().padding(MeeshySpacing.lg).size(44.dp)
                .clip(CircleShape).background(Color.White.copy(alpha = 0.18f)),
        ) {
            Icon(MeeshyIcons.Close, stringResource(R.string.mood_spotlight_close), tint = Color.White)
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding()) {
            SnackbarHost(snackbar)
            if (state.canReply) {
                ReplyBar(
                    text = state.replyText,
                    authorName = entry?.username.orEmpty(),
                    isSending = state.replyState == MoodReplyState.SENDING,
                    canSend = state.canSend,
                    mention = mention,
                    onChange = viewModel::onReplyChange,
                    onMentionSelected = viewModel::onMentionSelected,
                    onSend = { haptics.medium(); viewModel.sendReply() },
                )
            }
        }
    }
}

@Composable
private fun LoadingAvatar() {
    val label = stringResource(R.string.mood_spotlight_loading)
    Box(
        Modifier.size(112.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f))
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp)) }
}

@Composable
private fun Unavailable() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("🌙", style = MaterialTheme.typography.displayMedium)
        Text(
            stringResource(R.string.mood_spotlight_unavailable),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun MoodCard(entry: StatusEntry, avatarUrl: String?) {
    val accent = hexColor(entry.avatarColor.ifBlank { "6366F1" })
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Box {
            MeeshyAvatar(
                name = entry.username,
                size = 112.dp,
                containerColor = accent,
                imageUrl = avatarUrl,
                modifier = Modifier.shadow(24.dp, CircleShape, ambientColor = accent, spotColor = accent)
                    .border(3.dp, Color.White.copy(alpha = 0.9f), CircleShape),
            )
            Text(
                entry.moodEmoji,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.align(Alignment.BottomEnd).padding(start = 8.dp, top = 8.dp)
                    .clip(CircleShape).background(Color.White.copy(alpha = 0.22f)).padding(6.dp),
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(entry.username, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
            entry.createdAt?.let {
                Text(detailRelativeTime(it), style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.75f))
            }
        }
        entry.content?.trim()?.takeIf { it.isNotEmpty() }?.let { text ->
            Text(
                text,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier.shadow(12.dp, RoundedCornerShape(26.dp))
                    .clip(RoundedCornerShape(26.dp))
                    .background(Color.White.copy(alpha = 0.16f))
                    .border(1.5.dp, Brush.linearGradient(listOf(accent, Color.White.copy(alpha = 0.5f))), RoundedCornerShape(26.dp))
                    .padding(horizontal = 22.dp, vertical = 16.dp),
            )
        }
    }
}

/**
 * La réponse privée à l'humeur, par la barre de commentaire du composer (#13988) — capsule de verre,
 * emoji, envoi en dégradé —, toujours en sombre au-dessus de la bannière (iOS force `.dark` ici).
 */
@Composable
private fun ReplyBar(
    text: String,
    authorName: String,
    isSending: Boolean,
    canSend: Boolean,
    mention: MentionAutocompleteState,
    onChange: (String) -> Unit,
    onMentionSelected: (MentionCandidate) -> Unit,
    onSend: () -> Unit,
) {
    MeeshyTheme(darkTheme = true) {
        MeeshyCommentComposer(
            text = text,
            onTextChange = onChange,
            placeholder = stringResource(R.string.mood_spotlight_reply_placeholder, authorName),
            onSend = onSend,
            isSending = isSending,
            sendEnabled = canSend,
            sendLabel = stringResource(R.string.mood_spotlight_reply_send),
            accentColor = MeeshyPalette.Indigo500,
            secondaryColor = Color(0xFF8B5CF6),
            contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = 10.dp),
            topSlot = { MeeshyMentionSuggestions(mention = mention, onSelect = onMentionSelected) },
        )
    }
}
