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

/// **OÙ l'éventail a le droit de se peindre** — la règle de PLACEMENT (lot 4.7).
///
/// Elle est la jumelle de `ComposerFormatFanPolicy` et répond à une question
/// DIFFÉRENTE, qu'il ne faut jamais confondre avec elle : celle-ci dit s'il y a
/// quelque chose à OFFRIR (un chip unique n'est pas un choix), celle-là dit si
/// la surface montée peut SUPPORTER une bascule. Les deux se lisent ensemble —
/// une création de mood autorise le placement et n'offre pourtant rien — et
/// elles se lisent à UN seul endroit, `mounts` : voir son doc-comment.
///
/// *L'éventail se peint là où TOUS les formats offerts atterrissent du MÊME
/// côté de la frontière « scène / pas de scène » que la surface montée.*
///
/// Cette frontière-là, et pas une autre, parce que c'est elle qui sépare deux
/// ÉTATS. `documentText`, `moodEmoji` et l'audience sont l'état du MEUBLE : ils
/// suivent toute bascule entre document et mood. La composition d'une scène,
/// elle, vit dans l'atelier — et rien ne fait entrer du texte dans un CANVAS,
/// mesuré sur les 14 fichiers `StoryComposerViewModel*.swift` : aucun écrivain
/// public de l'atelier n'accepte du texte.
///
/// **La règle est SYMÉTRIQUE depuis le 2026-08-25, et elle ne l'était pas.** Sa
/// branche `.scene` rendait `true` SANS CONDITION, au motif que `.cameraReady`,
/// `.videoCameraReady` et `.resume` rendent `.scene` quel que soit le format.
/// C'était vrai de ces TROIS ouvertures et faux de la BRANCHE : le routage monte
/// aussi la scène sur `.keyboardOnContent` + `.story` / `.reel`. Une porte de ce
/// profil peignait donc l'éventail à l'ouverture puis le PERDAIT au premier tap
/// vers un format-document — une porte à SENS UNIQUE, c'est-à-dire le défaut
/// même que cette règle existe pour nommer.
///
/// **Le cas qui l'a imposée a été TRANCHÉ au lot 5, et pas dans le sens qu'on
/// attendait.** `.conversationMedia` portait `opensWith: .keyboardOnContent` et
/// une offre `[.story, .post]` : la règle rendait donc `false`, et câbler la
/// porte telle quelle aurait livré trois formats déclarés sans aucun contrôle.
/// C'est le PROFIL qui a cédé, pas la règle — son ouverture est devenue
/// `.mediaSeeded`, qui envoie ses trois formats sur la scène. La règle a fait
/// exactement ce qu'on lui demandait : elle a nommé un défaut avant qu'un
/// utilisateur ne le voie. Les portes de production n'en changent pas d'un
/// pixel — toutes ouvrent sur une capture, une reprise ou une graine, où tous
/// les formats atterrissent sur la scène.
///
/// Le cas qui rend cette règle nécessaire dans l'AUTRE sens est
/// `.feedComposer` : son offre contient `.story`, que le routage envoie à la
/// scène. Descendre l'éventail sous son document ferait disparaître la saisie
/// sans un mot, sur la porte la plus fréquentée de l'app. Sa condition de levée
/// est côté SDK — un écrivain public de TEXTE atteignable par le meuble — et
/// l'éventail y descendra AVEC le transfert de la saisie, jamais avant lui.
///
/// La porte de REPUBLICATION D'UN MOOD, elle, n'offre que `[.status, .post]` :
/// deux formats qui restent sur des surfaces sans atelier. C'est ce que cette
/// règle rend visible et que l'ancien montage — le plateau coiffant la seule
/// scène — confondait avec le cas précédent.
///
/// **Le paramètre `opening` n'est pas redondant avec `surface`.** La surface
/// montée ne dit que le format COURANT ; c'est l'ouverture qui permet de savoir
/// où atterriraient les AUTRES.
nonisolated enum ComposerFormatFanPlacement {

    static func paints(
        surface: ComposerSurfaceKind,
        opening: ComposerOpening,
        offeredFormats: [ComposerFormat]
    ) -> Bool {
        func monteUneScene(_ format: ComposerFormat) -> Bool {
            ComposerSurfaceRouting.surface(opening: opening, format: format) == .scene
        }
        switch surface {
        case .scene:
            return offeredFormats.allSatisfy(monteUneScene)
        case .document, .mood:
            return offeredFormats.allSatisfy { !monteUneScene($0) }
        }
    }

    /// **Les DEUX règles de l'éventail, lues à UN seul endroit.**
    ///
    /// La CONJONCTION est elle-même une règle, et l'écrire chez l'appelant — un
    /// `body`, une propriété du meuble — la rendrait invisible aux tests : c'est
    /// ainsi qu'une règle produit se met à exister en deux exemplaires. La
    /// mesure qui l'a imposée est une mutation : remplacer ce `&&` par un `||`
    /// laissait VERTES les quatre gardes de source qui entouraient l'ancienne
    /// écriture — toutes cherchaient la PRÉSENCE des deux symboles, aucune leur
    /// conjonction — et repeignait l'éventail sous le document de
    /// `.feedComposer`, la régression exacte que `paints` existe pour empêcher.
    ///
    /// L'ordre des deux termes n'a aucun effet sur le résultat ; il en a un sur
    /// la lecture. « Y a-t-il quelque chose à offrir ? » précède « où le
    /// poser ? ». C'est aussi ce premier terme, et lui seul, qui écarte la
    /// CRÉATION de mood : son placement est autorisé (aucun de ses formats ne
    /// renvoie à une scène) et son offre est unique. Sans lui, le plateau y
    /// monterait une rangée VIDE — seize points de remplissage vertical en haut
    /// d'un écran livré, ce que la loi 4 nomme.
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
