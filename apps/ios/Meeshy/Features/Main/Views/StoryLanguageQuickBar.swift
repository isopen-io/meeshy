import SwiftUI
import MeeshyUI
import MeeshySDK

/// Barre horizontale des langues déjà prêtes pour la story courante, ouverte
/// par le bouton « Abc » du rail. Chaque pastille bascule instantanément la
/// langue d'exploration (Prisme Linguistique — « Exploration ») ; la pastille
/// « + » en fin de rangée ouvre la liste complète (toutes les langues, avec
/// demande de traduction).
///
/// Reprise du geste « accès rapide + (+) » demandé après le retrait du strip de
/// drapeaux du 2026-07-25 : le strip d'avant ne montrait que les langues déjà
/// traduites et imposait un second tap pour en demander une autre ; ici le (+)
/// fait ce second chemin explicitement, à droite de la rangée qui défile.
///
/// App-side : c'est de l'orchestration UX produit (câble les langues prêtes de
/// la story + décide « le + ouvre la liste complète »). Le SDK fournit l'atome
/// `LanguagePickerSheet` pour la liste complète.
struct StoryLanguageQuickBar: View {
    let languages: [TranslationLanguage]
    /// Langue effectivement affichée (override d'exploration ou tête de chaine
    /// préférée) — la pastille correspondante est surlignée.
    let activeLanguageCode: String?
    let onSelect: (String) -> Void
    let onOpenFullPicker: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(languages) { language in
                    chip(language)
                }
                plusChip
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.35)))
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(String(localized: "story.viewer.language.bar",
                                         defaultValue: "Langues disponibles", bundle: .main)))
    }

    private func chip(_ language: TranslationLanguage) -> some View {
        let isActive = StoryLanguageQuickBar.isActive(language.id, active: activeLanguageCode)
        return Button {
            HapticFeedback.light()
            onSelect(language.id)
        } label: {
            HStack(spacing: 4) {
                Text(language.flag)
                Text(language.id.uppercased())
                    .font(MeeshyFont.relative(11, weight: .bold, design: .monospaced))
            }
            .foregroundColor(.white.opacity(isActive ? 1 : 0.75))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(isActive ? MeeshyColors.indigo500.opacity(0.9)
                                        : Color.white.opacity(0.10))
            )
            .overlay(
                Capsule().stroke(isActive ? Color.white.opacity(0.6) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(language.name))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private var plusChip: some View {
        Button {
            HapticFeedback.light()
            onOpenFullPicker()
        } label: {
            Image(systemName: "plus")
                .font(MeeshyFont.relative(13, weight: .bold))
                .foregroundColor(.white.opacity(0.9))
                .padding(10)
                .background(Circle().fill(Color.white.opacity(0.14)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "story.viewer.language.more",
                                         defaultValue: "Autres langues", bundle: .main)))
    }

    /// Une pastille est active si sa langue est celle actuellement affichée.
    /// Comparaison insensible à la casse et sur la base BCP-47 (`pt-BR` ↔ `pt`)
    /// pour que la langue lue soit toujours surlignée, variantes régionales
    /// comprises. Pur et sans effet de bord — testé isolément.
    nonisolated static func isActive(_ id: String, active: String?) -> Bool {
        guard let active else { return false }
        let lhs = id.lowercased()
        let rhs = active.lowercased()
        if lhs == rhs { return true }
        let lhsBase = lhs.split(separator: "-").first.map(String.init)
        let rhsBase = rhs.split(separator: "-").first.map(String.init)
        return lhsBase != nil && lhsBase == rhsBase
    }
}
