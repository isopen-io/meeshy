import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La pastille « 🔥 série · total » (#8906, #9044, #9571)

/// Ce que le lecteur a gagné dans une conversation, en TROIS formes
/// (`ConversationPointsForm`, miroir de `engagementPillModel` du web) :
/// - une série COURT : la flamme, la série de jours, un point central, puis le
///   total des points depuis toujours, abrégé (« 1,2 k », `CompactCountLabel`),
///   en chiffres rouges cerclés de blanc (`HeaderFlameCount`) ;
/// - aucune série : le cumul SEUL, sans flamme, à l'encre tertiaire — le rouge
///   reste la couleur de la série (directive porteur 2026-10-07) ;
/// - cumul nul : rien.
/// Les points du jour vivent sous l'avatar replié (`HeaderFlameDecoration`),
/// qui ne paraît que si une série court. Feuille PURE : primitives seulement,
/// portillon `Equatable`.
struct ConversationEngagementPill: View, Equatable {
    /// 0 : la forme « cumul seul ».
    let streakDays: Int
    let totalText: String
    let accessibilityText: String

    init?(snapshot: ConversationEngagementSnapshot, accentColor: String, locale: Locale = .current) {
        guard let form = ConversationPointsForm.of(snapshot) else { return nil }
        self.streakDays = form.streakDays
        self.totalText = CompactCountLabel.text(form.totalPoints, locale: locale)
        self.accessibilityText = Self.accessibilityText(for: snapshot)
    }

    static func == (lhs: ConversationEngagementPill, rhs: ConversationEngagementPill) -> Bool {
        lhs.streakDays == rhs.streakDays
            && lhs.totalText == rhs.totalText
            && lhs.accessibilityText == rhs.accessibilityText
    }

    /// « série · total » à côté de la flamme ; le cumul seul sans série.
    var text: String { streakDays > 0 ? "\(streakDays) · \(totalText)" : totalText }

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if streakDays > 0 {
                HStack(spacing: 2) {
                    HeaderFlameGlyph()
                    HeaderFlameCount(text: text)
                }
            } else {
                Text(verbatim: totalText)
                    .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundColor(MeeshyColors.textMuted(isDark: colorScheme == .dark))
                    .lineLimit(1)
            }
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    /// « 120 points gagnés dans cette conversation » — la phrase du cumul seul (#9571).
    static func totalAccessibilityText(_ total: Int) -> String {
        let number = "\(total)"
        return total == 1
            ? String(localized: "conversation.engagement.a11y.total.one",
                     defaultValue: "\(number) point gagné dans cette conversation", bundle: .main)
            : String(localized: "conversation.engagement.a11y.total.other",
                     defaultValue: "\(number) points gagnés dans cette conversation", bundle: .main)
    }

    static func accessibilityText(for snapshot: ConversationEngagementSnapshot) -> String {
        let total = snapshot.totalPoints
        let today = snapshot.todayPoints
        guard snapshot.streakDays > 0 else {
            return totalAccessibilityText(total)
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

// MARK: - La marque dans la liste « 🔥4 · 120 » / « 120 » (#9025, #9044, #9571)

/// À côté de l'heure de la rangée : tant qu'une série court, la série en jours
/// et le total des points, en ROUGE, sans capsule (directive porteur
/// 2026-10-01) ; sans série, le cumul SEUL, sans flamme, à l'encre tertiaire de
/// l'heure ; cumul nul : rien (`ConversationPointsForm`). Feuille PURE,
/// portillon `Equatable`.
struct ConversationStreakMark: View, Equatable {
    /// 0 : la forme « cumul seul ».
    let streakDays: Int
    let totalText: String
    let accessibilityText: String
    var isDark: Bool = false

    init?(snapshot: ConversationEngagementSnapshot?, locale: Locale = .current, isDark: Bool = false) {
        guard let snapshot, let form = ConversationPointsForm.of(snapshot) else { return nil }
        self.streakDays = form.streakDays
        self.totalText = CompactCountLabel.text(form.totalPoints, locale: locale)
        self.accessibilityText = ConversationEngagementPill.accessibilityText(for: snapshot)
        self.isDark = isDark
    }

    var body: some View {
        HStack(spacing: 2) {
            if streakDays > 0 {
                Image(systemName: "flame.fill")
                    .imageScale(.small)
                Text(verbatim: "\(streakDays)")
                Text(verbatim: "·")
            }
            Text(verbatim: totalText)
        }
        .font(LentilleMetrics.Time.font.monospacedDigit())
        .foregroundColor(streakDays > 0 ? MeeshyColors.error : MeeshyColors.textMuted(isDark: isDark))
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
    var isDark: Bool = false
    @ObservedObject var store: ConversationEngagementStore = .shared

    var body: some View {
        if let mark = ConversationStreakMark(snapshot: store.displayed(for: conversationId, seed: seed, at: Date()),
                                             isDark: isDark) {
            mark.equatable()
        }
    }
}
