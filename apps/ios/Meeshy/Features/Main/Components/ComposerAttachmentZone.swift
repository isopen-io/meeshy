import SwiftUI
import MeeshySDK
import MeeshyUI

// **LA ZONE D'ATTACHEMENT, UNE FOIS** (#9736).
//
// La tuile d'une pièce en attente vivait en méthode de `ConversationView`,
// liée à `composerState` : aucun autre hôte ne pouvait la monter, et les
// commentaires affichaient à sa place une pastille de texte — un nom, pas un
// aperçu. La zone, la tuile, la pastille de retrait, la tuile d'un lieu et le
// dessin d'un son sont ici, sans état : le message et les commentaires
// montent les MÊMES vues et n'y versent que leurs données.

// ============================================================================
// MARK: - ComposerAttachmentZone
// ============================================================================

/// Le plateau horizontal des pièces en attente, posé au-dessus du champ.
struct ComposerAttachmentZone<Content: View>: View {
    let accentColor: String
    @ViewBuilder var content: () -> Content

    static var height: CGFloat { 100 }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.md) {
                content()
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .frame(height: Self.height)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }
}

// ============================================================================
// MARK: - ComposerAttachmentTile
// ============================================================================

/// La tuile 56×56 d'une pièce prête : vignette (ou dessin de son type),
/// glyphe « Éditer » au centre quand toucher l'édite, retrait en coin, libellé
/// dessous.
struct ComposerAttachmentTile: View {
    static let side: CGFloat = 56
    static let labelWidth: CGFloat = 60

    let thumbnail: UIImage?
    /// Dessin propre au type quand il n'y a pas de vignette (onde d'un son,
    /// épingle d'un lieu). `nil` ⇒ dégradé à la teinte de la pièce.
    var art: AnyView? = nil
    let tint: String
    let typeGlyph: String
    /// Le glyphe central : présent ⇒ toucher la tuile l'édite.
    let centerGlyph: String?
    let label: String
    let tapAccessibilityLabel: String
    let removeAccessibilityLabel: String
    /// `nil` ⇒ toucher la tuile ne fait rien, et elle ne se rend pas en
    /// bouton : un contrôle sans effet n'est pas annoncé (loi 4).
    let onTap: (() -> Void)?
    let onRemove: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ZStack(alignment: .topTrailing) {
                if let onTap {
                    Button {
                        HapticFeedback.light()
                        onTap()
                    } label: {
                        tile
                    }
                    .accessibilityLabel(tapAccessibilityLabel)
                } else {
                    tile
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(tapAccessibilityLabel)
                }

                ComposerAttachmentRemoveBadge(accessibilityLabel: removeAccessibilityLabel, action: onRemove)
            }

            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: Self.labelWidth)
        }
    }

    private var tile: some View {
        ZStack {
            face
            if let centerGlyph {
                Image(systemName: centerGlyph)
                    // Doctrine 86i : glyphe borné par la tuile fixe 56×56 → figé ; le bouton porte le libellé.
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MeeshyColors.mediaChromeForeground)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(MeeshyColors.mediaChromeFill))
                    .accessibilityHidden(true)
            }
        }
        .frame(width: Self.side, height: Self.side)
    }

    @ViewBuilder
    private var face: some View {
        if let thumbnail {
            Image(uiImage: thumbnail)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: Self.side, height: Self.side)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        } else if let art {
            art
        } else {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: tint), Color(hex: tint).opacity(MeeshyOpacity.heavy)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: Self.side, height: Self.side)

            if centerGlyph == nil {
                Image(systemName: typeGlyph)
                    // Doctrine 86i : glyphe de type décoratif borné par la tuile fixe 56×56 → figé + masqué
                    // (le libellé sous la tuile porte le nom du fichier).
                    .font(.system(size: 22))
                    .foregroundColor(.white)
                    .accessibilityHidden(true)
            }
        }
    }
}

// ============================================================================
// MARK: - ComposerAttachmentRemoveBadge
// ============================================================================

/// Le ✕ rouge posé sur le coin haut-droit d'une tuile.
struct ComposerAttachmentRemoveBadge: View {
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                // Doctrine 82i : glyphe de suppression dans un cadre tap fixe 18×18 → figé.
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 18, height: 18)
                .background(
                    Circle()
                        .fill(MeeshyColors.error)
                        .shadow(color: MeeshyColors.error.opacity(0.4), radius: 3, y: 1)
                )
        }
        .accessibilityLabel(accessibilityLabel)
        .offset(x: 5, y: -5)
    }
}

// ============================================================================
// MARK: - ComposerPlaceTile
// ============================================================================

/// La tuile d'un lieu en attente d'envoi — même gabarit que celle d'une pièce.
struct ComposerPlaceTile: View {
    let place: SharedPlace
    let onRemove: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let label = MediaKindLabel.placeLabel(place.name)
        return VStack(spacing: MeeshySpacing.xs) {
            ZStack(alignment: .topTrailing) {
                ComposerLocationTileArt()
                ComposerAttachmentRemoveBadge(
                    accessibilityLabel: String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(label)", bundle: .main),
                    action: onRemove
                )
            }

            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: ComposerAttachmentTile.labelWidth)
        }
    }
}

/// L'épingle sur fond vert d'un lieu.
struct ComposerLocationTileArt: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.successDeep],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: ComposerAttachmentTile.side, height: ComposerAttachmentTile.side)

            VStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "mappin.circle.fill")
                    // Doctrine 86i : glyphe décoratif borné par la tuile fixe 56×56 → figé + masqué.
                    .font(.system(size: 22))
                    .foregroundStyle(.white, .white.opacity(MeeshyOpacity.medium))
                    .accessibilityHidden(true)
                Circle()
                    .fill(Color.white.opacity(MeeshyOpacity.medium))
                    .frame(width: 8, height: 4)
                    .scaleEffect(x: 1.8, y: 1)
            }
        }
    }
}

// ============================================================================
// MARK: - ComposerAudioTileArt
// ============================================================================

/// L'onde d'un son en attente, à la teinte de la pièce.
struct ComposerAudioTileArt: View {
    let tint: String
    var isPlaying: Bool = false

    private static let bars: [CGFloat] = [0.3, 0.8, 0.5, 1.0, 0.4, 0.9, 0.6]

    var body: some View {
        let color = Color(hex: tint)
        return ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(MeeshyOpacity.heavy)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: ComposerAttachmentTile.side, height: ComposerAttachmentTile.side)

            HStack(spacing: 1.5) {
                ForEach(Self.bars.indices, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.white.opacity(isPlaying ? 0.9 : 0.6))
                        .frame(width: 2, height: 4 + 14 * Self.bars[index])
                }
            }
            .frame(height: 20)
        }
    }
}

// ============================================================================
// MARK: - ComposerAttachmentLoadingArt
// ============================================================================

/// La face d'une pièce posée dont le fichier n'est pas encore lu
/// (photothèque, iCloud) : elle occupe sa place AUSSITÔT, et se remplit.
struct ComposerAttachmentLoadingArt: View {
    let tint: String

    var body: some View {
        ZStack {
            Color(hex: tint).shimmer()
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white)
        }
        .frame(width: ComposerAttachmentTile.side, height: ComposerAttachmentTile.side)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        .accessibilityLabel(String(localized: "attachment.loading.a11y-loading", defaultValue: "Chargement en cours", bundle: .main))
    }
}
