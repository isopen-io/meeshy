import SwiftUI
import MeeshyUI

// MARK: - La barre du mode sélection (#4005, #16532)

/// **Où la barre de sélection se pose** (#16532) — une loi pure.
///
/// Le dock du composer ignore la zone sûre basse : chaque zone qu'il porte se
/// relève elle-même. La barre REMPLACE le composer, elle se pose donc sur SON
/// sol (`ComposerBottomClearance.required`) : au-dessus de l'indicateur
/// d'accueil d'un iPhone à Face ID, à distance du bord d'un iPhone SE, sans
/// saut quand l'un remplace l'autre.
nonisolated enum ConversationSelectionBarLayout {

    /// La largeur maximale de la capsule : sur iPad, elle ne s'étire jamais
    /// d'un bord à l'autre.
    static let maxWidth: CGFloat = 560

    /// La marge latérale de la capsule sur iPhone.
    static let sideMargin: CGFloat = 16

    /// La cible tactile minimale de chaque action (HIG).
    static let minimumTarget: CGFloat = 44

    /// L'air entre le bas de la capsule et le bas de l'écran.
    static func floor(safeAreaBottom: CGFloat) -> CGFloat {
        ComposerBottomClearance.required(safeAreaBottom: max(safeAreaBottom, 0))
    }

    /// La largeur rendue de la capsule pour une largeur de fenêtre donnée —
    /// ce que produisent `.frame(maxWidth: maxWidth)` puis les marges.
    static func width(available: CGFloat) -> CGFloat {
        min(max(available - 2 * sideMargin, 0), maxWidth)
    }
}

/// **La barre d'action du mode sélection** : Annuler · Supprimer · compteur ·
/// Transférer, dans une capsule Liquid Glass flottante.
///
/// Petit écran ou grande taille de texte : la rangée libellée cède à une
/// rangée d'icônes, dont chaque bouton garde son libellé VoiceOver.
struct ConversationSelectionBar: View {
    let selectedCount: Int
    let offersForward: Bool
    let accentColor: String
    let safeAreaBottom: CGFloat
    let onCancel: () -> Void
    let onDelete: () -> Void
    let onForward: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            row(compact: false)
            row(compact: true)
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.xs)
        .adaptiveLiquidGlass(in: Capsule())
        .frame(maxWidth: ConversationSelectionBarLayout.maxWidth)
        .padding(.horizontal, ConversationSelectionBarLayout.sideMargin)
        .frame(maxWidth: .infinity)
        .padding(.bottom, ConversationSelectionBarLayout.floor(safeAreaBottom: safeAreaBottom))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("conversation.selection.bar")
    }

    private var hasSelection: Bool { selectedCount > 0 }

    private func row(compact: Bool) -> some View {
        HStack(spacing: compact ? MeeshySpacing.xs : MeeshySpacing.sm) {
            cancelButton(compact: compact)
            deleteButton
            Spacer(minLength: MeeshySpacing.xs)
            countLabel
            Spacer(minLength: MeeshySpacing.xs)
            if offersForward {
                forwardButton(compact: compact)
            }
        }
    }

    private func cancelButton(compact: Bool) -> some View {
        Button(action: onCancel) {
            Group {
                if compact {
                    Image(systemName: "xmark")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                } else {
                    Text(Self.cancelTitle)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                        .lineLimit(1)
                        .fixedSize()
                }
            }
            .foregroundStyle(.primary)
            .padding(.horizontal, compact ? 0 : MeeshySpacing.sm)
            .frame(minWidth: ConversationSelectionBarLayout.minimumTarget,
                   minHeight: ConversationSelectionBarLayout.minimumTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.cancelTitle)
        .accessibilityIdentifier("conversation.selection.cancel")
    }

    // #4024 — Supprimer, à côté d'Annuler. Ouvre la confirmation groupée —
    // jamais de suppression directe sans confirmation.
    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Image(systemName: "trash")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(MeeshyColors.error)
                .frame(width: ConversationSelectionBarLayout.minimumTarget,
                       height: ConversationSelectionBarLayout.minimumTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!hasSelection)
        .opacity(hasSelection ? 1 : 0.4)
        .accessibilityLabel(MessageDeleteConfirmation.title(count: selectedCount))
        .accessibilityIdentifier("conversation.selection.delete")
    }

    // #4023 — « N sélectionnés » tout court, et SEULEMENT au-delà d'un élément.
    @ViewBuilder
    private var countLabel: some View {
        if selectedCount >= 2 {
            Text(Self.countTitle(selectedCount))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .accessibilityIdentifier("conversation.selection.count")
        }
    }

    private func forwardButton(compact: Bool) -> some View {
        Button(action: onForward) {
            Group {
                if compact {
                    Image(systemName: "arrowshape.turn.up.right.fill")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                } else {
                    Label(Self.forwardTitle, systemImage: "arrowshape.turn.up.right.fill")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .lineLimit(1)
                        .fixedSize()
                }
            }
            .foregroundStyle(Color(hex: accentColor))
            .padding(.horizontal, compact ? 0 : MeeshySpacing.md)
            .frame(minWidth: ConversationSelectionBarLayout.minimumTarget,
                   minHeight: ConversationSelectionBarLayout.minimumTarget)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!hasSelection)
        .opacity(hasSelection ? 1 : 0.4)
        .accessibilityLabel(Self.forwardTitle)
        .accessibilityIdentifier("conversation.selection.forward")
    }

    private static var cancelTitle: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)
    }

    private static var forwardTitle: String {
        String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
    }

    /// Un simple `%d` suffit : le compte ne dépasse jamais `selectionCap`.
    private static func countTitle(_ count: Int) -> String {
        let format = String(localized: "conversation.selection.count", defaultValue: "%d sélectionnés", bundle: .main)
        return String(format: format, count)
    }
}
