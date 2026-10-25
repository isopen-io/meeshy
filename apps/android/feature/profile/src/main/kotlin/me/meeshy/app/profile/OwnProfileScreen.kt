package me.meeshy.app.profile

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.LanguagePickerDialog
import me.meeshy.ui.component.LanguagePickerOption
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.chrome.CollapsibleHeaderActionButton
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.profile.ProfileFullscreenImage
import me.meeshy.ui.profile.ProfileFullscreenImageViewer
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.R as UiR

/** Durée d'affichage de la capsule d'erreur (iOS : 3 s). */
private const val ERROR_CAPSULE_MILLIS = 3_000L

/**
 * MA page de profil (`profile/me`), parité iOS `ProfileView` : elle ne lit que la session. En-tête repliable
 * « Profil » (retour ; Modifier <-> Enregistrer ; indicateur pendant un enregistrement ou un téléversement),
 * puis l'en-tête bannière + avatar et les sections Identité, Contact, Langues, Statistiques, Demandes d'amis
 * et Membre depuis. En édition, le retour (flèche OU retour système) annule l'édition au lieu de fermer la page.
 *
 * Les destinations encore absentes ([onOpenStats], [onOpenProgression], [onOpenDecor], [onMoodTap]) sont
 * nulles par défaut : leur entrée ne s'affiche pas, jamais un contrôle mort.
 */
@Composable
fun OwnProfileScreen(
    onBack: () -> Unit,
    onViewPosts: (userId: String) -> Unit = {},
    onOpenFriendRequests: () -> Unit = {},
    onOpenStats: (() -> Unit)? = null,
    onOpenProgression: (() -> Unit)? = null,
    onOpenDecor: (() -> Unit)? = null,
    onMoodTap: (() -> Unit)? = null,
    viewModel: OwnProfileViewModel = hiltViewModel(),
    uploadViewModel: AvatarBannerUploadViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val uploadState by uploadViewModel.state.collectAsStateWithLifecycle()
    val onEvent = viewModel::onEvent
    var isSharing by rememberSaveable { mutableStateOf(false) }
    var pickingSlot by rememberSaveable { mutableStateOf<OwnProfileLanguageSlot?>(null) }
    var fullscreen by remember { mutableStateOf<ProfileFullscreenImage?>(null) }
    val mediaBaseUrl = LocalMediaBaseUrl.current
    val pickImage = rememberOwnProfileImagePicker(uploadViewModel)
    val capsule = rememberOwnProfileErrorCapsule(
        errorMessage = state.errorMessage,
        uploadErrorMessage = uploadState.error?.let { stringResource(it.messageRes()) },
        onUploadErrorShown = uploadViewModel::dismissError,
    )
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 1) }
    OwnProfileSaveEffects(
        effects = viewModel.effects,
        onSaveFailedMessage = { capsule.value = it },
        toasts = toasts,
    )

    BackHandler(enabled = state.isEditing) { onEvent(OwnProfileUiEvent.CancelEditing) }

    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(R.string.profile_title),
            onBack = { if (state.isEditing) onEvent(OwnProfileUiEvent.CancelEditing) else onBack() },
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
            trailing = {
                OwnProfileTrailing(
                    state = state,
                    isUploading = uploadState.uploading != null,
                    onShare = { isSharing = true },
                    onEvent = onEvent,
                )
            },
        ) {
            OwnProfileBody(
                state = state,
                uploading = uploadState.uploading,
                destinations = OwnProfileDestinations(
                    onOpenStats = onOpenStats,
                    onOpenProgression = onOpenProgression,
                    onOpenDecor = onOpenDecor,
                    onOpenFriendRequests = onOpenFriendRequests,
                    onViewPosts = onViewPosts,
                ),
                onPickBanner = { pickImage(ImageUploadTarget.BANNER) },
                onPickAvatar = { pickImage(ImageUploadTarget.AVATAR) },
                onOpenImage = { image ->
                    fullscreen = resolveServedImageUrl(image.url, mediaBaseUrl)?.let { image.copy(url = it) }
                },
                onMoodTap = onMoodTap,
                onPickLanguage = { pickingSlot = it },
                onEvent = onEvent,
                banner = { ProfileBanner(user = it, modifier = Modifier.fillMaxSize()) },
            )
        }
        OwnProfileErrorCapsule(capsule.value)
        FeedbackToastHost(toasts = toasts)
    }

    pickingSlot?.let { slot -> OwnProfileLanguagePicker(slot, state, onEvent, onDone = { pickingSlot = null }) }
    fullscreen?.let { image -> ProfileFullscreenImageViewer(image = image, onDismiss = { fullscreen = null }) }
    val share = state.user?.let(ProfileShareBuilder::build)
    if (isSharing && share != null) ProfileShareSheet(share = share, onDismiss = { isSharing = false })
}

