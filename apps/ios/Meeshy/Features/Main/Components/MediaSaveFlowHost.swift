import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Modifier hôte du flux « Enregistrer en local »

/// LE composant unique de sauvegarde locale : quel que soit le type
/// (image, son, vidéo, document), il présente la même sheet de destinations
/// (Photos quand applicable / Fichiers avec choix du dossier / Partager),
/// puis le picker d'export ou la share sheet, et surface l'issue via
/// `FeedbackToastManager` (feedback d'action locale — jamais
/// `NotificationToastManager`).
struct MediaSaveFlowModifier: ViewModifier {
    @ObservedObject var coordinator: MediaSaveCoordinator

    private struct StagedFile: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }

    func body(content: Content) -> some View {
        content
            .confirmationDialog(
                Text(NSLocalizedString("media.save.title", value: "Enregistrer", comment: "Title of the unified save destination sheet")),
                isPresented: Binding(
                    get: { coordinator.pendingRequest != nil },
                    set: { presented in if !presented { coordinator.cancel() } }
                ),
                titleVisibility: .visible
            ) {
                ForEach(coordinator.pendingRequest?.destinations ?? [], id: \.self) { destination in
                    Button {
                        // Capture SYNCHRONE au tap : la fermeture du dialog vide
                        // `pendingRequest` (binding `cancel()`) avant que ce
                        // `Task` async ne tourne. On fige donc la requête ici,
                        // pendant que `pendingRequest` est encore renseignée.
                        let request = coordinator.pendingRequest
                        Task { await coordinator.pick(destination, request: request) }
                    } label: {
                        Label(destination.label, systemImage: destination.sfSymbolName)
                    }
                }
                Button(NSLocalizedString("common.cancel", value: "Annuler", comment: ""), role: .cancel) {
                    coordinator.cancel()
                }
            }
            .sheet(item: Binding(
                get: { coordinator.exportURL.map(StagedFile.init(url:)) },
                set: { staged in if staged == nil { coordinator.reportExportCancelled() } }
            )) { staged in
                DocumentExportPicker(
                    url: staged.url,
                    onExported: { coordinator.reportExportCompleted() },
                    onCancelled: { coordinator.reportExportCancelled() }
                )
                .ignoresSafeArea()
            }
            .sheet(item: Binding(
                get: { coordinator.shareURL.map(StagedFile.init(url:)) },
                set: { staged in if staged == nil { coordinator.shareURL = nil } }
            )) { staged in
                ShareSheet(activityItems: [staged.url])
                    .ignoresSafeArea()
            }
            .overlay(alignment: .center) {
                // Préparer un média marqué n'est pas instantané : graver le
                // filigrane dans une vidéo la ré-encode. Sans cet indicateur,
                // l'app resterait muette entre le tap et le toast — l'utilisateur
                // croirait que rien ne s'est passé et retaperait.
                if coordinator.isProcessing {
                    MediaSavePreparingIndicator()
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: coordinator.isProcessing)
            .adaptiveOnChange(of: coordinator.lastOutcome) { _, outcome in
                switch outcome {
                case .saved(let destination):
                    HapticFeedback.success()
                    FeedbackToastManager.shared.showSuccess(savedMessage(for: destination))
                case .failed(let message):
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError(message)
                case nil:
                    break
                }
            }
    }

    private func savedMessage(for destination: MediaSaveDestination) -> String {
        switch destination {
        case .photoLibrary:
            return NSLocalizedString("media.save.done.photos", value: "Enregistré dans Photos", comment: "")
        case .files:
            return NSLocalizedString("media.save.done.files", value: "Enregistré dans Fichiers", comment: "")
        case .share:
            return NSLocalizedString("media.save.done.share", value: "Partagé", comment: "")
        }
    }
}

// MARK: - Indicateur de préparation

/// Pastille de patience affichée pendant la résolution + le marquage du média.
/// Volontairement passive : l'opération n'est pas annulable (le ré-encodage
/// d'`AVAssetExportSession` a déjà commencé), donc rien de tappable ici — un
/// bouton qui ne fait rien ment plus qu'il n'aide.
private struct MediaSavePreparingIndicator: View {
    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white)
            Text(NSLocalizedString("media.save.preparing", value: "Préparation…", comment: "Shown while the media is being resolved and watermarked before saving"))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.25), radius: 18, y: 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(NSLocalizedString("media.save.preparing", value: "Préparation…", comment: ""))
    }
}

extension View {
    /// Attache le flux unifié « Enregistrer en local » à un écran hôte.
    /// Déclencher via `coordinator.requestSave(MediaSaveRequest(...))`.
    func mediaSaveFlow(_ coordinator: MediaSaveCoordinator) -> some View {
        modifier(MediaSaveFlowModifier(coordinator: coordinator))
    }
}

// MARK: - Wrapper de présentation fullscreen

/// Enveloppe le CONTENU d'une présentation fullscreen (cover/sheet) avec le
/// flux unifié « Enregistrer ». Le coordinateur vit DANS la présentation :
/// le confirmationDialog peut donc s'afficher par-dessus le viewer — un
/// dialog attaché SOUS un fullScreenCover ne se présente pas (SwiftUI iOS 16).
/// Créé uniquement quand le fullscreen s'ouvre — aucun coût par cellule.
struct SavableMediaFullscreen<Content: View>: View {
    let attachment: MessageAttachment
    @ViewBuilder let content: (_ requestSave: @escaping () -> Void) -> Content

    @StateObject private var saveCoordinator = MediaSaveCoordinator()

    var body: some View {
        content(requestSave)
            .mediaSaveFlow(saveCoordinator)
    }

    private func requestSave() {
        HapticFeedback.light()
        saveCoordinator.requestSave(MediaSaveRequest(
            kind: attachment.kind,
            remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
            attachmentId: attachment.id.isEmpty ? nil : attachment.id
        ))
    }
}

// MARK: - Export picker (Fichiers — l'utilisateur choisit le dossier)

/// `UIDocumentPickerViewController(forExporting:)` en mode COPY : le fichier
/// stagé reste en place (nettoyé par le cycle de vie du dossier temporaire),
/// l'utilisateur choisit librement la destination (iCloud Drive, Sur mon
/// iPhone, providers tiers) — indépendant de `UIFileSharingEnabled`.
private struct DocumentExportPicker: UIViewControllerRepresentable {
    let url: URL
    let onExported: () -> Void
    let onCancelled: () -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = context.coordinator
        picker.shouldShowFileExtensions = true
        return picker
    }

    func updateUIViewController(_ controller: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onExported: onExported, onCancelled: onCancelled)
    }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        private let onExported: () -> Void
        private let onCancelled: () -> Void

        init(onExported: @escaping () -> Void, onCancelled: @escaping () -> Void) {
            self.onExported = onExported
            self.onCancelled = onCancelled
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onExported()
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            onCancelled()
        }
    }
}

// Le partage passe par `ShareSheet` (`ConversationMediaViews.swift`), pont
// unique vers `UIActivityViewController` : ce fichier en portait une copie
// strictement identique à un paramètre près.
