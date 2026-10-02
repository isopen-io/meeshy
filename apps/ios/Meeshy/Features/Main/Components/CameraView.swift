import SwiftUI
import Combine
import AVFoundation
import os
import MeeshySDK
import MeeshyUI

struct CameraView: View {
    /// Le mode d'ouverture. `.photo` par défaut — les trois appelants
    /// historiques (conversation, feed, pièces jointes) n'en demandent pas
    /// d'autre, et leur comportement ne bouge pas d'un pixel.
    let initialMode: CameraCaptureMode
    let onCapture: (CameraResult) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraModel()
    @State private var isVideoMode: Bool
    @State private var flashMode: AVCaptureDevice.FlashMode = .off

    /// **L'état de mode est SEMÉ à la construction, jamais posé dans un
    /// `.onAppear`.** Posé après coup, le premier rendu montrerait l'onglet
    /// Photo puis basculerait sous l'œil — et le déclencheur photo resterait
    /// tappable pendant cette frame.
    init(initialMode: CameraCaptureMode = .photo,
         onCapture: @escaping (CameraResult) -> Void) {
        self.initialMode = initialMode
        self.onCapture = onCapture
        _isVideoMode = State(initialValue: initialMode == .video)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if camera.permission.needsSettingsRedirect {
                permissionDeniedPanel
            } else {
                CameraPreviewLayer(session: camera.session)
                    .ignoresSafeArea()
            }

            VStack(spacing: 0) {
                topBar
                Spacer()
                if !camera.permission.needsSettingsRedirect {
                    bottomControls
                }
            }

            if camera.isTakingPhoto {
                Color.white.ignoresSafeArea()
                    .opacity(MeeshyOpacity.medium)
                    .animation(.easeOut(duration: 0.15), value: camera.isTakingPhoto)
            }
        }
        .onAppear {
            camera.configure()
            // **Le micro est armé À L'OUVERTURE quand la porte a promis la
            // vidéo**, et pas au premier appui sur le déclencheur : sans ça,
            // l'auteur presse « enregistrer » et attend un prompt d'autorisation
            // pendant que le viseur, lui, montre déjà la scène qu'il voulait
            // filmer. Hors de ce cas, le prompt reste attaché à l'onglet Vidéo —
            // le demander à qui ne prend qu'une photo est ce que le lot
            // précédent a corrigé.
            if initialMode == .video {
                Task { await camera.enableAudioCaptureIfNeeded() }
            }
        }
        .onDisappear { camera.stop() }
        .onReceive(camera.$capturedPhotoId) { id in
            guard id != nil, let image = camera.capturedPhoto else { return }
            onCapture(.photo(image, data: camera.capturedPhotoData))
            dismiss()
        }
        .onReceive(camera.$capturedVideoId) { id in
            guard id != nil, let url = camera.capturedVideoURL else { return }
            onCapture(.video(url))
            dismiss()
        }
        .statusBarHidden()
    }

    // MARK: - Permission Denied

    /// Remplace le preview quand l'accès caméra est refusé ou restreint.
    /// Avant, `configure()` sortait en silence et l'utilisateur restait devant
    /// un écran noir sans explication ni recours.
    /// **Le panneau est EXTRAIT** (#4080) : le viseur en scène en a besoin, et
    /// deux écrans de refus écrits séparément auraient divergé au premier mot.
    private var permissionDeniedPanel: some View { CameraPermissionPanel() }


    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    // doctrine 82i — glyphe borné par le cadre tap fixe 44×44
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(MeeshyColors.mediaChromeForeground)
                    .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    .background(Circle().fill(MeeshyColors.mediaChromeFill))
            }
            .accessibilityLabel(String(localized: "camera.close", defaultValue: "Fermer", bundle: .main))

            Spacer()

            Button { cycleFlash() } label: {
                Image(systemName: flashIcon)
                    // doctrine 82i — glyphe borné par le cadre tap fixe 44×44
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(flashMode == .off ? MeeshyColors.mediaChromeTertiary : .yellow)
                    .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    .background(Circle().fill(MeeshyColors.mediaChromeFill))
            }
            .accessibilityLabel(flashAccessibilityLabel)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    // **Le vocabulaire du flash a été EXTRAIT** (#4080) : la barre du viseur en
    // scène sert les mêmes trois positions, et deux cycles écrits séparément
    // auraient divergé au premier réglage. `ComposerCameraFlash` en est le site
    // unique — glyphe, libellé et ordre du cycle.
    private var flashIcon: String { ComposerCameraFlash.symbol(for: flashMode) }

    private var flashAccessibilityLabel: String { ComposerCameraFlash.label(for: flashMode) }

    private func cycleFlash() {
        flashMode = ComposerCameraFlash.next(after: flashMode)
        HapticFeedback.light()
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: MeeshySpacing.xl) {
            if camera.isRecordingVideo {
                recordingIndicator
            }

            modeSwitcher

            HStack(spacing: 40) {
                Spacer()

                captureButton

                Button { camera.switchCamera() } label: {
                    Image(systemName: "camera.rotate.fill")
                        // doctrine 82i — glyphe borné par le cadre tap fixe 50×50
                        .font(.system(size: 22))
                        .foregroundColor(MeeshyColors.mediaChromeForeground)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(.white.opacity(MeeshyOpacity.light)))
                }
                .accessibilityLabel(String(localized: "camera.switch", defaultValue: "Changer de caméra", bundle: .main))

                Spacer()
            }
        }
        .padding(.bottom, MeeshySpacing.xxxl)
    }

    private var modeSwitcher: some View {
        HStack(spacing: MeeshySpacing.xxl) {
            modeTab(String(localized: "camera.mode.photo", defaultValue: "Photo", bundle: .main), selected: !isVideoMode) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { isVideoMode = false }
                HapticFeedback.light()
            }
            modeTab(String(localized: "camera.mode.video", defaultValue: "Vidéo", bundle: .main), selected: isVideoMode) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { isVideoMode = true }
                HapticFeedback.light()
                // Le micro est demandé ICI — au moment où le son devient utile —
                // et non à l'ouverture de la caméra.
                Task { await camera.enableAudioCaptureIfNeeded() }
            }
        }
    }

    private func modeTab(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: selected ? .bold : .medium))
                .foregroundColor(selected ? .white : .white.opacity(MeeshyOpacity.strong))
        }
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    @ViewBuilder
    private var captureButton: some View {
        if isVideoMode {
            videoRecordButton
        } else {
            photoButton
        }
    }

    private var photoButton: some View {
        Button {
            camera.takePhoto(flash: flashMode)
            HapticFeedback.medium()
        } label: {
            ZStack {
                Circle()
                    .stroke(.white, lineWidth: 4)
                    .frame(width: 72, height: 72)
                Circle()
                    .fill(.white)
                    .frame(width: 60, height: 60)
            }
        }
        .accessibilityLabel(String(localized: "camera.capture.photo", defaultValue: "Prendre une photo", bundle: .main))
    }

    private var videoRecordButton: some View {
        Button {
            if camera.isRecordingVideo {
                camera.stopRecording()
                HapticFeedback.medium()
            } else {
                // Filet : couvre le cas où l'on arrive en mode Vidéo autrement
                // que par l'onglet (préselection, restauration d'état).
                Task {
                    await camera.enableAudioCaptureIfNeeded()
                    camera.startRecording()
                    HapticFeedback.medium()
                }
            }
        } label: {
            ZStack {
                Circle()
                    .stroke(.white, lineWidth: 4)
                    .frame(width: 72, height: 72)
                if camera.isRecordingVideo {
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                        .fill(MeeshyColors.error)
                        .frame(width: 30, height: 30)
                } else {
                    Circle()
                        .fill(MeeshyColors.error)
                        .frame(width: 60, height: 60)
                }
            }
        }
        .accessibilityLabel(camera.isRecordingVideo
            ? String(localized: "camera.record.stop", defaultValue: "Arrêter l'enregistrement", bundle: .main)
            : String(localized: "camera.record.start", defaultValue: "Démarrer l'enregistrement", bundle: .main))
    }

    private var recordingIndicator: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Circle()
                .fill(MeeshyColors.error)
                .frame(width: 10, height: 10)
            Text(LocalizedNumber.duration(seconds: camera.recordingDuration))
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold, design: .monospaced))
                .foregroundColor(MeeshyColors.mediaChromeForeground)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .background(Capsule().fill(MeeshyColors.mediaScrim))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "camera.recording", defaultValue: "Enregistrement en cours", bundle: .main))
        .accessibilityValue(LocalizedNumber.spokenDuration(seconds: camera.recordingDuration))
        .accessibilityAddTraits(.updatesFrequently)
    }
}

