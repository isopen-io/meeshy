package me.meeshy.app.conversations

import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.avatar.AvatarAccessibilityLabel
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.conversationlist.AvatarMenuRole
import me.meeshy.sdk.model.conversationlist.ConversationAvatarA11yAction
import me.meeshy.sdk.model.conversationlist.ConversationAvatarLabelKind
import me.meeshy.sdk.model.conversationlist.ConversationAvatarSpeech
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.avatar.AvatarContextMenuItem
import me.meeshy.ui.component.avatar.AvatarGestures
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.ui.R as UiR

internal const val ROW_AVATAR_TEST_TAG = "conversation-row-avatar"
internal const val ROW_AVATAR_BAND_TEST_TAG = "conversation-row-avatar-band"

/** La cible tactile Android (Material, TalkBack) : la bande d'avatar n'est jamais plus petite. */
internal val ROW_AVATAR_MIN_TARGET = 48.dp

/**
 * L'avatar de 44 dp (contexte `ConversationHeaderCollapsed`) entouré de l'anneau d'accent de la
 * conversation (1,5 dp à 55 %). La présence du pair ([peerUserId], `null` pour un groupe) se lit ICI, à la
 * cellule, sur le tick partagé de 15 s (`rememberPresence`): seul cet avatar se recompose quand le point change
 * de couleur, jamais la liste. La frappe la force au vert ([isTyping]), un pair hors ligne n'a aucun point
 * (la règle vit dans l'atome). Le point d'une rangée directe se touche: « vu il y a X » deux secondes.
 *
 * Avec [gestures] (#15989, miroir de `LentilleRowAvatar`), l'avatar a SES gestes : le toucher ouvre le profil
 * ou les détails, l'anneau non lu la story, le badge la bulle d'humeur, l'appui long le menu de l'avatar.
 * La bande d'au moins 48 dp qui le porte prend toucher et appui long : ni l'un ni l'autre n'atteint la ligne.
 * Pour TalkBack, l'avatar est un bouton à part, « Voir le profil de X » ou « Détails de Y », dont le menu et
 * la story sont des actions.
 */
@Composable
internal fun ConversationRowAvatar(
    name: String,
    accent: Color,
    secondary: Color,
    peerUserId: String?,
    isTyping: Boolean,
    storyRing: StoryRingState,
    moodEmoji: String?,
    here: ConversationHere,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    gestures: ConversationRowAvatarGestures? = null,
) {
    val presence = ConversationRowPrecedence.presence(rememberPresence(peerUserId), isTyping)
    val lastSeen = rememberLastSeenTip(peerUserId)
    val ring = LentilleMetrics.Avatar.ringWidth
    val touchable = peerUserId != null && ConversationRowLastSeen.dotIsTouchable(presence, here, moodEmoji)
    val band = if (gestures == null) {
        modifier
    } else {
        modifier
            .sizeIn(minWidth = ROW_AVATAR_MIN_TARGET, minHeight = ROW_AVATAR_MIN_TARGET)
            .testTag(ROW_AVATAR_BAND_TEST_TAG)
            .pointerInput(gestures.onTap) { detectTapGestures(onTap = { gestures.onTap() }) }
    }
    Box(modifier = band, contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(LentilleMetrics.Avatar.size + ring * 2)
                .border(ring, accent.copy(alpha = LentilleMetrics.Avatar.ringOpacity), CircleShape)
                .then(if (touchable) Modifier.lastSeenAccessibilityAction(lastSeen) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            MeeshyAvatar(
                name = name,
                context = AvatarContext.ConversationHeaderCollapsed,
                containerColor = accent,
                secondaryColor = secondary,
                storyRing = storyRing,
                presence = presence,
                moodEmoji = moodEmoji,
                here = here,
                enablePulse = false,
                onMoodTap = gestures?.onMoodTap,
                onDotTap = if (touchable) lastSeen::show else null,
                imageUrl = imageUrl,
                gestures = gestures?.let { rememberAvatarGestures(it, storyRing) },
                modifier = gestures?.let { avatarSpeech(it, name, moodEmoji, here, storyRing) } ?: Modifier,
            )
            LastSeenTooltip(lastSeen.tip)
        }
    }
}

/** Ce que l'avatar d'une ligne sait faire, résolu par l'hôte de la ligne (#15989). */
internal data class ConversationRowAvatarGestures(
    val labelKind: ConversationAvatarLabelKind,
    val roles: List<AvatarMenuRole>,
    val onTap: () -> Unit,
    val onRole: (AvatarMenuRole) -> Unit,
    val onViewStory: (() -> Unit)? = null,
    val onMoodTap: (() -> Unit)? = null,
)

@Composable
private fun rememberAvatarGestures(gestures: ConversationRowAvatarGestures, storyRing: StoryRingState): AvatarGestures {
    val items = gestures.roles.map { role -> AvatarContextMenuItem(stringResource(role.labelRes()), { gestures.onRole(role) }) }
    return AvatarGestures(
        onTap = gestures.onTap,
        onViewStory = gestures.onViewStory.takeIf { storyRing != StoryRingState.None },
        menuItems = items,
    )
}

@Composable
private fun avatarSpeech(
    gestures: ConversationRowAvatarGestures,
    name: String,
    moodEmoji: String?,
    here: ConversationHere,
    storyRing: StoryRingState,
): Modifier {
    val resources = LocalContext.current.resources
    val spoken = AvatarAccessibilityLabel.spokenName(
        name = name,
        moodEmoji = moodEmoji,
        isHere = here.isHere,
        moodLabel = { resources.getString(UiR.string.avatar_a11y_mood, it) },
        hereLabel = stringResource(UiR.string.presence_here),
        fallbackName = stringResource(UiR.string.avatar_fallback),
    )
    val label = when (gestures.labelKind) {
        ConversationAvatarLabelKind.PROFILE -> stringResource(R.string.conversation_row_avatar_a11y_profile, spoken)
        ConversationAvatarLabelKind.DETAILS -> stringResource(R.string.conversation_row_avatar_a11y_details, spoken)
    }
    val story = gestures.onViewStory.takeIf { storyRing != StoryRingState.None }
    val storyLabel = stringResource(UiR.string.avatar_menu_view_story)
    val actions = ConversationAvatarSpeech.actions(gestures.roles, hasStory = story != null).map { action ->
        when (action) {
            is ConversationAvatarA11yAction.Menu ->
                CustomAccessibilityAction(stringResource(action.role.labelRes())) { gestures.onRole(action.role); true }
            ConversationAvatarA11yAction.ViewStory -> CustomAccessibilityAction(storyLabel) { story?.invoke(); true }
        }
    }
    return Modifier
        .testTag(ROW_AVATAR_TEST_TAG)
        .semantics {
            contentDescription = label
            customActions = actions
        }
}

private fun AvatarMenuRole.labelRes(): Int = when (this) {
    AvatarMenuRole.CONVERSATION_INFO -> R.string.row_menu_info
    AvatarMenuRole.PROFILE -> R.string.row_menu_view_profile
    AvatarMenuRole.SHARE_LINK -> R.string.conversations_create_share_link
}