/** Le sélecteur de photo système, branché sur le téléversement de l'avatar ou de la bannière. */
@Composable
private fun rememberOwnProfileImagePicker(uploadViewModel: AvatarBannerUploadViewModel): (ImageUploadTarget) -> Unit {
    val context = LocalContext.current
    var target by rememberSaveable { mutableStateOf(ImageUploadTarget.AVATAR) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { context.contentResolver.readMediaUploadItem(it) }
            ?.let { uploadViewModel.onImagePicked(target, it) }
    }
    return { picked ->
        target = picked
        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }
}

/**
 * Les effets de l'enregistrement (iOS `HapticFeedback` + `FeedbackToastManager`) : haptique succès au
 * toucher d'Enregistrer, toast « synchronisé au retour en ligne » hors ligne, haptique d'erreur et
 * message générique quand la file abandonne l'édition.
 */
@Composable
private fun OwnProfileSaveEffects(
    effects: Flow<OwnProfileUiEffect>,
    onSaveFailedMessage: (String) -> Unit,
    toasts: MutableSharedFlow<FeedbackToastRequest>,
) {
    val haptics = rememberMeeshyHaptics()
    val saveError by rememberUpdatedState(stringResource(R.string.profile_save_error))
    val onFailed by rememberUpdatedState(onSaveFailedMessage)
    LaunchedEffect(effects) {
        effects.collect { effect ->
            when (effect) {
                OwnProfileUiEffect.SaveSucceeded -> haptics.success()
                OwnProfileUiEffect.SavedOffline ->
                    toasts.tryEmit(FeedbackToastRequest(R.string.profile_own_saved_offline, FeedbackKind.Success))
                is OwnProfileUiEffect.SaveFailed -> {
                    haptics.error()
                    if (effect.showDefaultMessage) onFailed(saveError)
                }
            }
        }
    }
}

/** La capsule d'erreur : le dernier message (enregistrement ou téléversement), effacé après 3 s. */
@Composable
private fun rememberOwnProfileErrorCapsule(
    errorMessage: String?,
    uploadErrorMessage: String?,
    onUploadErrorShown: () -> Unit,
): MutableState<String?> {
    val capsuleState = remember { mutableStateOf<String?>(null) }
    var capsule by capsuleState
    LaunchedEffect(errorMessage) { errorMessage?.let { capsule = it } }
    LaunchedEffect(uploadErrorMessage) {
        uploadErrorMessage?.let {
            capsule = it
            onUploadErrorShown()
        }
    }
    LaunchedEffect(capsule) {
        if (capsule != null) {
            delay(ERROR_CAPSULE_MILLIS)
            capsule = null
        }
    }
    return capsuleState
}

/**
 * Le corps de MA page, sans ViewModel : le squelette d'en-tête SEULEMENT quand aucune identité n'est en
 * mémoire ; sinon l'en-tête et les sections, peints depuis la session même pendant la relecture silencieuse.
 * [banner] peint le fond de la bannière (photo, design, cadre).
 */
@Composable
internal fun OwnProfileBody(
    state: OwnProfileUiState,
    uploading: ImageUploadTarget?,
    destinations: OwnProfileDestinations,
    onPickBanner: () -> Unit,
    onPickAvatar: () -> Unit,
    onOpenImage: (ProfileFullscreenImage) -> Unit,
    onMoodTap: (() -> Unit)?,
    onPickLanguage: (OwnProfileLanguageSlot) -> Unit,
    onEvent: (OwnProfileUiEvent) -> Unit,
    banner: @Composable BoxScope.(MeeshyUser) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl),
    ) {
        val user = state.user
        if (user == null) {
            OwnProfileSkeleton()
        } else {
            val canOpenStats = destinations.onOpenStats != null
            val canOpenProgression = destinations.onOpenProgression != null
            val canOpenDecor = destinations.onOpenDecor != null
            val presentation = remember(
                user, state.isEditing, state.systemLanguage, state.regionalLanguage, state.customDestinationLanguage,
                state.stats, state.pendingFriendRequests, canOpenStats, canOpenProgression, canOpenDecor,
            ) {
                OwnProfileSectionsPresenter.present(
                    OwnProfileSectionsInput(
                        user = user,
                        systemLanguage = state.systemLanguage,
                        regionalLanguage = state.regionalLanguage,
                        customDestinationLanguage = state.customDestinationLanguage,
                        isEditing = state.isEditing,
                        stats = state.stats,
                        pendingFriendRequests = state.pendingFriendRequests,
                        canOpenStats = canOpenStats,
                        canOpenProgression = canOpenProgression,
                        canOpenDecor = canOpenDecor,
                    ),
                )
            }
            OwnProfileHeader(
                user = user,
                isEditing = state.isEditing,
                moodEmoji = state.moodEmoji,
                uploading = uploading,
                onPickBanner = onPickBanner,
                onPickAvatar = onPickAvatar,
                onOpenImage = onOpenImage,
                onMoodTap = onMoodTap,
                banner = { banner(this, user) },
            )
            OwnProfileSectionsColumn(
                presentation = presentation,
                state = state,
                destinations = destinations,
                onPickLanguage = onPickLanguage,
                onEvent = onEvent,
            )
        }
        Spacer(Modifier.height(MeeshySpacing.xxxl + MeeshySpacing.sm))
    }
}

