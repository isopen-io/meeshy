package me.meeshy.app.profile

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * MA page de profil (`profile/me`), parite iOS `ProfileView` : elle ne lit que la session.
 * En lecture, la barre haute porte le partage et le crayon d'edition — jamais Signaler,
 * jamais les actions de mise en relation. En edition, le bouton de droite devient
 * « Enregistrer » et le retour (fleche OU retour systeme) annule l'edition au lieu de
 * fermer la page, comme le `onBack` du `CollapsibleHeader` iOS.
 */
@Composable
fun OwnProfileScreen(
    onBack: () -> Unit,
    onViewPosts: (userId: String) -> Unit = {},
    viewModel: OwnProfileViewModel = hiltViewModel(),
    uploadViewModel: AvatarBannerUploadViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val uploadState by uploadViewModel.state.collectAsStateWithLifecycle()
    val onEvent = viewModel::onEvent
    val snackbar = remember { SnackbarHostState() }
    var isSharing by rememberSaveable { mutableStateOf(false) }

    val context = LocalContext.current
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { context.contentResolver.readMediaUploadItem(it) }
            ?.let { uploadViewModel.onImagePicked(ImageUploadTarget.AVATAR, it) }
    }
    val bannerPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { context.contentResolver.readMediaUploadItem(it) }
            ?.let { uploadViewModel.onImagePicked(ImageUploadTarget.BANNER, it) }
    }
    val imageOnly = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)

    BackHandler(enabled = state.isEditing) { onEvent(OwnProfileUiEvent.CancelEditing) }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }
    val uploadErrorMessage = uploadState.error?.let { stringResource(it.messageRes()) }
    LaunchedEffect(uploadErrorMessage) {
        uploadErrorMessage?.let {
            snackbar.showSnackbar(it)
            uploadViewModel.dismissError()
        }
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                ProfileTopBar(
                    onBack = { if (state.isEditing) onEvent(OwnProfileUiEvent.CancelEditing) else onBack() },
                ) {
                    OwnProfileTopBarActions(
                        state = state,
                        isUploading = uploadState.uploading != null,
                        onShare = { isSharing = true },
                        onEvent = onEvent,
                    )
                }
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(MeeshySpacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                val user = state.user
                if (user == null) {
                    OwnProfileColdSkeleton()
                } else {
                    val header = remember(user) { ProfileHeaderBuilder.build(user, System.currentTimeMillis()) }
                    if (!state.isEditing) ProfileBanner(user = user)
                    ProfileAvatar(
                        user = user,
                        header = header,
                        isEditing = state.isEditing,
                        isUploading = uploadState.uploading == ImageUploadTarget.AVATAR,
                        pickEnabled = uploadState.uploading == null,
                        onPick = { avatarPicker.launch(imageOnly) },
                    )
                    if (state.isEditing) {
                        OwnProfileEditor(
                            state = state,
                            isUploadingBanner = uploadState.uploading == ImageUploadTarget.BANNER,
                            canPickBanner = uploadState.uploading == null,
                            onPickBanner = { bannerPicker.launch(imageOnly) },
                            onEvent = onEvent,
                        )
                    } else {
                        ProfileReadOnlyBody(
                            userId = user.id,
                            header = header,
                            stats = state.stats,
                            timeline = state.timeline,
                            onViewPosts = onViewPosts,
                        )
                    }
                }
            }
        }
    }

    if (isSharing) {
        state.user?.let(ProfileShareBuilder::build)?.let { share ->
            ProfileShareSheet(share = share, onDismiss = { isSharing = false })
        }
    }
}

/**
 * La droite de la barre : en lecture, partage + crayon ; en edition, « Enregistrer » ;
 * un indicateur pendant un enregistrement ou un televersement (parite iOS `trailing`).
 */