// MARK: - Injection dans le composer de story (SDK)

extension View {
    /// Fournit au composer de story (`StoryComposerView`, côté SDK) la fabrique
    /// de CET écran de capture. Même doctrine que `storyLocationPickerProvided`
    /// : `CameraView` pilote une `AVCaptureSession`, gère les permissions et son
    /// écran de refus — de l'orchestration UX produit, donc app-side (SDK
    /// purity). Sans cet appel, l'amorce « Caméra » de la page blanche n'est pas
    /// rendue (une amorce qui ouvre le vide est pire que pas d'amorce).
    ///
    /// La fermeture a DEUX écrivains légitimes : le binding du SDK (posé avant
    /// l'insertion du média) et le `dismiss()` que `CameraView` exécute après
    /// chaque capture. Aucun des deux n'est de trop — le SDK remet aussi le
    /// drapeau à plat dans `resetLocalState()`.
    func storyCameraCaptureProvided() -> some View {
        environment(\.storyCameraCapture, StoryCameraCaptureProvider { onCapture in
            AnyView(CameraView { result in
                switch result {
                // Le pont vers le SDK PERD l'EXIF, et c'est son CONTRAT qui
                // l'impose : `StoryCameraCaptureProvider.photo` ne porte qu'une
                // `UIImage`. Les octets d'origine s'arrêtent donc ici — ce
                // chemin sert l'amorce « Caméra » de la page blanche du SDK, pas
                // le viseur en scène (#4080), qui lit `capturedPhotoData`.
                case .photo(let image, _): onCapture(.photo(image))
                case .video(let url):   onCapture(.video(url))
                }
            })
        })
    }
}
