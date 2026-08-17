import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Contenu — le pont entre la géométrie PURE et ce que le lecteur voit

/// Ce que `RiverBubbleView` affiche pour un message. `RiverLaneResolver.RiverBubble`
/// (la loi) ne connaît ni texte ni nom — ce type porte ce que la loi ne
/// porte pas, résolu par l'appelant. Le Prisme (`resolveLastMessagePreview`/
/// `preferredTranslation`) s'applique ICI, côté appelant, comme pour toute
/// bulle du Fil (amendement R) — cette vue ne résout AUCUNE langue.
struct RiverBubbleContent: Equatable {
    let bubble: RiverLaneResolver.RiverBubble
    let senderDisplayName: String
    /// Graine de couleur — PAS un hex déjà résolu. `RiverBubbleView` appelle
    /// elle-même `DynamicColorGenerator.colorForName` (contrat R-133 :
    /// « couleur de ligne par participant via DynamicColorGenerator »).
    let colorSeed: String
    let timeString: String
    let text: String
    let replyPreview: RiverReplyPreview?

    init(
        bubble: RiverLaneResolver.RiverBubble,
        senderDisplayName: String,
        colorSeed: String,
        timeString: String,
        text: String,
        replyPreview: RiverReplyPreview? = nil
    ) {
        self.bubble = bubble
        self.senderDisplayName = senderDisplayName
        self.colorSeed = colorSeed
        self.timeString = timeString
        self.text = text
        self.replyPreview = replyPreview
    }
}

/// « La citation est une RÉFÉRENCE, pas une relecture » (§7ter A4) — une
/// seule ligne tronquée, même règle que `FocalQuotedReplyView`.
struct RiverReplyPreview: Equatable {
    let authorDisplayName: String
    let text: String
}

// MARK: - Initiales — pures, testables sans monter la vue

/// Extrait de la vue pour que `RiverBubbleLayoutTests` puisse l'éprouver
/// sans SwiftUI (§ tests possibles sans runtime UIKit complet).
nonisolated enum RiverBubbleLayout {
    /// Une ou deux lettres majuscules — premier caractère du premier mot, et
    /// du second s'il existe. Purement typographique : le SENS de « Toi »
    /// (résolution `isViewer`) est une affaire de l'appelant, pas de ce
    /// calcul.
    static func initials(for displayName: String) -> String {
        let letters = displayName
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .prefix(2)
            .compactMap { $0.first }
        guard !letters.isEmpty else { return "?" }
        return String(letters).uppercased()
    }
}

// MARK: - La bulle

/// La bulle Rivière — anatomie GELÉE de la rangée plate du Fil (`thread.*`,
/// §7ter A2) posée SUR la ligne de son auteur : contour = trait de la
/// branche (même couleur, même épaisseur — `RiverMetrics.Line.width`),
/// rayon = `RiverMetrics.Bubble.detourRadius` (« le bord de la bulle EST un
/// segment de sa ligne », amendement R).
///
/// **« Le message en ENTIER »** (§7ter A1) : AUCUN `.lineLimit` sur le texte
/// principal — c'est ce qui rend la hauteur du rang MESURÉE plutôt que
/// supposée. La citation d'une réponse, elle, reste UNE ligne tronquée
/// (`RiverReplyPreview`, A4).
///
/// **Ne mesure pas sa propre position.** Elle publie son cadre via
/// `MessageFramePreferenceKey` — la MÊME primitive que le Fil
/// (`Features/Main/Views/MessageFrameTracker.swift`, réutilisée TELLE
/// QUELLE, jamais un second `PreferenceKey` concurrent) — dans le repère
/// `RiverCoordinateSpace.name`. `RiverLaneCanvas` LIT ce cadre pour tracer la
/// ligne ; cette vue ne trace rien, elle pose du texte (garde R15 : aucune
/// géométrie recalculée ici).
struct RiverBubbleView: View, Equatable {
    let content: RiverBubbleContent
    let contentWidth: CGFloat

    @Environment(\.colorScheme) private var colorScheme

