import SwiftUI
import MeeshyUI

/// **L'éventail** — le sélecteur de format du composer unifié (C3).
///
/// `ComposerProfile.offeredFormats` était renseigné sur les 8 branches de la
/// table depuis C1 et n'avait aucun lecteur : la porte décidait de l'éventail,
/// et rien ne le peignait. Cette vue est ce lecteur, et la règle qu'elle
/// applique tient en une phrase — la **loi 4** : *un format non offert est
/// ABSENT, jamais grisé*.
///
/// La conséquence la plus contre-intuitive de cette loi est ici : un éventail
/// qui n'offre qu'UN format ne s'affiche pas du tout. Un chip unique serait une
/// affordance sans choix — l'UI morte que la loi 4 nomme.
nonisolated enum ComposerFormatFanPolicy {

    /// « Un éventail à une seule entrée ne montre donc aucun sélecteur »
    /// (`ComposerProfile.offeredFormats`, C1).
    static func isVisible(offeredFormats: [ComposerFormat]) -> Bool {
        offeredFormats.count > 1
    }

    /// La sélection ne sort JAMAIS de l'éventail.
    ///
    /// L'éventail respire (V1 : le réel n'est offert que tant que la
    /// composition qualifie). Une sélection restée sur un format retiré
    /// peindrait un éventail sans aucun chip marqué. Elle retombe donc sur le
    /// premier format offert — qui est toujours le format propre de la porte,
    /// par l'invariant de C1 « l'éventail contient toujours `initialFormat` ».
    ///
    /// Rien d'offert : on rend ce qu'on a reçu. Inventer un format ici ferait
    /// publier ce que la porte n'a jamais proposé.
    static func resolvedSelection(
        current: ComposerFormat,
        offeredFormats: [ComposerFormat]
    ) -> ComposerFormat {
        guard !offeredFormats.contains(current) else { return current }
        return offeredFormats.first ?? current
    }
}

/// Libellés de l'éventail, résolus par le catalogue `.main` — même idiome que
/// `StoryTrayCopy`. Écrits ici plutôt qu'en littéraux dans la vue : un libellé
/// posé en ligne échappe au cliquet de complétude et n'est jamais traduit.
nonisolated enum ComposerFormatCopy {
    static func label(_ format: ComposerFormat) -> String {
        switch format {
        case .story:
            return String(localized: "composer.format.story", defaultValue: "Story", bundle: .main)
        case .post:
            return String(localized: "composer.format.post", defaultValue: "Post", bundle: .main)
        case .reel:
            return String(localized: "composer.format.reel", defaultValue: "Réel", bundle: .main)
        case .status:
            return String(localized: "composer.format.status", defaultValue: "Mood", bundle: .main)
        }
    }

    static var selector: String {
        String(localized: "composer.format.a11y.selector",
               defaultValue: "Format de publication", bundle: .main)
    }
}

/// Le voile du chip sélectionné, NOMMÉ pour que la mesure de contraste porte sur
/// ce qui est réellement peint. Un `0.22` recopié dans le test mesurerait une
/// surface que la vue pourrait cesser de peindre sans que rien ne le dise —
/// c'est le défaut D-18, dans l'autre sens.
nonisolated enum ComposerFormatFanPalette {
    static var selectedFill: Color { MeeshyColors.indigo400.opacity(0.22) }
}

struct ComposerFormatFan: View {

    let offeredFormats: [ComposerFormat]
    @Binding var selection: ComposerFormat

    var body: some View {
        Group {
            if ComposerFormatFanPolicy.isVisible(offeredFormats: offeredFormats) {
                fan
            }
        }
    }

    /// L'itération porte sur `offeredFormats` et sur rien d'autre : la table de
    /// C1 reste la seule source. `enumerated()` plutôt que `id: \.self` —
    /// `ComposerFormat` est `Equatable`, pas `Hashable`, et le rendre `Hashable`
    /// pour le seul confort d'un `ForEach` élargirait un modèle gelé.
    private var fan: some View {
        HStack(spacing: 4) {
            ForEach(Array(offeredFormats.enumerated()), id: \.offset) { entry in
                chip(entry.element)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerFormatCopy.selector))
    }

    /// Le chip SÉLECTIONNÉ se marque par sa surface, pas par la couleur de son
    /// texte : l'accent `indigo400` est un jeton de COMPOSANT (mesuré à 3:1),
    /// et l'utiliser comme texte l'aurait fait tomber sous le seuil AA du texte
    /// normal sur les trois teintes du plateau.
    private func chip(_ format: ComposerFormat) -> some View {
        let isSelected = format == selection
        return Button {
            selection = format
        } label: {
            Text(ComposerFormatCopy.label(format))
                .font(.footnote.weight(.semibold))
                .foregroundColor(isSelected
                                 ? MeeshyColors.textPrimary(isDark: true)
                                 : MeeshyColors.textSecondary(isDark: true))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule().fill(isSelected ? ComposerFormatFanPalette.selectedFill : Color.clear)
                )
        }
        .accessibilityAddTraits(isSelected ? AccessibilityTraits.isSelected : [])
    }
}