/** La droite de l'en-tête : partage + « Modifier » en lecture, « Enregistrer » en édition, un indicateur pendant l'envoi. */
@Composable
private fun OwnProfileTrailing(
    state: OwnProfileUiState,
    isUploading: Boolean,
    onShare: () -> Unit,
    onEvent: (OwnProfileUiEvent) -> Unit,
) {
    if (state.isSaving || isUploading) {
        CircularProgressIndicator(
            color = MeeshyPalette.Indigo500,
            strokeWidth = 2.dp,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md).size(20.dp),
        )
        return
    }
    if (!state.isEditing && state.user?.let(ProfileShareBuilder::build) != null) {
        CollapsibleHeaderActionButton(
            icon = MeeshyIcons.Share,
            contentDescription = stringResource(R.string.profile_share_action),
            onClick = onShare,
        )
    }
    TextButton(onClick = { onEvent(if (state.isEditing) OwnProfileUiEvent.Save else OwnProfileUiEvent.StartEditing) }) {
        Text(
            text = stringResource(if (state.isEditing) R.string.profile_save else R.string.profile_edit),
            color = MeeshyPalette.Indigo500,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** Le sélecteur d'une langue de contenu (iOS `ProfileLanguagePickerSheet`) : « Aucune » pour un rang secondaire. */
@Composable
private fun OwnProfileLanguagePicker(
    slot: OwnProfileLanguageSlot,
    state: OwnProfileUiState,
    onEvent: (OwnProfileUiEvent) -> Unit,
    onDone: () -> Unit,
) {
    val current = when (slot) {
        OwnProfileLanguageSlot.PRIMARY -> state.systemLanguage
        OwnProfileLanguageSlot.REGIONAL -> state.regionalLanguage
        OwnProfileLanguageSlot.CUSTOM -> state.customDestinationLanguage
    }
    val none = stringResource(R.string.profile_language_none)
    val options = remember(slot, current, none) {
        val clear = if (slot == OwnProfileLanguageSlot.PRIMARY) {
            emptyList()
        } else {
            listOf(LanguagePickerOption(code = null, label = none, isSelected = current.isBlank()))
        }
        clear + LanguageData.allLanguagesCommonFirst.map { language ->
            LanguagePickerOption(
                code = language.code,
                label = "${language.flag}  ${language.nativeName}",
                isSelected = language.code.equals(current, ignoreCase = true),
            )
        }
    }
    LanguagePickerDialog(
        titleText = stringResource(languageSlotTitle(slot)),
        options = options,
        onSelect = { code ->
            onEvent(slot.changedEvent(code.orEmpty()))
            onDone()
        },
        onDismiss = onDone,
        dismissButtonLabel = stringResource(UiR.string.common_cancel),
    )
}

private fun OwnProfileLanguageSlot.changedEvent(code: String): OwnProfileUiEvent = when (this) {
    OwnProfileLanguageSlot.PRIMARY -> OwnProfileUiEvent.SystemLanguageChanged(code)
    OwnProfileLanguageSlot.REGIONAL -> OwnProfileUiEvent.RegionalLanguageChanged(code)
    OwnProfileLanguageSlot.CUSTOM -> OwnProfileUiEvent.CustomDestinationLanguageChanged(code)
}

/** La capsule rouge en bas de page pendant 3 s (iOS : `Capsule().fill(MeeshyColors.error.opacity(0.9))`). */
@Composable
private fun BoxScope.OwnProfileErrorCapsule(message: String?) {
    AnimatedVisibility(
        visible = message != null,
        enter = slideInVertically { it } + fadeIn(),
        exit = slideOutVertically { it } + fadeOut(),
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(bottom = MeeshySpacing.xxl, start = MeeshySpacing.lg, end = MeeshySpacing.lg),
    ) {
        Text(
            text = message.orEmpty(),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.White,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(MeeshyPalette.Error.copy(alpha = 0.9f))
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus),
        )
    }
}
