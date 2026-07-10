import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + TopBar

extension StoryComposerView {
    /// C-DIR2 (d)+(c) : le header suit EXACTEMENT les conditions des FABs —
    /// visible uniquement canvas plein écran au repos (aucun panneau, aucune
    /// édition texte/dessin, pas de zoom). L'ancienne règle le gardait affiché
    /// pendant l'édition (`|| activeTool != nil || selectedElementId != nil`),
    /// à rebours de « n'afficher que l'utile à l'instant t ».
    var showTopBar: Bool {
        ComposerChromePolicy.fullChromeVisible(
            fabsVisible: areFabsVisible,
            bandHidden: bandStateMachine.state == .hidden,
            isTextEditing: viewModel.textEditingMode != .inactive,
            isDrawingActive: viewModel.drawingEditingMode.isActive,
            isViewportZoomed: viewModel.isCanvasZoomed
        )
    }

    // MARK: - Top Bar (icônes flottantes — directive user 2026-07-10)

    /// Le header n'est PLUS une barre : plus de fond `.ultraThinMaterial`
    /// pleine largeur ni de hauteur réservée — chaque commande est une icône
    /// de verre individuelle qui FLOTTE au-dessus du canvas plein écran
    /// (parité IMG_0944 : X à gauche, actions à droite). La bande de slides
    /// devient un élément flottant AUTONOME sous les icônes, présent
    /// uniquement quand il est utile (« les éléments apparaissent et quittent
    /// selon le besoin »).
    var topBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 0) {
                dismissButton

                Spacer(minLength: 12)

                // Unified Liquid Glass action group (iOS 26 GlassEffectContainer →
                // adjacent glass morphs into one continuous surface; iOS 16–25 falls
                // back to material/solid via the adaptiveGlass wrappers). Publish keeps
                // the primary brand tint via prominent glass; overflow (⋯) sits last,
                // right of Publish.
                AdaptiveGlassContainer(spacing: 6) {
                    HStack(spacing: 6) {
                        // C9 Inc.4 — n'afficher que l'utile : les commandes
                        // d'annulation n'existent à l'écran QUE quand la
                        // trajectoire le permet (canUndo/canRedo).
                        if viewModel.canUndoGlobal {
                            historyButton(
                                icon: "arrow.uturn.backward",
                                label: String(localized: "story.composer.undo",
                                              defaultValue: "Annuler", bundle: .module),
                                action: performUndo
                            )
                        }
                        if viewModel.canRedoGlobal {
                            historyButton(
                                icon: "arrow.uturn.forward",
                                label: String(localized: "story.composer.redo",
                                              defaultValue: "Rétablir", bundle: .module),
                                action: performRedo
                            )
                        }
                        visibilityMenu
                        previewButton
                        publishButton
                        overflowMenu
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.85),
                               value: viewModel.canUndoGlobal)
                    .animation(.spring(response: 0.3, dampingFraction: 0.85),
                               value: viewModel.canRedoGlobal)
                }
            }

            // Bande de slides flottante — visible seulement quand elle sert :
            // plusieurs slides à naviguer, ou du contenu à dupliquer/étendre.
            // Sur un composer vierge (empty-state picker), elle disparaît.
            if shouldShowFloatingSlideStrip {
                slideStrip
                    .padding(.vertical, 5)
                    .adaptiveGlass(in: Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .animation(.spring(response: 0.3, dampingFraction: 0.85),
                   value: shouldShowFloatingSlideStrip)
    }

    /// La bande n'apparaît que quand elle est UTILE : navigation entre
    /// plusieurs slides, ou slide courant avec du contenu (vignette d'état +
    /// affordance « + » C6). Composer vierge = canvas nu, zéro chrome inutile.
    var shouldShowFloatingSlideStrip: Bool {
        viewModel.slides.count > 1 || composerHasContent
    }

    var dismissButton: some View {
        Button { handleDismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .glassControlForeground()
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
    }

    var previewButton: some View {
        Button {
            NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
            Task { @MainActor in
                let snapshot = await snapshotAllSlides()
                onPreview(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs)
            }
        } label: {
            Image(systemName: "play.fill")
                .font(.system(size: 12, weight: .bold))
                .glassControlForeground()
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
    }

    var publishButton: some View {
        let isPublishing = publishTask != nil
        return Button { publishAllSlides() } label: {
            HStack(spacing: 4) {
                if isPublishing {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                        .scaleEffect(0.7)
                } else {
                    Text(String(localized: "story.composer.publish", defaultValue: "Publier", bundle: .module)).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 13))
                }
            }
            .fixedSize()
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
        }
        .disabled(isPublishing)
    }

    var visibilityMenu: some View {
        Menu {
            ForEach(PostVisibility.composerSelectableCases) { mode in
                Button {
                    visibility = mode.rawValue
                    if mode.requiresUserSelection { audiencePickerMode = mode }
                } label: {
                    Label(mode.label, systemImage: visibility == mode.rawValue ? "checkmark" : mode.icon)
                }
            }
        } label: {
            let current = PostVisibility(rawValue: visibility) ?? .public
            let showCount = current.requiresUserSelection && !visibilityUserIds.isEmpty
            HStack(spacing: 4) {
                Image(systemName: current.icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(showCount ? "\(current.label) (\(visibilityUserIds.count))" : current.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
            }
            .glassControlForeground()
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .adaptiveGlass(in: Capsule(), tint: MeeshyColors.brandPrimary.opacity(0.18))
        }
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: visibilityUserIds) { ids in
                visibilityUserIds = ids
            }
        }
    }

    // MARK: - Undo/redo global (C9 Inc.4)

    func historyButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .glassControlForeground()
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
        .transition(.scale.combined(with: .opacity))
        .accessibilityLabel(label)
    }

    /// L'application d'un snapshot est VM-side ; les side-effects de
    /// présentation (état canvas local, timeline chargée) sont View-side —
    /// même séquence que la sélection d'une vignette du strip.
    func performUndo() {
        guard viewModel.undoGlobal() else { return }
        restoreCanvas(from: viewModel.currentSlide)
        viewModel.loadCurrentSlideIntoTimeline()
        HapticFeedback.light()
    }

    func performRedo() {
        guard viewModel.redoGlobal() else { return }
        restoreCanvas(from: viewModel.currentSlide)
        viewModel.loadCurrentSlideIntoTimeline()
        HapticFeedback.light()
    }

    var overflowMenu: some View {
        Menu {
            // Slide tools — le filtre GLOBAL a été retiré : les filtres
            // s'appliquent désormais par média via l'éditeur unitaire (crayon
            // sur chaque image/vidéo), chacun avec son propre aperçu live.
            Button { showTransitionSheet = true } label: {
                Label(
                    String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module),
                    systemImage: "rectangle.2.swap"
                )
            }
            Button { viewModel.isTimelineVisible = true } label: {
                Label(
                    String(localized: "story.composer.timeline", defaultValue: "Timeline", bundle: .module),
                    systemImage: "clock"
                )
            }

            Divider()

            Button { saveDraft() } label: {
                Label(String(localized: "story.composer.saveDraft", defaultValue: "Sauvegarder le brouillon", bundle: .module), systemImage: "square.and.arrow.down")
            }
            Divider()
            Button(role: .destructive) {
                // Bug fix: viewModel.reset() wipes ViewModel data (slides, effects,
                // images), but composer-local @State (selectedFilter,
                // openingEffect, closingEffect, selectedImage, audio inputs, drawing
                // canvas, picker scratch) survives. The canvasSyncFingerprint chain
                // (.onChange → syncCurrentSlideEffects → buildEffects) re-injects
                // those stale local values into the fresh empty slide, making
                // "deleted" elements reappear. resetLocalState() clears them in
                // lock-step so the sync writes back a truly empty effects payload.
                viewModel.reset()
                resetLocalState()
            } label: {
                Label(String(localized: "story.composer.deleteAllSlides", defaultValue: "Supprimer tous les slides", bundle: .module), systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .glassControlForeground()
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
    }
}
