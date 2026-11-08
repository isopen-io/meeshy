import SwiftUI
import MeeshySDK

struct ComposerAudioToolPanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool
    /// Sélecteur de la bibliothèque de sons — troisième porte d'entrée audio,
    /// à côté du fichier local et de l'enregistrement.
    @Binding var showSoundLibrary: Bool

    var body: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.sm) {
                if viewModel.canAddAudio {
                    Button { showAudioDocumentPicker = true } label: {
                        MediaPillLabel(icon: "waveform", text: String(localized: "story.composer.addAudioFile", defaultValue: "Audio", bundle: .module), destructive: false)
                    }
                    Button { showVoiceRecorderSheet = true } label: {
                        MediaPillLabel(icon: "mic.fill", text: String(localized: "story.composer.record", defaultValue: "Enregistrer", bundle: .module), destructive: false)
                    }
                    Button { showSoundLibrary = true } label: {
                        MediaPillLabel(icon: "music.note.list", text: String(localized: "story.composer.soundLibrary", defaultValue: "Bibliothèque", bundle: .module), destructive: false)
                    }
                }
                Spacer()
            }

            if let audios = viewModel.currentEffects.audioPlayerObjects, !audios.isEmpty {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: MeeshySpacing.xs) {
                        ForEach(audios) { audio in
                            StoryAudioCell(
                                audio: audio,
                                url: viewModel.loadedAudioURLs[audio.id],
                                isBackground: viewModel.isBackground(id: audio.id),
                                onToggleBackground: { viewModel.toggleBackground(id: audio.id) },
                                onVolumeChanged: { viewModel.setAudioVolume(audioId: audio.id, volume: $0) },
                                onDelete: { viewModel.deleteElement(id: audio.id) },
                                onToggleMute: { viewModel.toggleAudioMute(id: audio.id) }
                            )
                        }
                    }
                    .padding(.horizontal, MeeshySpacing.md)
                }
                .frame(maxHeight: 150)
            }
        }
        // Ouvrir l'outil Son sur une slide vierge déclenche directement le
        // voice recorder — parité avec `textPanel.onAppear` qui ouvre
        // l'éditeur de texte sans étape intermédiaire. Couvre les deux
        // entrées : tap FAB son (band → audioPanel) et empty-state tile son.
        // Si la slide a déjà au moins un audio, on respecte l'intent (l'user
        // veut probablement gérer la liste existante).
        .onAppear {
            let isEmpty = (viewModel.currentEffects.audioPlayerObjects?.isEmpty ?? true)
            if isEmpty && viewModel.canAddAudio && !showVoiceRecorderSheet {
                showVoiceRecorderSheet = true
            }
        }
    }
}
