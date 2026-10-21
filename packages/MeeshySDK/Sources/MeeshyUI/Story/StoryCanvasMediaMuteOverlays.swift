import SwiftUI
import MeeshySDK

// MARK: - Boutons de sourdine et puces audio posés sur le canvas d'édition

extension StoryComposerView {
    /// Index de la vidéo de FOND, s'il y en a une.
    ///
    /// Pure et statique : la décision se teste sans monter la vue (même patron
    /// que `presentedCameraCapture(isRequested:provider:)`). Rend le PREMIER
    /// fond vidéo et non un tableau — le modèle ne contraint pas l'unicité du
    /// fond, et deux bindings poseraient deux boutons superposés au même coin
    /// du canvas.
    nonisolated static func backgroundVideoIndex(in medias: [StoryMediaObject]) -> Int? {
        medias.firstIndex { $0.isBackground && $0.kind == .video }
    }
}

/// Les contrôles posés SUR le canvas pour les médias sonores de la slide : puce
/// glass de chaque audio foreground et bouton de sourdine de chaque vidéo
/// (fond compris). Extraite de `StoryComposerView` : elle ne lit que le
/// ViewModel du composer et le régime de l'horloge d'édition.
struct StoryCanvasMediaMuteOverlays: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let isEditClockThrottled: Bool

    var body: some View {
        ZStack {
            audioForegroundOverlay
            videoMuteOverlay
        }
    }

    /// Chip glass posé sur le canvas pour chaque audio foreground (i.e.
    /// `isBackground != true`). La position vient du modèle (`x`/`y`
    /// normalisés) ; le drag local est éphémère et ne pousse que sur release
    /// pour éviter le scintillement des vues observant le VM. L'icône absente
    /// venait du fait que l'ancienne pastille de lecture n'était wired nulle
    /// part (retirée, #9890) — ce chip est plus léger et dédié à la composition.
    @ViewBuilder
    private var audioForegroundOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundAudioBindings, id: \.wrappedValue.id) { binding in
                    AudioForegroundChip(
                        audioObject: binding,
                        canvasSize: geo.size,
                        mode: .composer,
                        isSelected: viewModel.selectedElementId == binding.wrappedValue.id,
                        isUserMuted: binding.wrappedValue.volume <= 0,
                        isEditClockThrottled: isEditClockThrottled,
                        onDragEnd: { HapticFeedback.light() },
                        onTap: {
                            HapticFeedback.light()
                            viewModel.selectedElementId = binding.wrappedValue.id
                        },
                        onToggleMute: {
                            HapticFeedback.light()
                            // Un-bouton : mute → volume 0 (niveau mémorisé),
                            // unmute → restaure le niveau quitté (pas 1.0 forcé).
                            var obj = binding.wrappedValue
                            obj.toggleMute()
                            binding.wrappedValue = obj
                        }
                    )
                }
            }
        }
    }

    /// Bouton mute (icône au touché) posé sur chaque vidéo foreground du canvas
    /// d'édition. Tap → coupe / réactive le son de la vidéo (persisté via le
    /// `volume` du modèle : 0 = muet). L'aperçu live, le reader et l'export
    /// respectent tous ce `volume`. Posé dans le MÊME espace de coordonnées que
    /// les chips audio (overlay sur le canvas) pour un placement cohérent.
    @ViewBuilder
    private var videoMuteOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundVideoBindings, id: \.wrappedValue.id) { binding in
                    videoMuteButton(for: binding, canvasSize: geo.size)
                }
                // La vidéo de FOND — le cas le plus courant, et le seul qui
                // n'avait aucune affordance : `foregroundVideoBindings` filtre
                // sur `isBackground == false`. Son volume était pourtant bien
                // lu au rendu (`StoryCanvasUIView+Rendering`).
                if let bg = backgroundVideoBinding {
                    backgroundVideoMuteButton(for: bg, canvasSize: geo.size)
                }
            }
        }
    }

    /// Bouton de coupure du son de la vidéo de fond.
    ///
    /// Le fond couvre tout le canvas : sa position ne dérive pas du modèle
    /// comme celle d'un clip d'avant-plan, elle est ancrée au coin HAUT-GAUCHE
    /// — la colonne de boutons flottants est alignée en bas, et les boutons
    /// par-clip suivent chacun leur propre média.
    ///
    /// Mêmes icône, geste et clés de localisation que `videoMuteButton` : un
    /// contrôle visuellement différent pour la même action serait une
    /// régression d'apprentissage, et aucune clé neuve n'est à traduire.
    private func backgroundVideoMuteButton(for binding: Binding<StoryMediaObject>,
                                   canvasSize: CGSize) -> some View {
        let muted = binding.wrappedValue.volume <= 0
        let inset: CGFloat = 18
        return Button {
            HapticFeedback.light()
            var obj = binding.wrappedValue
            obj.toggleMute()
            binding.wrappedValue = obj
        } label: {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 30, height: 30)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .position(x: inset + 15, y: inset + 15)
        .accessibilityLabel(muted
            ? String(localized: "story.video.unmute", defaultValue: "Activer le son de la vidéo", bundle: .module)
            : String(localized: "story.video.mute", defaultValue: "Couper le son de la vidéo", bundle: .module))
    }

    /// Binding vers la vidéo de FOND, s'il y en a une. Optionnel et non
    /// tableau — cf. `backgroundVideoIndex(in:)`.
    private var backgroundVideoBinding: Binding<StoryMediaObject>? {
        let medias = viewModel.currentEffects.mediaObjects ?? []
        guard let idx = StoryComposerView.backgroundVideoIndex(in: medias) else { return nil }
        let snapshot = medias[idx]
        return Binding<StoryMediaObject>(
            get: {
                let list = viewModel.currentEffects.mediaObjects ?? []
                return list.indices.contains(idx) ? list[idx] : snapshot
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                guard var list = effects.mediaObjects,
                      list.indices.contains(idx) else { return }
                list[idx] = newValue
                effects.mediaObjects = list
                viewModel.currentEffects = effects
            }
        )
    }

    private func videoMuteButton(for binding: Binding<StoryMediaObject>,
                                 canvasSize: CGSize) -> some View {
        let media = binding.wrappedValue
        let muted = media.volume <= 0
        // Coin haut-droit de la vidéo : centre normalisé + demi-taille projetée
        // (même convention que `StoryMediaLayer.configure`). La rotation n'est
        // pas appliquée à l'icône (affordance, tolérance suffisante).
        let scaleFactor = canvasSize.width / CanvasGeometry.designWidth
        let base = StoryMediaLayer.baseMediaDesignSize(aspectRatio: media.aspectRatio)
        let halfW = base.width * CGFloat(media.scale) * scaleFactor / 2
        let halfH = base.height * CGFloat(media.scale) * scaleFactor / 2
        let cx = CGFloat(media.x) * canvasSize.width
        let cy = CGFloat(media.y) * canvasSize.height
        let inset: CGFloat = 18
        let px = min(canvasSize.width - inset, max(inset, cx + halfW - inset))
        let py = min(canvasSize.height - inset, max(inset, cy - halfH + inset))

        return Button {
            HapticFeedback.light()
            // Un-bouton : mémento de restauration (cf. StoryVolumeCarrying).
            var obj = binding.wrappedValue
            obj.toggleMute()
            binding.wrappedValue = obj
        } label: {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 30, height: 30)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .position(x: px, y: py)
        .accessibilityLabel(muted
            ? String(localized: "story.video.unmute", defaultValue: "Activer le son de la vidéo", bundle: .module)
            : String(localized: "story.video.mute", defaultValue: "Couper le son de la vidéo", bundle: .module))
    }

    /// Bindings vers chaque vidéo foreground (`isBackground == false`, kind
    /// `.video`) de la slide courante — pour le bouton mute. Écrit en retour
    /// dans `viewModel.currentEffects`, ce qui resync la slide et l'aperçu.
    private var foregroundVideoBindings: [Binding<StoryMediaObject>] {
        let medias = viewModel.currentEffects.mediaObjects ?? []
        return medias.enumerated().compactMap { idx, obj -> Binding<StoryMediaObject>? in
            guard obj.isBackground == false, obj.kind == .video else { return nil }
            return Binding<StoryMediaObject>(
                get: {
                    let list = viewModel.currentEffects.mediaObjects ?? []
                    return list.indices.contains(idx) ? list[idx] : obj
                },
                set: { newValue in
                    var effects = viewModel.currentEffects
                    guard var list = effects.mediaObjects,
                          list.indices.contains(idx) else { return }
                    list[idx] = newValue
                    effects.mediaObjects = list
                    viewModel.currentEffects = effects
                }
            )
        }
    }

    /// Bindings vers chaque `StoryAudioPlayerObject` foreground de la slide
    /// courante. Le binding écrit en retour dans `viewModel.currentEffects`
    /// — ce qui resync la slide via `currentSlide.didSet` et propage au canvas.
    private var foregroundAudioBindings: [Binding<StoryAudioPlayerObject>] {
        let audios = viewModel.currentEffects.audioPlayerObjects ?? []
        return audios.enumerated().compactMap { idx, obj -> Binding<StoryAudioPlayerObject>? in
            guard SceneAudioStageRule.isStaged(obj) else { return nil }
            return Binding<StoryAudioPlayerObject>(
                get: {
                    let list = viewModel.currentEffects.audioPlayerObjects ?? []
                    return list.indices.contains(idx) ? list[idx] : obj
                },
                set: { newValue in
                    var effects = viewModel.currentEffects
                    guard var list = effects.audioPlayerObjects,
                          list.indices.contains(idx) else { return }
                    list[idx] = newValue
                    effects.audioPlayerObjects = list
                    viewModel.currentEffects = effects
                }
            )
        }
    }
}
