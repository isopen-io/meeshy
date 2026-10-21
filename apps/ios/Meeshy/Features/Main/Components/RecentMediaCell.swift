import SwiftUI
import Photos
import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

// ============================================================================
// MARK: - RecentMediaCell
// ============================================================================

struct RecentMediaCell: View {
    let asset: PHAsset
    let model: RecentMediaStripModel
    let cell: CGFloat
    let accentColor: String
    let isResolving: Bool
    let isAttached: Bool
    let isSelecting: Bool
    let selectionIndex: Int?
    let canEdit: Bool
    let onTap: () -> Void
    let onAdd: () -> Void
    let onToggleSelect: () -> Void
    let onEditTap: () -> Void

    @State private var thumbnail: UIImage?
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Button(action: onTap) {
            ZStack {
                if let thumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                        .frame(width: cell, height: cell)
                        .clipped()
                } else {
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .fill(Color.gray.opacity(0.18))
                        .frame(width: cell, height: cell)
                        .overlay(ProgressView().scaleEffect(0.7))
                }

                if asset.mediaType == .video {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "video.fill")
                                .font(.caption2)
                            Text(formatDuration(asset.duration))
                                .font(.caption2.weight(.semibold))
                            Spacer()
                        }
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, MeeshySpacing.xs)
                        .padding(.vertical, MeeshySpacing.xxs)
                        .background(LinearGradient(colors: [.black.opacity(0.5), .clear], startPoint: .bottom, endPoint: .top))
                    }
                }

                if isAttached {
                    attachedBadge
                } else if isSelecting {
                    selectionBadge
                }

                if isResolving {
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .fill(Color.black.opacity(0.35))
                    ProgressView().tint(.white)
                }
            }
            .frame(width: cell, height: cell)
            .opacity(isAttached ? 0.45 : 1)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .stroke(Color(hex: accentColor), lineWidth: selectionIndex != nil ? 2 : 0)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(asset.mediaType == .video
            ? String(localized: "composer.a11y.recentVideo", defaultValue: "Vidéo récente", bundle: .main)
            : String(localized: "composer.a11y.recentPhoto", defaultValue: "Photo récente", bundle: .main))
        .accessibilityValue(accessibilityState)
        .contextMenu {
            // `.compactMenu` (iOS 16.4+) renders the three actions as the
            // system horizontal medium-size row (the Messages/Photos pattern);
            // 16.0–16.3 falls back to a plain ControlGroup (stacked items).
            if #available(iOS 16.4, *) {
                ControlGroup { contextActionButtons }
                    .controlGroupStyle(.compactMenu)
            } else {
                ControlGroup { contextActionButtons }
            }
        } preview: {
            RecentMediaPreview(asset: asset, model: model)
        }
        // La tâche est annulée quand la cellule quitte l'écran : le flux se
        // termine et annule sa requête PhotoKit (#9683).
        .task(id: asset.localIdentifier) {
            let px = cell * displayScale
            for await box in model.thumbnails(for: asset, size: CGSize(width: px, height: px)) {
                thumbnail = box.image
            }
        }
        .onAppear { model.cacheThumbnails(around: asset.localIdentifier, pixelSide: cell * displayScale) }
    }

    private var accessibilityState: String {
        if isAttached {
            return String(localized: "composer.recent.alreadyAttached", defaultValue: "Déjà dans les pièces jointes", bundle: .main)
        }
        return selectionIndex != nil
            ? String(localized: "composer.a11y.selectedState", defaultValue: "Sélectionné", bundle: .main)
            : ""
    }

    /// Une coche pleine, en haut à droite, sur une vignette voilée : la pièce
    /// est déjà dans la zone d'attachement.
    private var attachedBadge: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white, Color(hex: accentColor))
                    .padding(MeeshySpacing.xs)
            }
            Spacer()
        }
        .accessibilityHidden(true)
    }

    /// The three context-menu actions: Ajouter / Sélectionner / Éditer.
    /// Éditer only appears when the host wired an editor flow.
    @ViewBuilder private var contextActionButtons: some View {
        Button(action: onAdd) {
            Label(
                String(localized: "composer.recent.add", defaultValue: "Ajouter", bundle: .main),
                systemImage: "plus.circle"
            )
        }
        .disabled(isAttached)
        Button(action: onToggleSelect) {
            Label(
                String(localized: "composer.recent.select", defaultValue: "Sélectionner", bundle: .main),
                systemImage: selectionIndex != nil ? "checkmark.circle.fill" : "checkmark.circle"
            )
        }
        .disabled(isAttached)
        if canEdit {
            Button(action: onEditTap) {
                Label(
                    String(localized: "composer.recent.edit", defaultValue: "Éditer", bundle: .main),
                    systemImage: "pencil"
                )
            }
        }
    }

    /// Top-trailing selection indicator: hollow circle when unselected, an
    /// accent-filled badge carrying the 1-based pick order when selected.
    private var selectionBadge: some View {
        VStack {
            HStack {
                Spacer()
                ZStack {
                    Circle()
                        .fill(selectionIndex != nil ? Color(hex: accentColor) : Color.black.opacity(0.25))
                        .overlay(Circle().stroke(Color.white, lineWidth: MeeshyBorder.emphasis))
                        .frame(width: 22, height: 22)
                    if let selectionIndex {
                        Text("\(selectionIndex + 1)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.white)
                    }
                }
                .padding(MeeshySpacing.xs)
            }
            Spacer()
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        LocalizedNumber.duration(seconds: seconds)
    }
}
