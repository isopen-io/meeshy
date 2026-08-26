import SwiftUI
import MeeshyUI

/// Squelette du rang Lentille (contrat §LWS-7, workshop I-066) — géométrie
/// EXACTE de `LentilleConversationRow` : même `LentilleMetrics.Row` (hauteur
/// 64, padding 10/16), même avatar `LentilleMetrics.Avatar` (44), deux
/// barres dérivées des MÊMES polices que le rang réel
/// (`LentilleMetrics.Name.font`, `LentilleMetrics.Line2.font`). Zéro
/// littéral de géométrie propre à ce fichier — chaque cote vient de
/// `LentilleMetrics`, donc aucun saut n'est possible à l'hydratation : le
/// rang réel occupe EXACTEMENT le même volume, dans les deux directions
/// (hauteur du rang, hauteur des deux lignes de texte via leurs polices).
///
/// Vue PURE : elle ne décide RIEN de QUAND s'afficher — c'est la
/// responsabilité du mux (`ConversationRowItem`, `ConversationListView
/// +Rows.swift`, I-067). Aucun `@State`, aucune dépendance à
/// `ConversationListViewModel`.
///
/// Deux barres construites comme du texte REDACTED (`.redacted(reason:
/// .placeholder)`) plutôt que des `RoundedRectangle` à largeur inventée :
/// la largeur d'un texte factice suit naturellement la police du token, sans
/// qu'aucune largeur littérale n'ait besoin d'être choisie ou justifiée —
/// le shimmer système fait le reste.
struct LentilleSkeletonRow: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            Circle()
                .fill(MeeshyColors.textMuted(isDark: isDark).opacity(0.3))
                .frame(width: LentilleMetrics.Avatar.size, height: LentilleMetrics.Avatar.size)
                .redacted(reason: .placeholder)

            VStack(alignment: .leading, spacing: 2) {
                Text(Self.namePlaceholder)
                    .font(LentilleMetrics.Name.font)
                Text(Self.line2Placeholder)
                    .font(LentilleMetrics.Line2.font)
                // Troisième ligne — la date, à droite, comme la rangée réelle
                // (2026-08-22). Sans elle, l'hydratation ferait sauter la
                // ligne 2 d'une ligne entière vers le haut.
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Text(Self.datePlaceholder)
                        .font(LentilleMetrics.Time.font)
                }
            }
            .redacted(reason: .placeholder)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, LentilleMetrics.Row.paddingHorizontal)
        .padding(.vertical, LentilleMetrics.Row.paddingVertical)
        .frame(height: LentilleMetrics.Row.height)
        .accessibilityHidden(true)
    }

    /// Deux gabarits de longueur différente (nom plus court que la ligne 2)
    /// — le shimmer `.redacted` ne lit que la GÉOMÉTRIE du texte, jamais son
    /// contenu littéral (jamais rendu à l'écran).
    private static let namePlaceholder = "Nom de la conversation"
    private static let line2Placeholder = "Aperçu du dernier message en cours de chargement"
    private static let datePlaceholder = "12:00"
}
