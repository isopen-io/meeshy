import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La pastille « 🔥 série · total » (#8906, #9044)

/// Ce que le lecteur a gagné dans une conversation : la flamme, sa série de
/// jours, un point central, puis le total des points depuis toujours, abrégé
/// (« 1,2 k », « 3 M », `CompactCountLabel`). Sans série EN COURS, rien : ni
/// flamme ni points. Les points du jour vivent sous l'avatar replié
/// (`HeaderFlameDecoration`). Même rendu qu'elle, sans capsule ni fond : la
/// flamme en dégradé, puis « série · total » en chiffres rouges cerclés de
/// blanc (`HeaderFlameCount`). Feuille PURE : primitives seulement, portillon
/// `Equatable`.
struct ConversationEngagementPill: View, Equatable {
    let streakDays: Int
    let totalText: String
    let accessibilityText: String

    init?(snapshot: ConversationEngagementSnapshot, accentColor: String, locale: Locale = .current) {
        guard snapshot.streakDays > 0 else { return nil }
        self.streakDays = snapshot.streakDays
        self.totalText = CompactCountLabel.text(snapshot.totalPoints, locale: locale)
        self.accessibilityText = Self.accessibilityText(for: snapshot)
    }

    static func == (lhs: ConversationEngagementPill, rhs: ConversationEngagementPill) -> Bool {
        lhs.streakDays == rhs.streakDays
            && lhs.totalText == rhs.totalText
            && lhs.accessibilityText == rhs.accessibilityText
    }

    /// « série · total » — ce que la pastille écrit à côté de la flamme.
    var text: String { "\(streakDays) · \(totalText)" }

    var body: some View {
        HStack(spacing: 2) {
            HeaderFlameGlyph()
            HeaderFlameCount(text: text)
        }
        .fixedSize()
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
        Group {
            if let shown = store.displayed(for: conversationId, seed: seed, at: Date()),
               let pill = ConversationEngagementPill(snapshot: shown, accentColor: accentColor) {
                pill.equatable()
            }
        }
        .task(id: seed) { store.seed(seed) }
    }
}

// MARK: - La série dans la liste « 🔥4 · 120 » (#9025, total abrégé #9044)

/// À côté de l'heure de la rangée au repos : la série en jours et le total des
/// points, en ROUGE, sans capsule (directive porteur 2026-10-01). Se tait tant
/// qu'aucune série ne court. Feuille PURE, portillon `Equatable`.
struct ConversationStreakMark: View, Equatable {
    let streakDays: Int
    let totalText: String
    let accessibilityText: String

    init?(snapshot: ConversationEngagementSnapshot?, locale: Locale = .current) {
        guard let snapshot, snapshot.streakDays > 0 else { return nil }
        self.streakDays = snapshot.streakDays
        self.totalText = CompactCountLabel.text(snapshot.totalPoints, locale: locale)
        self.accessibilityText = ConversationEngagementPill.accessibilityText(for: snapshot)
    }

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "flame.fill")
                .imageScale(.small)
            Text(verbatim: "\(streakDays)")
            Text(verbatim: "·")
            Text(verbatim: totalText)
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
