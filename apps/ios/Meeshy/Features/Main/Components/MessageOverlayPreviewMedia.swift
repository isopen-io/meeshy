import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La forme protégée de l'aperçu d'appui long (#8009)

/// **Ce que l'aperçu d'appui long a le droit de montrer d'un message.**
///
/// Complément porteur du 2026-09-26 : « l'appui long sur un message protégé ne
/// montre plus son contenu ». En Focal et en Script, l'aperçu élevé
/// (`MessageOverlayMenu`, chemin sans cadre source) rendait `message.content`
/// et les pièces EN CLAIR : l'appui long contournait le flou et la vue unique
/// que le fil venait de poser. L'aperçu montre désormais la forme protégée — la
/// puce de la vue unique, ou le flou — et ne consomme rien.
nonisolated enum OverlayPreviewProtection: Equatable {
    /// Rien de protégé : l'aperçu rend le message.
    case clear
    /// Vue unique : la puce `(1) · …`, jamais le contenu — ouverte ou non.
    case viewOnce(opened: Bool)
    /// Flou : les pièces en tuiles masquées, le texte flouté, rien de lisible.
    case blurred

    static func form(for message: Message) -> OverlayPreviewProtection {
        if message.holdsViewOnce { return .viewOnce(opened: message.viewOnceOpenedAt != nil) }
        return message.holdsBlur ? .blurred : .clear
    }
}

// MARK: - Les pièces à leur rapport d'aspect ORIGINAL

/// **La disposition des pièces dans l'aperçu d'appui long** — pure, testable
/// sans rendu. Chaque pièce garde le rapport d'aspect de ses dimensions
/// (`width`/`height`) : ni rognée (`.fill` dans un cadre imposé), ni étirée.
/// Les rangées portent deux pièces au plus, qui partagent une hauteur ; trois
/// pièces font une rangée d'une puis une de deux. L'ensemble se réduit
/// UNIFORMÉMENT quand il dépasse la hauteur offerte.
nonisolated enum OverlayPreviewMediaLayout {

    /// Largeur ÷ hauteur de la pièce ; un carré quand ses dimensions manquent.
    static func aspectRatio(of attachment: MessageAttachment) -> CGFloat {
        guard let width = attachment.width, let height = attachment.height,
              width > 0, height > 0 else { return 1 }
        return CGFloat(width) / CGFloat(height)
    }

    /// La taille de chaque cellule, rangée par rangée, dans l'ordre reçu.
    static func rows(ratios: [CGFloat], width: CGFloat, spacing: CGFloat, maxHeight: CGFloat) -> [[CGSize]] {
        let groups = grouping(ratios)
        let natural = groups.map { group -> [CGSize] in
            let usable = width - spacing * CGFloat(group.count - 1)
            let height = usable / group.reduce(0, +)
            return group.map { CGSize(width: $0 * height, height: height) }
        }
        let gaps = spacing * CGFloat(max(0, natural.count - 1))
        let total = natural.compactMap { $0.first?.height }.reduce(0, +)
        guard total + gaps > maxHeight, total > 0 else { return natural }
        let scale = max(0, maxHeight - gaps) / total
        return natural.map { row in row.map { CGSize(width: $0.width * scale, height: $0.height * scale) } }
    }

    private static func grouping(_ ratios: [CGFloat]) -> [[CGFloat]] {
        guard ratios.count != 3 else { return [[ratios[0]], Array(ratios[1...])] }
        return stride(from: 0, to: ratios.count, by: 2).map { Array(ratios[$0..<min($0 + 2, ratios.count)]) }
    }
}

// MARK: - La grille de l'aperçu

/// La grille visuelle de l'aperçu d'appui long, à la disposition ci-dessus.
/// `masked` rend des tuiles « Contenu masqué » sans charger aucun pixel.
struct OverlayPreviewMediaGrid: View {
    let attachments: [MessageAttachment]
    let masked: Bool
    var width: CGFloat = 260
    var maxHeight: CGFloat = 320

    private static let spacing: CGFloat = 3

    var body: some View {
        let items = Array(attachments.prefix(4))
        let rows = OverlayPreviewMediaLayout.rows(
            ratios: items.map(OverlayPreviewMediaLayout.aspectRatio(of:)),
            width: width, spacing: Self.spacing, maxHeight: maxHeight
        )
        VStack(spacing: Self.spacing) {
            ForEach(rows.indices, id: \.self) { rowIndex in
                HStack(spacing: Self.spacing) {
                    ForEach(rows[rowIndex].indices, id: \.self) { cellIndex in
                        cell(items[Self.flatIndex(rows: rows, row: rowIndex, cell: cellIndex)],
                             size: rows[rowIndex][cellIndex])
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private static func flatIndex(rows: [[CGSize]], row: Int, cell: Int) -> Int {
        rows.prefix(row).map(\.count).reduce(0, +) + cell
    }

    @ViewBuilder
    private func cell(_ attachment: MessageAttachment, size: CGSize) -> some View {
        if masked {
            MaskedMediaTile()
                .frame(width: size.width, height: size.height)
        } else {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil,
                fullUrl: attachment.fileUrl.isEmpty ? attachment.thumbnailUrl : attachment.fileUrl
            ) {
                Color(hex: attachment.thumbnailColor).opacity(0.3)
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: size.width, height: size.height)
            .clipped()
        }
    }
}

/// Une pièce masquée : aucun pixel du média, le seul pictogramme du flou.
private struct MaskedMediaTile: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.85)
            Image(systemName: MessageProtectionSymbols.blurredFilled)
                .font(MeeshyFont.relative(18, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
        }
        .accessibilityHidden(true)
    }
}

// MARK: - L'aperçu d'un message protégé

/// L'aperçu d'appui long d'un message PROTÉGÉ — la forme que le fil montre, et
/// rien de plus. Aucun geste n'y est câblé : l'appui long ne dévoile ni ne
/// consomme.
struct OverlayProtectedPreview: View {
    let form: OverlayPreviewProtection
    let message: Message
    let isDark: Bool
    let accentHex: String

    var body: some View {
        switch form {
        case .clear:
            EmptyView()
        case .viewOnce(let opened):
            ViewOnceChip(state: opened ? .opened : .sealed, isDark: isDark) {}
                .allowsHitTesting(false)
        case .blurred:
            blurred
        }
    }

    private var visual: [MessageAttachment] {
        message.attachments.filter { $0.type == .image || $0.type == .video }
    }

    private var blurred: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 8) {
            if !visual.isEmpty {
                OverlayPreviewMediaGrid(attachments: visual, masked: true)
            }
            if !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || visual.count < message.attachments.count {
                blurredBubble
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProtectedVeilAffordance.hiddenLabel)
    }

    /// Le texte flouté comme dans le fil — sa forme, jamais sa lecture : une
    /// ligne de substitution de même longueur, floutée, que VoiceOver ignore.
    private var blurredBubble: some View {
        Text(verbatim: String(repeating: "▆ ", count: max(3, min(24, message.content.count / 3))))
            .font(MeeshyFont.relative(15))
            .foregroundColor(message.isMe ? .white : (isDark ? .white : .black))
            .blur(radius: 6)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(BubbleBackground(isMe: message.isMe, accentHex: accentHex, isDark: isDark))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                Image(systemName: MessageProtectionSymbols.blurredFilled)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundStyle(message.isMe ? .white : (isDark ? .white : .black))
            }
            .accessibilityHidden(true)
    }
}
