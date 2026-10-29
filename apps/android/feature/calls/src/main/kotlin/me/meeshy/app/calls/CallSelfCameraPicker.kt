package me.meeshy.app.calls

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.camera.CameraDeviceOption
import me.meeshy.sdk.model.call.camera.CameraFacing
import me.meeshy.sdk.model.call.camera.CameraPickerLaw
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/** Les caméras que le choix propose, lues à la caméra ouverte. Une couture, pour que le bouton se teste sans moteur. */
fun interface CallCameraChoices {
    fun current(): List<CameraDeviceOption>
}

/**
 * « Choisir la caméra » (iOS `CameraPicker`) : ouvert par la pilule ou par la rangée de ma caméra, il se
 * referme à la fin de l'appel. Le choix lui-même passe par l'écran (`CallViewModel.selectCamera`), qui tient
 * le miroir de mon aperçu.
 */
@Singleton
class CallCameraPickerController @Inject constructor() : CallFeatureController {
    private val _isOpen = MutableStateFlow(false)
    val isOpen: StateFlow<Boolean> = _isOpen.asStateFlow()

    fun open() {
        _isOpen.value = true
    }

    fun close() {
        _isOpen.value = false
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        if (next is CallState.Ended || next == CallState.Idle) close()
    }

    override fun onCleared() = close()
}

/**
 * Offert caméra allumée, et seulement quand une caméra est BRANCHÉE (iOS : plus d'une caméra dont une externe) :
 * il remplace alors la bascule avant / arrière, à la même place.
 */
@Singleton
class CallCameraPickerActionHandler internal constructor(
    private val choices: CallCameraChoices,
    private val picker: CallCameraPickerController,
) : CallActionHandler {
    @Inject
    constructor(engine: WebRtcEngine, picker: CallCameraPickerController) :
        this(CallCameraChoices { engine.cameraZoom.state.value.cameras }, picker)

    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.isVideoCall && state.isCameraOn && CameraPickerLaw.hasSelectableCameras(choices.current())) {
            CallActionPresentation(MeeshyIcons.Camera, R.string.call_control_camera)
        } else {
            null
        }

    override fun perform() = picker.open()
}

@Module
@InstallIn(SingletonComponent::class)
interface CallCameraPickerCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallCameraPickerController): CallFeatureController

    @Binds
    @IntoMap
    @CallActionKey(CallAction.CameraPicker)
    fun bindActionHandler(impl: CallCameraPickerActionHandler): CallActionHandler
}

/** Le pont de l'écran vers le contrôleur (singleton) : la feuille l'observe, la rangée de ma caméra l'ouvre. */
@HiltViewModel
class CallCameraPickerViewModel @Inject constructor(val controller: CallCameraPickerController) : ViewModel()

/** Ouvre « Choisir la caméra » depuis la rangée de ma caméra : à n'appeler que si une caméra est branchée. */
@Composable
internal fun rememberCameraPickerOpener(): () -> Unit {
    val bridge: CallCameraPickerViewModel = hiltViewModel()
    return remember(bridge) { bridge.controller::open }
}

@Composable
internal fun CameraDeviceOption.displayName(): String = when (facing) {
    CameraFacing.Front -> stringResource(R.string.call_camera_front)
    CameraFacing.Back -> stringResource(R.string.call_camera_back)
    CameraFacing.External -> externalNumber?.let { stringResource(R.string.call_camera_external_numbered, it) }
        ?: stringResource(R.string.call_camera_external)
}

/**
 * La feuille « Choisir la caméra » : une rangée par caméra (nom, coche sur celle qui est ouverte), cibles de
 * 48 dp, annoncée comme un choix exclusif par TalkBack. Choisir referme la feuille.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallCameraPickerSheet(
    cameras: List<CameraDeviceOption>,
    selectedId: String?,
    accent: Color,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = MeeshySpacing.lg)) {
            Text(
                text = stringResource(R.string.call_control_camera),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.md),
            )
            cameras.forEach { camera ->
                CallCameraPickerRow(camera, selected = camera.id == selectedId, accent = accent) {
                    onSelect(camera.id)
                    onDismiss()
                }
            }
        }
    }
}

@Composable
private fun CallCameraPickerRow(camera: CameraDeviceOption, selected: Boolean, accent: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(MeeshyIcons.Camera, contentDescription = null, tint = if (selected) accent else MaterialTheme.colorScheme.onSurface)
        Text(camera.displayName(), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = accent) else Spacer(Modifier.size(24.dp))
    }
}
