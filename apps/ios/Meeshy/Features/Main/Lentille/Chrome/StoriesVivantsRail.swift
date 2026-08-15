import SwiftUI
import MeeshyUI

/// Entrée du rail « vivants » de la Lentille — fusion `StoryTrayView` +
/// conversations vivantes (contrat LWS-6, point 5). Modèle d'ENTRÉE minimal,
/// propriété de cette vue Chrome PURE : le mappage depuis les données réelles
/// (stories, appels en direct) est le travail de la peau qui MONTE ce rail
/// (LWS-6/I-063), pas de cette micro-tâche.
///
/// `nonisolated` : type de données pur, aucune dépendance UI — la cible app
/// infère `@MainActor` par défaut (`SWIFT_DEFAULT_ACTOR_ISOLATION`), et sans
/// cette sortie explicite les tests nonisolated du bundle `MeeshyTests` ne
/// pourraient ni le construire ni le comparer sans `await` (même précédent
/// que `LentilleSectionResolver.SectionableConversation`).
nonisolated public struct LentilleRailEntry: Identifiable, Equatable, Sendable {
    public let id: String
    public let displayName: String
    public let avatarURL: String?
    /// Anneau pulsé (§4.3 « anneau 3.5 (pulsé si live) ») — `true`
    /// UNIQUEMENT pour un direct effectivement en cours, jamais un badge
    /// décoratif. La PULSATION elle-même (animation) est un raffinement du
    /// montage (LWS-6/I-063) : cette vue pure ne fait que teindre l'anneau
    /// différemment, sans introduire d'état d'animation ici.
    public let isLive: Bool

    public init(id: String, displayName: String, avatarURL: String? = nil, isLive: Bool = false) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.isLive = isLive
    }
}

/// Politique pure du rail — testable indépendamment de tout rendu SwiftUI.
/// `nonisolated` — même précédent que `LentilleRailEntry` ci-dessus.
nonisolated public enum LentilleRailPolicy {
    /// `≤ 6` entrées (`LentilleMetrics.Rail.maxEntries`, §4.3) — troncature
    /// simple, jamais un filtrage arbitraire : l'ordre et la sélection des
    /// entrées visibles sont la responsabilité de l'appelant.
    public static func visibleEntries(_ entries: [LentilleRailEntry]) -> [LentilleRailEntry] {
        Array(entries.prefix(LentilleMetrics.Rail.maxEntries))
    }

    /// Masqué si vide (règle explicite du workshop) — la vue rend
    /// `EmptyView` plutôt qu'un rail vide avec un fond visible.
    public static func shouldRender(_ entries: [LentilleRailEntry]) -> Bool {
        !visibleEntries(entries).isEmpty
    }
}

/// Rail vivants & stories de la Lentille (contrat LWS-6, §4.3 colonne
/// « Liste ») — pastille `48`, anneau `3.5`, `≤ 6` entrées, masquée si vide.
///
/// Vue PURE : `entries` est injecté par l'appelant, aucun `@State` de
/// défilement, aucun observateur — `PinnedStoryTrailBand` et le routage tap
/// story restent, comme le veut le contrat, du ressort du montage
/// (LWS-6/I-063), jamais de cette vue.
///
/// Toutes les cotes viennent de `LentilleMetrics.Rail` — aucun littéral de
/// loi en dur ici (garde R15).
public struct StoriesVivantsRail: View {

    public let entries: [LentilleRailEntry]

    public init(entries: [LentilleRailEntry]) {
        self.entries = entries
    }

    @ViewBuilder
    public var body: some View {
        let visible = LentilleRailPolicy.visibleEntries(entries)
        if visible.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(visible) { entry in
                        LentilleRailEntryView(entry: entry)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
            }
        }
    }
}

/// Rendu d'une entrée du rail — sous-vue privée, jamais montée seule.
private struct LentilleRailEntryView: View {
    let entry: LentilleRailEntry

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ZStack {
                Circle()
                    .strokeBorder(ringColor, lineWidth: LentilleMetrics.Rail.ringWidth)
                    .frame(width: LentilleMetrics.Rail.size, height: LentilleMetrics.Rail.size)

                avatarContent
                    .frame(width: avatarDiameter, height: avatarDiameter)
                    .clipShape(Circle())
            }

            Text(entry.displayName)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                .lineLimit(1)
                .frame(width: LentilleMetrics.Rail.size)
        }
    }

    private var avatarDiameter: CGFloat {
        LentilleMetrics.Rail.size - LentilleMetrics.Rail.ringWidth * 2
    }

    private var ringColor: Color {
        entry.isLive ? MeeshyColors.brandPrimary : MeeshyColors.textMuted(isDark: isDark)
    }

    @ViewBuilder
    private var avatarContent: some View {
        if let raw = entry.avatarURL, let url = URL(string: raw) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                placeholderFill
            }
        } else {
            placeholderFill
        }
    }

    private var placeholderFill: some View {
        Circle().fill(MeeshyColors.backgroundSecondary(isDark: isDark))
    }
}
