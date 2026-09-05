import SwiftUI

// **Quelle VUE le meuble monte, et s'il y a une scène à l'écran** (#4070, #4513).
//
// Fichier à part depuis #4756, pour la raison que la directive du 2026-08-28
// impose : `MeeshyComposerHost.swift` portait 1 197 lignes contre un plafond
// DUR de 1 200, et le magasin de textes alternatifs devait y poser son `@State`.
// On extrait d'abord, on ajoute ensuite.
//
// La coupe suit une question ENTIÈRE — « quelle surface, et quelle vue dans
// cette surface ? » — dont les trois membres se lisent sans rien savoir du
// reste du meuble : deux règles pures (`ComposerStoryCanvas.showsCanvas`,
// `ComposerMountedView.mounted`) et l'aiguillage qui les consomme.
//
// Le glob `MeeshyComposerHost+*.swift` d'`AppSourceGuard.unitURLs` l'attrape
// sans qu'aucune adresse soit à tenir à jour — c'est exactement pourquoi le nom
// porte celui du type hôte, et pourquoi les gardes qui lisent « le meuble » ne
// voient pas cette découpe.

extension MeeshyComposerHost {

    // MARK: - Les trois surfaces (V2, élargies au mood par le lot 4)

    /// Le meuble a TROIS surfaces, et c'est `ComposerSurfaceRouting` qui tranche
    /// — jamais une condition écrite ici. La règle vit à côté de la surface
    /// document parce qu'elle est éprouvable sans monter la moindre vue ; la
    /// recopier dans le `body` l'aurait rendue muette aux tests.
    ///
    /// Le socle, lui, ne dépend d'aucune des trois : il reste sous toutes
    /// (loi 5 — le socle ne bouge jamais).
    /// **Quatre vues, une par contexte** (#4070). La règle est PURE
    /// (`ComposerMountedView`) et séparée du routage : celui-ci dit quelle
    /// SURFACE le format appelle, celle-là quelle VUE cette surface monte une
    /// fois qu'on sait s'il y a une scène.
    ///
    /// Le `switch` est exhaustif : une cinquième vue casse la compilation ici,
    /// avant de pouvoir diverger en silence.

    /// **La vue réellement MONTÉE** — et c'est elle, jamais le kind de surface,
    /// qui répond à « y a-t-il une scène à l'écran ? ».
    ///
    /// Elle était calculée en ligne dans l'aiguillage. Un second site en a eu
    /// besoin — l'historique (#4402) — et a interrogé `mountedSurface` à la
    /// place : ça compilait, et ça ne pouvait jamais rendre vrai, la scène
    /// incrustée étant un `.document` QUI A une scène. Une valeur lue à un seul
    /// endroit ne peut pas être lue de travers ailleurs.
    /// **Le prédicat de PRÉSENCE de la scène — un seul, pour la vue ET pour sa
    /// branche** (#4513).
    ///
    /// Il existait en DEUX exemplaires, et la bascule de #4513 les a fait
    /// diverger visiblement : `mountedComposerView` lisait `showsCanvas(...)`
    /// (vrai pour une story, même vide — une story EST ses canvas), tandis que
    /// `ComposerDocumentSurface(showsScene:)` recevait `documentHasScene` (faux
    /// tant que rien n'est posé, la slide semée ne comptant pas comme matière).
    ///
    /// Tant que `.document + hasScene` montait `ComposerSceneSurface`, l'écart
    /// ne se voyait pas : la scène était peinte par l'autre vue. Depuis que le
    /// document la porte lui-même, la story ouverte n'avait plus AUCUN canvas —
    /// la vue disait « il y a une scène », sa branche disait « non ».
    ///
    /// > Deux prédicats qui répondent à la même question restent d'accord tant
    /// > qu'un seul est consulté. C'est le jour où le second est branché que
    /// > l'écart devient un écran vide — et aucun témoin ne rougit, puisque
    /// > chacun est juste séparément.
    ///
    /// Mesuré au simulateur, pas au gate : 263 témoins verts au-dessus de cette
    /// régression.
    var sceneIsPresent: Bool {
        ComposerStoryCanvas.showsCanvas(format: selectedFormat,
                                        documentHasScene: documentHasScene)
    }

    var mountedComposerView: ComposerMountedView {
        ComposerMountedView.mounted(
            surface: mountedSurface,
            // **Une story a toujours son canvas** (directive porteur
            // 2026-09-01). `documentHasScene` demande « y a-t-il de la matière
            // à cadrer ? », la bonne question pour un post dont la scène est
            // une incrustation optionnelle. Une story EST ses canvas : lui
            // poser le prédicat du post la laisserait sur l'écran document tant
            // qu'elle est vide — au moment précis où elle en a besoin.
            //
            // La substitution se fait ICI et pas dans `documentHasScene`, dont
            // le MOOD est l'autre lecteur : y injecter le format ferait décider
            // l'offre de formats par le format déjà choisi.
            hasScene: sceneIsPresent
        )
    }

    @ViewBuilder
    var surface: some View {
        switch mountedComposerView {
        case .atelier:
            composerSurface
        case .scene:
            sceneSurface
        case .document:
            documentSurface
        case .mood:
            moodSurface
        }
    }
}
