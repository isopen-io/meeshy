import SwiftUI
import MeeshyUI

/// Sticker de section de la Lentille (contrat LWS-6, §4.3 colonne « Liste ») —
/// vue PURE, sans montage : `10.5` poids `800` (`.heavy`), letter-spacing
/// `.1em`, majuscules, padding `4/13`. La qualité « sticky » (épinglage en
/// haut de section) est une propriété du CONTENEUR (`LazyVStack(pinnedViews:)`
/// + `Section {} header: {}`), pas de cette vue — elle est posée par LWS-6/I-062,
/// pas ici.
///
/// Réutilise `expandedSections`/`toggleSection`/`persistCategoryExpansion`
/// (contrat LWS-6, "consommés inchangés") via un simple closure `onToggle`
/// injecté : quand `onToggle` est fourni, le sticker devient un
/// `Button(.plain)` (jamais `.onTapGesture` — règle dure du workshop) ; quand
/// il est `nil`, le sticker est un simple libellé non interactif (ex. section
/// `pinned`, non repliable dans la peau d'aujourd'hui).
///
/// Toutes les cotes viennent de `LentilleMetrics.Sticker` — aucun littéral de
/// loi en dur ici (garde R15).
public struct LentilleSticker: View {

    public let title: String
    public var isExpanded: Bool
    public var onToggle: (() -> Void)?

    public init(title: String, isExpanded: Bool = true, onToggle: (() -> Void)? = nil) {
        self.title = title
        self.isExpanded = isExpanded
        self.onToggle = onToggle
    }

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @ViewBuilder
    public var body: some View {
        if let onToggle {
            Button(action: onToggle) { label }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
        } else {
            label
        }
    }

    private var label: some View {
        HStack(spacing: 0) {
            Text(LentilleSticker.displayTitle(title))
                .tracking(LentilleSticker.letterSpacing)
                .font(MeeshyFont.relative(LentilleMetrics.Sticker.size, weight: LentilleMetrics.Sticker.weight))
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
            Spacer(minLength: 0)
            // D5 — `isExpanded` était DÉCLARÉ, STOCKÉ, et jamais lu : replier
            // une section rendait deux bandes rigoureusement identiques
            // empilées (mesuré : `MEESHY TEAM` y=199.3 puis `CETTE SEMAINE`
            // y=228.7, aucun rang entre), que rien ne distinguait d'un défaut
            // de rendu. Le groupeur n'était pas en cause — les deux chemins
            // filtrent bien les buckets vides ; c'est le sticker qui taisait
            // ce qu'il savait déjà.
            //
            // Conditionné à `onToggle != nil` : une section calculée n'est pas
            // repliable, un chevron y mentirait sur ce que le toucher fait.
            //
            // `chevron.forward` et non `chevron.right` : le symbole directionnel
            // suit le sens de lecture, donc il s'inverse de lui-même en RTL —
            // là où `.right` resterait à droite en arabe.
            if onToggle != nil {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.forward")
                    .font(MeeshyFont.relative(LentilleMetrics.Sticker.size, weight: LentilleMetrics.Sticker.weight))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                    // Décoratif : l'état est porté par le bouton lui-même, et
                    // VoiceOver annoncerait sinon « chevron » entre le titre de
                    // section et son action.
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, LentilleMetrics.Sticker.paddingVertical)
        .padding(.horizontal, LentilleMetrics.Sticker.paddingHorizontal)
        .background(MeeshyColors.backgroundSecondary(isDark: isDark))
    }
}

extension LentilleSticker {
    /// Le sticker affiche TOUJOURS son titre en majuscules (§4.3 « majuscules »).
    /// Fonction pure, testable indépendamment du rendu SwiftUI. `nonisolated` :
    /// la cible app infère `@MainActor` par défaut
    /// (`SWIFT_DEFAULT_ACTOR_ISOLATION`) — sans cette sortie explicite, les
    /// tests nonisolated du bundle `MeeshyTests` ne pourraient l'appeler sans
    /// `await` (même précédent que `LentilleSectionResolver`).
    nonisolated public static func displayTitle(_ raw: String) -> String { raw.uppercased() }

    /// Letter-spacing en points — `.1em` est relatif à la taille de police
    /// (§4.3), jamais un point fixe : dérivé de `LentilleMetrics.Sticker.size`
    /// × `LentilleMetrics.Sticker.letterSpacingEm`, aucune constante nouvelle.
    /// `nonisolated` — voir `displayTitle` ci-dessus.
    nonisolated public static var letterSpacing: CGFloat {
        LentilleMetrics.Sticker.size * LentilleMetrics.Sticker.letterSpacingEm
    }
}
