import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La forme protégée de l'aperçu d'appui long (#8009)

/// **Ce que l'aperçu d'appui long a le droit de montrer d'un message.**
///
/// Complément porteur du 2026-09-26 : « l'appui long sur un message protégé ne
/// montre plus son contenu ». En Focal et en Script, l'aperçu élevé
/// (`MessageOverlayMenu`, alors sans cadre source) rendait `message.content`
/// et les pièces EN CLAIR : l'appui long contournait le flou et la vue unique
/// que le fil venait de poser. L'aperçu montre désormais la forme protégée — la
/// puce de la vue unique, ou le flou — et ne consomme rien. Depuis #11208, la
/// forme se lit EN AMONT des deux faces de l'aperçu, rangée plate comme bulle
/// (`MessageOverlayCellPreview`).
nonisolated enum OverlayPreviewProtection: Equatable {
    /// Rien de protégé : l'aperçu rend le message.
    case clear
    /// Vue unique : la puce `(1) · …`, jamais le contenu — ouverte ou non.
    case viewOnce(opened: Bool)
    /// Flou : les pièces en tuiles masquées, le texte flouté, rien de lisible.
    case blurred
    /// Chiffré et illisible ici : un cadenas, jamais un clair que l'appareil
    /// n'a pas. Un message chiffré que l'appareil a DÉCHIFFRÉ (il a du texte)
    /// se montre comme le fil le montre.
    case encrypted
    /// Éphémère (flamme, échéance en cours) : l'appui long ne montre ni ne
    /// consomme ce qui brûle — la puce dit seulement qu'il disparaîtra.
    case ephemeral
    /// Disparu : supprimé ou échu. Le fil ne montre plus que sa pierre tombale.
    case gone

    /// Trois formes distinctes pour trois états distincts : le lecteur doit
    /// pouvoir lire POURQUOI l'aperçu ne montre rien. La précédence va du plus
    /// définitif au plus léger : disparu, vue unique, flou, éphémère, chiffré.
    static func form(for message: Message, now: Date = Date()) -> OverlayPreviewProtection {
        if message.deletedAt != nil || (message.expiresAt.map { $0 <= now } ?? false) { return .gone }
        if message.holdsViewOnce { return .viewOnce(opened: message.viewOnceOpenedAt != nil) }
        if message.holdsBlur { return .blurred }
        if message.expiresAt != nil || message.effects.flags.contains(.ephemeral) { return .ephemeral }
        let unreadable = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if message.isEncrypted && unreadable { return .encrypted }
        return .clear
    }

    /// Le pictogramme de la forme, pour les formes à puce unique.
    var chipSymbol: String? {
        switch self {
        case .clear, .viewOnce, .blurred: return nil
        case .encrypted: return "lock.fill"
        case .ephemeral: return "flame.fill"
        case .gone: return "trash.slash"
        }
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

    /// La grille montre quatre pièces au plus (#9950) : celles qu'elle tait se
    /// disent « +N » sur sa DERNIÈRE case, comme la grille de la bulle.
    static let visibleLimit = 4

    static func hiddenCount(total: Int) -> Int {
        max(0, total - visibleLimit)
    }

    /// L'index de la case qui porte « +N », `nil` quand rien n'est tu.
    static func overflowCell(total: Int) -> Int? {
        hiddenCount(total: total) > 0 ? visibleLimit - 1 : nil
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
        let items = Array(attachments.prefix(OverlayPreviewMediaLayout.visibleLimit))
        let overflowCell = OverlayPreviewMediaLayout.overflowCell(total: attachments.count)
        let hidden = OverlayPreviewMediaLayout.hiddenCount(total: attachments.count)
        let rows = OverlayPreviewMediaLayout.rows(
            ratios: items.map(OverlayPreviewMediaLayout.aspectRatio(of:)),
            width: width, spacing: Self.spacing, maxHeight: maxHeight
        )
        VStack(spacing: Self.spacing) {
            ForEach(rows.indices, id: \.self) { rowIndex in
                HStack(spacing: Self.spacing) {
                    ForEach(rows[rowIndex].indices, id: \.self) { cellIndex in
                        let index = Self.flatIndex(rows: rows, row: rowIndex, cell: cellIndex)
                        cell(items[index], size: rows[rowIndex][cellIndex])
                            .overlay {
                                if index == overflowCell {
                                    ZStack {
                                        MeeshyColors.mediaScrim
                                        Text(verbatim: "+\(hidden)")
                                            .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                                            .foregroundColor(.white)
                                    }
                                    .accessibilityHidden(true)
                                }
                            }
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
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
/// Partagée avec l'aperçu d'UNE pièce (`MessagePieceOverlay`, #9907).
struct MaskedMediaTile: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.85)
            Image(systemName: MessageProtectionSymbols.blurredFilled)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .medium))
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
    @Environment(\.bubbleSkin) private var skin

    var body: some View {
        switch form {
        case .clear:
            EmptyView()
        case .viewOnce(let opened):
            ViewOnceChip(state: opened ? .opened : .sealed, isDark: isDark) {}
                .allowsHitTesting(false)
        case .blurred:
            blurred
        case .encrypted, .ephemeral, .gone:
            ProtectedFormChip(form: form, isMe: message.isMe, isDark: isDark, accentHex: accentHex)
        }
    }

    private var visual: [MessageAttachment] {
        message.attachments.filter { $0.type == .image || $0.type == .video }
    }

    private var blurred: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: MeeshySpacing.sm) {
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
            .font(MeeshyFont.relative(MeeshyFont.bodySize))
            .foregroundColor(message.isMe ? skin.ink : (isDark ? .white : .black))
            .blur(radius: 6)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(BubbleBackground(isMe: message.isMe, accentHex: accentHex, isDark: isDark))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
            .overlay {
                Image(systemName: MessageProtectionSymbols.blurredFilled)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundStyle(message.isMe ? skin.ink : (isDark ? .white : .black))
            }
            .accessibilityHidden(true)
    }
}

// MARK: - Le texte de l'aperçu est celui de la cellule (#9838)

/// Ce que l'aperçu de l'appui long recopie de la cellule pressée.
struct OverlayPreviewServedText: Equatable {
    let text: String
    let flags: [String]
    let activeFlag: String?
}

extension MessageOverlayMenu {

    /// **Le texte et les drapeaux de la cellule pressée** (#9838).
    ///
    /// L'aperçu rendait `message.content` — l'ORIGINAL — pendant que la cellule
    /// servait la traduction du Prisme : le fil disait « Plus que 12 jours ❤️ »,
    /// l'appui long « 이제 12일만 기다리면 돼 ❤️ ». Les deux se lisent désormais
    /// dans la MÊME source (`BubbleContent`), avec les mêmes entrées que la
    /// cellule : traduction préférée (override manuel compris), drapeau basculé
    /// dans le fil, langues secondaires. La bande suit la forme de la cellule :
    /// une bulle montre les AUTRES langues (l'active soulignée seulement quand
    /// elle est secondaire), une rangée plate (Focal, Script) y ajoute la langue
    /// affichée, marquée active (`FocalRow.focusFlagCodes`).
    static func previewServedText(
        message: Message,
        textTranslations: [MessageTranslation],
        translatedAudios: [MessageTranslatedAudio],
        preferredTranslation: MessageTranslation?,
        userLanguages: (regional: String?, custom: String?),
        selection: ConversationViewModel.BubbleLanguageSelection?,
        usesFlatRow: Bool = false,
        preferredAudioLangCode: String?,
        currentUserId: String
    ) -> OverlayPreviewServedText {
        let cell = BubbleContent(
            message: message, translations: textTranslations, preferredTranslation: preferredTranslation,
            translatedAudios: translatedAudios, userLanguages: userLanguages,
            secondaryLangCode: selection?.secondaryLangCode,
            activeDisplayLangCode: selection?.activeDisplayLangCode,
            preferredAudioLangCode: preferredAudioLangCode, currentUserId: currentUserId)
        let text = cell.text?.raw ?? message.content
        guard let translation = cell.translation else {
            return OverlayPreviewServedText(text: text, flags: [], activeFlag: nil)
        }
        guard usesFlatRow else {
            return OverlayPreviewServedText(text: text, flags: translation.availableFlags,
                                            activeFlag: selection?.secondaryLangCode)
        }
        let flags = FocalRow.focusFlagCodes(
            originalLangCode: translation.originalLangCode, availableFlags: translation.availableFlags,
            activeLangCode: translation.activeLangCode, limit: FocalMetrics.FocusStrip.flagLimitPlain)
        return OverlayPreviewServedText(text: text, flags: flags, activeFlag: translation.activeLangCode)
    }
}

// MARK: - La puce des formes qui ne montrent rien d'autre qu'elles-mêmes

/// **Chiffré, éphémère, disparu : une puce, un mot.** Le fil ne montre pas le
/// contenu de ces messages ; l'aperçu ne le dévoile pas non plus, mais il dit
/// pourquoi — sans quoi un aperçu vide se lirait comme une panne.
struct ProtectedFormChip: View {
    let form: OverlayPreviewProtection
    let isMe: Bool
    let isDark: Bool
    let accentHex: String
    @Environment(\.bubbleSkin) private var skin

    static func label(for form: OverlayPreviewProtection) -> String {
        switch form {
        case .encrypted:
            return String(localized: "message.overlay.preview.encrypted", defaultValue: "Message chiffré", bundle: .main)
        case .ephemeral:
            return String(localized: "message.overlay.preview.ephemeral", defaultValue: "Message éphémère", bundle: .main)
        case .gone:
            return String(localized: "message.overlay.preview.gone", defaultValue: "Message supprimé", bundle: .main)
        case .clear, .viewOnce, .blurred:
            return ""
        }
    }

    var body: some View {
        let ink: Color = isMe ? skin.ink : (isDark ? .white : .black)
        let label = Self.label(for: form)
        HStack(spacing: MeeshySpacing.sm) {
            if let symbol = form.chipSymbol {
                Image(systemName: symbol)
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
        }
        .foregroundColor(ink)
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(BubbleBackground(isMe: isMe, accentHex: accentHex, isDark: isDark))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}