    static func == (lhs: RiverBubbleView, rhs: RiverBubbleView) -> Bool {
        lhs.content == rhs.content && lhs.contentWidth == rhs.contentWidth
    }

    private var colorHex: String { DynamicColorGenerator.colorForName(content.colorSeed) }
    private var laneColor: Color { Color(hex: colorHex) }
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            if content.bubble.isFirstInGroup {
                identityHeader
            }

            if let replyPreview = content.replyPreview {
                quotedReply(replyPreview)
            }

            // « Le message en ENTIER » (§7ter A1) — pas de lineLimit ici.
            Text(content.text)
                .font(MeeshyFont.relative(FocalMetrics.Text.size))
                .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: FocalMetrics.Text.size))

            if !content.bubble.isFirstInGroup {
                footerTime
            }
        }
        // `gutter` reste au propriétaire de la COLONNE (`RiverStreamHost`,
        // l'espace EXTÉRIEUR à la bulle où passe le trait) — jamais dupliqué
        // ici : le seul écart interne de cette vue est `baseGap`.
        .padding(.horizontal, RiverMetrics.Bubble.baseGap)
        .padding(.vertical, RiverMetrics.Bubble.baseGap)
        .frame(width: contentWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: RiverMetrics.Bubble.detourRadius, style: .continuous)
                .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
        )
        .overlay(
            RoundedRectangle(cornerRadius: RiverMetrics.Bubble.detourRadius, style: .continuous)
                .strokeBorder(laneColor, lineWidth: RiverMetrics.Line.width)
        )
        .background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: MessageFramePreferenceKey.self,
                    value: [content.bubble.messageId: proxy.frame(in: .named(RiverCoordinateSpace.name))]
                )
            }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    // MARK: - En-tête d'identité (tête de groupe seulement)

    private var identityHeader: some View {
        HStack(spacing: 7) {
            Circle()
                .fill(laneColor)
                .frame(width: FocalMetrics.Avatar.size, height: FocalMetrics.Avatar.size)
                .overlay(
                    Text(RiverBubbleLayout.initials(for: content.senderDisplayName))
                        .font(MeeshyFont.relative(FocalMetrics.Avatar.size / 2, weight: .bold))
                        .foregroundColor(.white)
                )

            Text(content.senderDisplayName)
                .font(MeeshyFont.relative(FocalMetrics.Name.size, weight: FocalMetrics.Name.weight))
                .foregroundColor(laneColor)
                .lineLimit(1)

            Spacer(minLength: 0)

            // « L'heure vit en base de bulle » (amendement R) : en tête de
            // groupe, la base ET la tête portent la même horloge — c'est la
            // règle du Fil (`FocalIdentityHeader`/`FocalMetaRow`, même
            // horodatage dans les deux positions selon qu'un rang ouvre ou
            // prolonge un groupe).
            Text(content.timeString)
                .font(FocalMetrics.Time.font)
                .foregroundColor(metaTint)
        }
    }

    // MARK: - Heure en base de bulle (rangée de suite)

    private var footerTime: some View {
        HStack {
            Spacer(minLength: 0)
            Text(content.timeString)
                .font(FocalMetrics.Time.font)
                .foregroundColor(metaTint)
        }
    }

    private var metaTint: Color {
        isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
    }

    // MARK: - Citation de réponse — une ligne, jamais plus (§7ter A4)

    private func quotedReply(_ reply: RiverReplyPreview) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(laneColor.opacity(0.6))
                .frame(width: FocalMetrics.Quote.railWidth)
            Text("\(reply.authorDisplayName) · \(reply.text)")
                .font(MeeshyFont.relative(FocalMetrics.Text.size - 2))
                .foregroundColor(metaTint)
                .lineLimit(1)
                .padding(.leading, 8)
        }
    }

    // MARK: - Accessibilité

    private var accessibilityLabel: String {
        var parts = [content.senderDisplayName, content.text, content.timeString]
        if let reply = content.replyPreview {
            parts.append(
                String(
                    format: String(localized: "riviere.bubble.replyTo", defaultValue: "en réponse à %@", bundle: .main),
                    reply.authorDisplayName
                )
            )
        }
        return parts.joined(separator: ", ")
    }
}
