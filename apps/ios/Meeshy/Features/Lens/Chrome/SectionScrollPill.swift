import SwiftUI
import MeeshyUI

/// Pilule de défilement de la Lentille (contrat LWS-6, §4.3 colonne « Liste »
/// : ancrée `top 64`, fondu `250 ms`, effacement `ScrollTimePillLaw.lingerMs`
/// après l'arrêt — cette valeur n'est jamais recopiée en dur ici, garde R15).
///
/// Vue D'AFFICHAGE PURE : `isVisible` et `text` sont INJECTÉS par l'appelant
/// (I-062/I-063), jamais calculés ici. Aucun `@State`, aucun timer, aucun
/// observateur de défilement — la loi d'activité (visible au premier
/// `.scrolled`, invisible `ScrollTimePillLaw.lingerMs` après le dernier) vit
/// dans `ScrollTimePillLaw` (`Focal/Core/ScrollTimePillLaw.swift`, GELÉE S1,
/// partagée avec la pilule du fil par l'amendement A4) : cette vue ne la
/// réimplémente jamais, elle se contente de RENDRE l'état qu'on lui donne.
///
/// Toutes les cotes viennent de `LentilleMetrics.Pill` (`top`,
/// `fadeDurationMs`) — aucun littéral de loi en dur ici (garde R15). La
/// typographie/le padding du libellé ne sont PAS spécifiés par le contrat
/// §4.3 pour cette pilule (seules `top`/fondu le sont) : ils réutilisent des
/// tokens système déjà existants (`MeeshyFont.footnoteSize`, `MeeshySpacing`,
/// `MeeshyRadius.full`), jamais une valeur inventée.
public struct SectionScrollPill: View {

    public let isVisible: Bool
    public let text: String

    public init(isVisible: Bool, text: String) {
        self.isVisible = isVisible
        self.text = text
    }

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    public var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
            .padding(.vertical, MeeshySpacing.xs)
            .padding(.horizontal, MeeshySpacing.sm)
            .background(.ultraThinMaterial, in: Capsule())
            .opacity(SectionScrollPill.opacity(isVisible: isVisible))
            .animation(.easeInOut(duration: SectionScrollPill.fadeDurationSeconds), value: isVisible)
            .padding(.top, LentilleMetrics.Pill.top)
            .allowsHitTesting(false)
    }
}

extension SectionScrollPill {
    /// Opacité affichée — fonction pure, testable indépendamment du rendu
    /// SwiftUI. Le délai d'effacement après le dernier défilement n'est pas
    /// modélisé ici : c'est `ScrollTimePillLaw.isVisible` (Focal/Core) qui
    /// décide `isVisible`, injecté par l'appelant. `nonisolated` : même
    /// précédent que `LentilleSticker.displayTitle` (cible app MainActor par
    /// défaut, tests nonisolated).
    nonisolated public static func opacity(isVisible: Bool) -> Double { isVisible ? 1 : 0 }

    /// `LentilleMetrics.Pill.fadeDurationMs` est en millisecondes ;
    /// `Animation.easeInOut(duration:)` attend des secondes — conversion
    /// pure, aucune constante de loi nouvelle. `nonisolated` — voir `opacity`
    /// ci-dessus.
    nonisolated public static var fadeDurationSeconds: Double {
        LentilleMetrics.Pill.fadeDurationMs / 1000
    }
}
