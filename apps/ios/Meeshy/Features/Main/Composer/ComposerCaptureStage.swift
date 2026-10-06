import SwiftUI
import MeeshySDK

/// Les deux couches d'un montage : l'IMAGE ignore les marges système (en plein
/// écran, jusqu'au bord), les COMMANDES les respectent (#4080).
nonisolated enum ComposerCaptureStageLayer: Equatable, Sendable {
    case image
    case controls
}

/// **L'OBJET UNIQUE de la capture : viser, filmer, retoucher** (#9351, #9354,
/// spec § 2 et § 4.3).
///
/// Monté, couche par couche, par `ComposerCaptureMount` — le seul montage,
/// celui de la barre de conversation (plein écran figé) comme celui du composer
/// story / post / réel (carte ou plein écran). La seule différence entre les
/// deux est `offersSizeToggle` ; le format décide seulement si la photo et la
/// vidéo sont offertes.
///
/// Un accès refusé ne monte pas la nappe de gestes : elle volerait les touches
/// du panneau qui ouvre les Réglages. La croix, elle, reste (#8653).
struct ComposerCaptureStage: View {
    @ObservedObject var session: ComposerCaptureSession
    let layer: ComposerCaptureStageLayer
    let size: ComposerSceneCameraSize
    var offersSizeToggle = true
    var allowsPhoto = true
    var allowsVideo = true
    var onToggleSize: () -> Void = {}
    let onDisarm: () -> Void
    let onDeliver: @MainActor (CameraResult) -> Void

    private var refused: Bool {
        ComposerSceneCameraSurface.shown(stage: session.stage, permission: session.camera.permission)
            == .permissionRefused
    }

    var body: some View {
        switch layer {
        case .image:
            ComposerCapturePreview(session: session, size: size)
        case .controls:
            controls
                .onAppear {
                    session.onDeliver = onDeliver
                    session.resetExposure()
                }
                .onDisappear { session.resetExposure() }
        }
    }

    @ViewBuilder
    private var controls: some View {
        if refused {
            ComposerCaptureRefusedChrome(onDisarm: onDisarm)
        } else {
            ComposerCaptureChrome(
                session: session,
                size: size,
                offersSizeToggle: offersSizeToggle,
                allowsPhoto: allowsPhoto,
                allowsVideo: allowsVideo,
                onToggleSize: onToggleSize,
                onDisarm: onDisarm,
                onValidateSegments: { session.validateSegments { onDeliver(.video($0)) } })
        }
    }
}
