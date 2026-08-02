import SwiftUI

/// Bande de glyphes sous la vignette d'une carte de « Mes stories ».
///
/// Entrées primitives et `Equatable` : cette vue est rendue dans une grille,
/// donc dans une boucle. Elle ne porte AUCUN `@ObservedObject` sur un
/// singleton, et ses actions sont des DONNÉES (`[MyStoryGlyph]`) plutôt que
/// des closures — c'est ce qui rend la conformance `Equatable` possible, là
/// où l'ancienne rangée liste (`MyStoryRow`, supprimée avec la migration en
/// grille), générique sur son `MenuContent` et porteuse de quatre closures,
/// ne pouvait structurellement pas l'obtenir.
///
/// La closure d'émission est ignorée par le `==` : deux barres aux mêmes
/// données rendent la même chose, quelle que soit l'identité de la closure.
struct MyStoryActionBar: View, Equatable {
    let glyphs: [MyStoryGlyph]
    /// Compteurs affichés à côté des glyphes qui en portent un. Absent ou nul
    /// → le glyphe est rendu nu, jamais suivi d'un « 0 » décoratif.
    let counts: [MyStoryGlyph: Int]
    let onSelect: (MyStoryGlyph) -> Void
    /// Contenu du menu « … ». Fourni par l'appelant car il dépend du contexte
    /// (story publiée, brouillon) et de ses propres actions.
    let moreMenu: AnyView?

    init(glyphs: [MyStoryGlyph],
         counts: [MyStoryGlyph: Int] = [:],
         moreMenu: AnyView? = nil,
         onSelect: @escaping (MyStoryGlyph) -> Void) {
        self.glyphs = glyphs
        self.counts = counts
        self.moreMenu = moreMenu
        self.onSelect = onSelect
    }

    static func == (lhs: MyStoryActionBar, rhs: MyStoryActionBar) -> Bool {
        lhs.glyphs == rhs.glyphs && lhs.counts == rhs.counts
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(glyphs) { glyph in
                item(glyph)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func item(_ glyph: MyStoryGlyph) -> some View {
        if glyph == .more, let moreMenu {
            Menu { moreMenu } label: { label(glyph) }
                .accessibilityLabel(glyph.accessibilityLabel)
        } else if glyph.isInteractive {
            Button { onSelect(glyph) } label: { label(glyph) }
                .buttonStyle(.plain)
                .accessibilityLabel(glyph.accessibilityLabel)
        } else {
            // Indicateur pur : pas de `Button`, donc aucune promesse d'action.
            label(glyph)
                .accessibilityLabel(glyph.accessibilityLabel)
                .accessibilityValue(counts[glyph].map(String.init) ?? "")
        }
    }

    private func label(_ glyph: MyStoryGlyph) -> some View {
        HStack(spacing: 3) {
            Image(systemName: glyph.systemImage)
                .font(.system(size: 15, weight: .semibold))
            // Jamais de « 0 » décoratif sous la vignette (directive 2026-07-29).
            if let count = counts[glyph], count > 0 {
                Text("\(count)")
                    .font(MeeshyFont.relative(12, weight: .medium))
            }
        }
        .foregroundColor(.secondary)
        // Les glyphes se PARTAGENT la largeur de la carte au lieu d'exiger
        // 44 pt chacun : quatre minimums rigides + espacements + marges
        // faisaient ~194 pt dans une cellule de ~179, la carte debordait de sa
        // colonne et mordait sur la voisine (« les tuiles se chevauchent »).
        // La hauteur de 44 pt tient seule la cible tactile des HIG.
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
}