@Composable
private fun OwnProfileTopBarActions(
    state: OwnProfileUiState,
    isUploading: Boolean,
    onShare: () -> Unit,
    onEvent: (OwnProfileUiEvent) -> Unit,
) {
    when {
        state.isSaving || isUploading ->
            CircularProgressIndicator(
                color = MeeshyPalette.Indigo500,
                modifier = Modifier.padding(horizontal = MeeshySpacing.md).size(20.dp),
            )
        state.isEditing ->
            TextButton(onClick = { onEvent(OwnProfileUiEvent.Save) }) {
                Text(
                    text = stringResource(R.string.profile_save),
                    color = MeeshyPalette.Indigo500,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        else -> {
            if (state.user?.let(ProfileShareBuilder::build) != null) {
                IconButton(onClick = onShare) {
                    Icon(MeeshyIcons.Share, contentDescription = stringResource(R.string.profile_share_action))
                }
            }
            IconButton(onClick = { onEvent(OwnProfileUiEvent.StartEditing) }) {
                Icon(MeeshyIcons.EditFilled, contentDescription = stringResource(R.string.profile_edit))
            }
        }
    }
}

/** Le formulaire d'edition : banniere, noms, bio et les trois langues de contenu. */
@Composable
private fun OwnProfileEditor(
    state: OwnProfileUiState,
    isUploadingBanner: Boolean,
    canPickBanner: Boolean,
    onPickBanner: () -> Unit,
    onEvent: (OwnProfileUiEvent) -> Unit,
) {
    TextButton(onClick = onPickBanner, enabled = canPickBanner, modifier = Modifier.fillMaxWidth()) {
        if (isUploadingBanner) {
            CircularProgressIndicator(Modifier.size(18.dp))
            Spacer(Modifier.width(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.profile_change_banner))
    }
    OwnProfileTextField(
        value = state.firstName,
        label = stringResource(R.string.profile_first_name_label),
        onValueChange = { onEvent(OwnProfileUiEvent.FirstNameChanged(it)) },
    )
    OwnProfileTextField(
        value = state.lastName,
        label = stringResource(R.string.profile_last_name_label),
        onValueChange = { onEvent(OwnProfileUiEvent.LastNameChanged(it)) },
    )
    OwnProfileTextField(
        value = state.displayName,
        label = stringResource(R.string.profile_display_name_label),
        onValueChange = { onEvent(OwnProfileUiEvent.DisplayNameChanged(it)) },
    )
    OutlinedTextField(
        value = state.bio,
        onValueChange = { onEvent(OwnProfileUiEvent.BioChanged(it)) },
        label = { Text(stringResource(R.string.profile_bio_label)) },
        minLines = 3,
        maxLines = 5,
        modifier = Modifier.fillMaxWidth(),
    )
    ContentLanguageField(
        label = stringResource(R.string.profile_system_language_label),
        selectedCode = state.systemLanguage,
        onSelect = { onEvent(OwnProfileUiEvent.SystemLanguageChanged(it)) },
    )
    ContentLanguageField(
        label = stringResource(R.string.profile_regional_language_label),
        selectedCode = state.regionalLanguage,
        onSelect = { onEvent(OwnProfileUiEvent.RegionalLanguageChanged(it)) },
    )
    ContentLanguageField(
        label = stringResource(R.string.profile_custom_language_label),
        selectedCode = state.customDestinationLanguage,
        onSelect = { onEvent(OwnProfileUiEvent.CustomDestinationLanguageChanged(it)) },
    )
}

@Composable
private fun OwnProfileTextField(value: String, label: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Session encore vide (premier lancement) : un squelette, jamais un spinner ni des « ? » de repli. */
@Composable
private fun OwnProfileColdSkeleton() {
    MeeshySkeletonBox(modifier = Modifier.fillMaxWidth().height(120.dp))
    MeeshySkeletonBox(modifier = Modifier.size(96.dp), shape = CircleShape)
    MeeshySkeletonBox(modifier = Modifier.width(160.dp).height(20.dp))
    MeeshySkeletonBox(modifier = Modifier.width(110.dp).height(14.dp))
}
