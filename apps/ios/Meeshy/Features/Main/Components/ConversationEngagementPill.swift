import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La pastille « 🔥 série · N (M) » (#8906)

/// Ce que le lecteur a gagné dans une conversation : sa série de jours (la
/// flamme, tue quand elle est à 0), puis « N (M) » — N points depuis toujours,
/// M aujourd'hui. Feuille PURE : primitives seulement, portillon `Equatable`.
struct ConversationEngagementPill: View, Equatable {
    let streakDays: Int
    let pointsText: String
    let accessibilityText: String
    let accentColor: String

    init(snapshot: ConversationEngagementSnapshot, accentColor: String) {
        self.streakDays = snapshot.streakDays
        self.pointsText = snapshot.pointsText
        self.accessibilityText = Self.accessibilityText(for: snapshot)
        self.accentColor = accentColor
    }

    static func == (lhs: ConversationEngagementPill, rhs: ConversationEngagementPill) -> Bool {
        lhs.streakDays == rhs.streakDays
            && lhs.pointsText == rhs.pointsText
            && lhs.accessibilityText == rhs.accessibilityText
            && lhs.accentColor == rhs.accentColor
    }

    private var accent: Color { Color(hex: accentColor) }

    var body: some View {
        HStack(spacing: 3) {
            if streakDays > 0 {
                Image(systemName: "flame.fill")
                    .imageScale(.small)
                Text(verbatim: "\(streakDays)")
                Text(verbatim: "·")
                    .opacity(0.6)
            }
            Text(verbatim: pointsText)
        }
        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold, design: .rounded).monospacedDigit())
        .foregroundColor(accent)
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, MeeshySpacing.xsPlus)
        .padding(.vertical, MeeshySpacing.xxs)
        .background(Capsule(style: .continuous).fill(accent.opacity(MeeshyOpacity.light)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    static func accessibilityText(for snapshot: ConversationEngagementSnapshot) -> String {
        let total = snapshot.totalPoints
        let today = snapshot.todayPoints
        guard snapshot.streakDays > 0 else {
            return String(
                localized: "conversation.engagement.a11y.points",
                defaultValue: "Points : \(total) · Aujourd'hui : \(today)",
                bundle: .main
            )
        }
        let streak = snapshot.streakDays
        return String(
            localized: "conversation.engagement.a11y.streak",
            defaultValue: "Série de jours : \(streak) · Points : \(total) · Aujourd'hui : \(today)",
            bundle: .main
        )
    }
}

// MARK: - L'hôte : lit le magasin, sème ce que la conversation porte

/// Monté là où la pastille se montre — l'en-tête de conversation — jamais sur
/// les rangées de la liste, qui portent la série (`ConversationStreakMark`) : il observe
/// `ConversationEngagementStore`, qui ne publie qu'au gré des gestes crédités
/// du lecteur. `seed` est l'instantané que la conversation affichée porte déjà
/// (liste, détail, cache) ; le plus récent des deux gagne.
struct ConversationEngagementBadge: View {
    let conversationId: String
    let seed: ConversationEngagementSnapshot?
    let accentColor: String
    @ObservedObject var store: ConversationEngagementStore = .shared

    var body: some View {
        if let shown = store.displayed(for: conversationId, seed: seed, at: Date()) {
            ConversationEngagementPill(snapshot: shown, accentColor: accentColor)
                .equatable()
                .task(id: seed) { store.seed(seed) }
        }
    }
}

// MARK: - La série dans la liste « 🔥4 · 120 » (#9025)

/// À côté de l'heure de la rangée au repos : la série en jours et le total des
/// points, en ROUGE, sans capsule (directive porteur 2026-10-01). Se tait tant
/// qu'aucune série ne court. Feuille PURE, portillon `Equatable`.
struct ConversationStreakMark: View, Equatable {
    let streakDays: Int
    let totalPoints: Int
    let accessibilityText: String

    init?(snapshot: ConversationEngagementSnapshot?) {
        guard let snapshot, snapshot.streakDays > 0 else { return nil }
        self.streakDays = snapshot.streakDays
        self.totalPoints = snapshot.totalPoints
        self.accessibilityText = ConversationEngagementPill.accessibilityText(for: snapshot)
    }

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "flame.fill")
                .imageScale(.small)
            Text(verbatim: "\(streakDays)")
            Text(verbatim: "·")
            Text(verbatim: "\(totalPoints)")
        }
        .font(LentilleMetrics.Time.font.monospacedDigit())
        .foregroundColor(MeeshyColors.error)
        .lineLimit(1)
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }
}

/// L'hôte de la série sur une rangée au repos : lit le magasin (un geste
/// crédité sur cet appareil) et l'instantané que la liste a servi, le plus
/// récent gagne. Le magasin ne publie qu'au gré des gestes crédités du
/// lecteur ; la feuille, `Equatable`, ne se repeint que si sa série change.
struct ConversationStreakMarkHost: View {
    let conversationId: String
    let seed: ConversationEngagementSnapshot?
    @ObservedObject var store: ConversationEngagementStore = .shared

    var body: some View {
        if let mark = ConversationStreakMark(snapshot: store.displayed(for: conversationId, seed: seed, at: Date())) {
            mark.equatable()
        }
    }
}
