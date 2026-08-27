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

/// **OÙ l'éventail a le droit de se peindre** — la règle de PLACEMENT.
///
/// Elle est la jumelle de `ComposerFormatFanPolicy` et répond à une question
/// DIFFÉRENTE : celle-ci dit s'il y a quelque chose à OFFRIR (un chip unique
/// n'est pas un choix), celle-là disait si la surface montée pouvait SUPPORTER
/// une bascule sans perdre ce qui est composé.
///
/// **La frontière qu'elle gardait est LEVÉE depuis B1/B2 (#3924/#3925), et
/// c'est le fond du chantier B.** Jadis l'éventail était tenu hors du document
/// de `.feedComposer` : son offre contient `.story` (et, dès qu'un média
/// qualifie, `.reel`), que le routage envoie à la SCÈNE, et un auteur qui y
/// tapait son post puis choisissait « Story » voyait sa saisie disparaître —
/// rien ne faisait entrer du texte dans un canvas. La règle NOMMAIT elle-même
/// sa condition de levée : « un écrivain public de TEXTE atteignable par le
/// meuble ». Elle est REMPLIE :
///
/// - B1 (`StoryComposerViewModel.applyContentText`) fait suivre le TEXTE, et
///   `applyContentMedia` le MÉDIA, vers la scène qui naît ;
/// - B2 (la section description repliable) partage ce texte dans les deux sens ;
/// - le média local reste l'état du MEUBLE (`documentLocalMedia`), donc un
///   retour scène→document ne perd que les objets AJOUTÉS sur le canvas —
///   inhérent à une surface plate, jamais une saisie effacée.
///
/// Le contenu PARTAGÉ suivant désormais la bascule dans les deux sens, l'éventail
/// se peint là où il est VISIBLE : `paints` rend `true` partout, et `mounts` se
/// réduit à `isVisible`. C'est ce qui fait de l'éventail le SEUL sélecteur de
/// mode (B3, #3926) — le sélecteur de destination contextuel du document
/// (`documentDestinationSelector`, F1) est retiré, et RÉEL rejoint STORY sur la
/// scène (le média prend le canvas), comme la directive produit le pose.
///
/// **Les paramètres `surface`/`opening` restent** pour les appelants et les
/// gardes, et parce qu'une frontière pourrait renaître (un futur format sans
/// chemin de transfert) ; ils ne CONTRAIGNENT simplement plus, la frontière
/// qu'ils portaient n'existant plus.
nonisolated enum ComposerFormatFanPlacement {

    /// `true` PARTOUT depuis B1/B2 : le contenu partagé (texte, média,
    /// description) suit la bascule document↔scène dans les deux sens, si bien
    /// qu'aucune surface ne crée plus de porte à sens unique. Voir le doc de
    /// l'enum pour la condition de levée que ce `true` acquitte.
    static func paints(
        surface: ComposerSurfaceKind,
        opening: ComposerOpening,
        offeredFormats: [ComposerFormat]
    ) -> Bool {
        true
    }

    /// **Les DEUX règles de l'éventail, lues à UN seul endroit.**
    ///
    /// La CONJONCTION reste écrite ici, à UN seul endroit, même si `paints` rend
    /// désormais `true` : la garder rend la visibilité seule maîtresse du
    /// montage aujourd'hui, ET laisse `paints` reprendre la main le jour où une
    /// frontière renaîtrait, sans qu'aucun appelant n'ait à changer. La règle
    /// qui écarte la CRÉATION de mood est donc toujours la visibilité : son
    /// offre est unique (`[.status]`), et un chip unique est une affordance sans
    /// choix — la rangée VIDE que la loi 4 nomme.
    static func mounts(
        surface: ComposerSurfaceKind,
        opening: ComposerOpening,
        offeredFormats: [ComposerFormat]
    ) -> Bool {
        ComposerFormatFanPolicy.isVisible(offeredFormats: offeredFormats)
            && paints(surface: surface, opening: opening, offeredFormats: offeredFormats)
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
