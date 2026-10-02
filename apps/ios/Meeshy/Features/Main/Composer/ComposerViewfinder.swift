import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// Les règles du viseur servi SEUL, hors d'une scène (#9125).
nonisolated enum ComposerViewfinderRules {

    /// Le mode que la porte a promis (#4998) devient celui que la barre
    /// annonce — jamais un viseur photo sous une porte vidéo.
    static func sceneMode(for mode: CameraCaptureMode) -> ComposerSceneCameraMode {
        switch mode {
        case .photo: return .photo
        case .video: return .video
        }
    }

    /// Le toucher hors des contrôleurs prend la photo (#8711) — viseur armé, et
    /// aucun segment vidéo en attente : une photo posée au milieu d'une prise
    /// en plusieurs segments jetterait ceux-ci.
    static func takesPhotoOnTap(stage: ComposerSceneCameraStage, pendingSegments: Int) -> Bool {
        stage == .armed && pendingSegments == 0
    }

    /// L'appui long hors des contrôleurs filme (#8846), viseur armé.
    static func filmsOnHold(stage: ComposerSceneCameraStage) -> Bool {
        stage == .armed
    }
}

/// **Le viseur du composeur, servi SEUL en plein écran** (#9125).
///
/// > Demande porteur 2026-10-02 : il n'existe plus qu'UNE vue de capture.
///
/// La scène du composeur sert le viseur dans sa carte et le fait grandir en
/// plein écran (`MeeshyComposerHost+Viewfinder`). Les portes qui n'ont PAS de
/// scène — le statut, la page blanche de l'atelier, la citation du fil — le
/// reçoivent ici, directement à sa taille plein écran : même barre
/// (`ComposerSceneCameraBar`), même aperçu (`CameraPreviewLayer`), même panneau
/// de refus, mêmes lois de geste, de cadenas, de zoom et de flash. L'ancienne
/// `CameraView`, qui portait un second chrome et une seconde gestuelle, a quitté
/// le dépôt.
///
/// Ce que la prise rend part par `onCapture` — une photo avec ses octets
/// d'origine, ou la vidéo concaténée de ses segments — puis le viseur se retire.
struct ComposerViewfinder: View {
    let initialMode: CameraCaptureMode
    let onCapture: (CameraResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var capture: ComposerCaptureSession
    @State private var delivered = false

    /// Le viseur naît ARMÉ, au mode que la porte a promis : posé dans un
    /// `.onAppear`, la barre annoncerait la photo une image avant de basculer.
    init(initialMode: CameraCaptureMode = .photo,
         onCapture: @escaping (CameraResult) -> Void) {
        self.initialMode = initialMode
        self.onCapture = onCapture
        _capture = StateObject(wrappedValue: ComposerCaptureSession(
            stage: .armed, mode: ComposerViewfinderRules.sceneMode(for: initialMode)))
    }

    private var camera: CameraModel { capture.camera }

    var body: some View {
        ZStack {
            preview
                .ignoresSafeArea()
            if refused {
                refusedChrome
            } else {
                ComposerCaptureChrome(
                    session: capture,
                    size: .fullScreen,
                    offersSizeToggle: false,
                    onTap: { tapAnywhere() },
                    onHold: { holdAnywhere() },
                    onDisarm: { close() },
                    onValidateSegments: { capture.validateSegments { deliver(.video($0)) } })
            }
        }
        .background(Color.black.ignoresSafeArea())
        .onAppear {
            camera.configure()
            // La porte qui promet la vidéo arme le micro À L'OUVERTURE : le
            // prompt n'arrive pas sous le doigt qui veut déjà filmer.
            if initialMode == .video {
                Task { await camera.enableAudioCaptureIfNeeded() }
            }
        }
        .onDisappear { capture.disarm() }
        .onReceive(camera.$capturedPhotoId) { id in
            guard id != nil, !delivered, let image = camera.capturedPhoto else { return }
            deliver(.photo(image, data: camera.capturedPhotoData))
        }
        // Une vidéo s'ACCUMULE (#4099) : `✓` concatène et rend.
        .onReceive(camera.$capturedVideoId) { id in
            guard id != nil, !delivered, let url = camera.capturedVideoURL else { return }
            capture.collectSegment(url)
        }
        .statusBarHidden()
    }

    private var refused: Bool {
        ComposerSceneCameraSurface.shown(stage: capture.stage, permission: camera.permission) == .permissionRefused
    }

    // MARK: - L'image

    private var preview: some View {
        GeometryReader { proxy in
            let rect = ComposerFrontFlash.previewRect(
                CGRect(origin: .zero, size: proxy.size), size: .fullScreen, floorLit: capture.floorIsLit)
            ZStack {
                if capture.floorIsLit { Color(white: capture.floorWhite) }
                ComposerCapturePreview(session: capture, size: .fullScreen)
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
            }
        }
    }

    /// Accès refusé : le panneau explique et ouvre les Réglages ; la croix
    /// reste, quitter à tout moment (#8653).
    private var refusedChrome: some View {
        VStack {
            HStack {
                Spacer()
                Button { close() } label: {
                    Image(systemName: "xmark")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                        .adaptiveGlass(in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerSceneCameraCopy.disarmLabel)
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
    }

    // MARK: - Les gestes hors des contrôleurs

    private func tapAnywhere() {
        guard ComposerViewfinderRules.takesPhotoOnTap(stage: capture.stage,
                                                      pendingSegments: capture.segments.count) else { return }
        capture.photographWhenReady()
    }

    private func holdAnywhere() {
        guard ComposerViewfinderRules.filmsOnHold(stage: capture.stage) else { return }
        capture.beginHold()
    }

    // MARK: - La sortie

    private func deliver(_ result: CameraResult) {
        delivered = true
        capture.finishCapture()
        HapticFeedback.success()
        onCapture(result)
        dismiss()
    }

    /// Quitter sans rendre emporte les segments abandonnés ET leurs fichiers,
    /// éteint la lumière et coupe la session — `onDisappear` le fait quel que
    /// soit le chemin de sortie (croix, glissé, fermeture par l'hôte).
    private func close() {
        dismiss()
    }
}
