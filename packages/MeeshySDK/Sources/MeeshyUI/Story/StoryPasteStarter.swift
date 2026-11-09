import SwiftUI
import UniformTypeIdentifiers
import MeeshySDK

// MARK: - La capsule « Coller » — règles pures
//
// Elles vivaient en `static` de `StoryComposerView`, l'atelier du SDK retiré au
// #15629 ; la capsule et le rail du composer unifié les lisent ici.

public nonisolated enum StoryPasteStarter {
    /// Règle PURE de l'offre de collage.
    /// `hasResolver` est l'injection app-side (`\.storyPaste`) : sans elle,
    /// personne ne sait lire le presse-papier et la capsule n'est pas rendue.
    nonisolated public static func offers(hasResolver: Bool, canAddMedia: Bool) -> Bool {
        hasResolver && canAddMedia
    }

    /// Ce que la capsule « Coller » accepte.
    ///
    /// **Cette liste EST la directive produit du 2026-08-23** — « on doit
    /// pouvoir coller des images, des documents dont les stickers, et ça doit
    /// être pris en compte et propagé ». La réduire aux images ne rendrait pas
    /// le collage d'un document impossible : elle rendrait la capsule INERTE
    /// devant lui, et le presse-papier ne dit jamais pourquoi rien ne s'est
    /// passé. `.item` ferme la liste, comme sur la cible de dépôt de la barre de
    /// conversation : ce que le composer ne sait pas peindre est ANNONCÉ
    /// app-side, jamais avalé.
    /// **RESTREINTE au #4378** :
    ///
    /// > « que coller n'apparaisse que si on a une image, un texte ou vidéo dans
    /// > le presse-papier »
    ///
    /// `.item` acceptait TOUT : `PasteButton` se croyait donc toujours servi, et
    /// « Coller » s'affichait quel que soit le contenu du presse-papier —
    /// l'affordance sans effet que la loi 4 interdit.
    ///
    /// **Ce n'est pas une annulation de la directive du 2026-08-23**, qui
    /// voulait qu'un document collé soit ANNONCÉ plutôt qu'avalé. Elle est
    /// RESTREINTE : ce qui n'est ni image, ni vidéo, ni son, ni texte n'est plus
    /// proposé du tout — il n'y a donc plus rien à annoncer sur ce chemin. La
    /// succession se consigne ; elle ne s'efface pas.
    ///
    /// Le TEXTE y entre en même temps que `StoryPastedItem.text` : l'accepter
    /// sans savoir le poser aurait rendu la capsule active devant un
    /// presse-papier qu'elle ne sait pas servir — pire que de ne pas l'accepter.
    nonisolated public static let contentTypes: [UTType] = [
        .image, .movie, .audio, .plainText, .utf8PlainText
    ]
}

/// C5b — la capsule « Coller » des amorces de page blanche.
///
/// Feuille de vue autonome, comme `BlankCanvasStarterLabel`, et pour la même
/// raison portée à sa conclusion : elle lit `\.storyPaste` ELLE-MÊME. Ses
/// entrées sont primitives (`Bool`, une closure), donc elle ne s'abonne à aucun
/// graphe global — c'est la granularité que « Zero Unnecessary Re-render »
/// demande d'une feuille.
///
/// **`PasteButton` et non un `Button` qui lirait `UIPasteboard.general`.** Deux
/// propriétés qu'un bouton maison n'a pas : le système accorde l'accès au
/// presse-papier SANS la bannière « Coller depuis … » (celle que le chemin
/// `ingestPastedFileURLs` de la barre de conversation doit subir), et le bouton
/// se désactive de lui-même quand le presse-papier ne porte rien d'acceptable —
/// donc jamais d'affordance qui ne ferait rien. Son libellé vient du système :
/// il est déjà traduit dans les sept langues de l'app, sans clé de catalogue.
/// **`public` depuis le #4092** : le rail du composer unifié monte CE bouton.
///
/// Il ne pouvait pas devenir une porte ordinaire du rail — celles-ci sont des
/// `Button` qui rappellent l'hôte, et le privilège décrit ci-dessus se perd dès
/// qu'on le reconstruit à la main. C'est pourquoi le rail a gagné un slot où
/// l'hôte rend la vue ENTIÈRE : la forme du contrôle a dicté la forme du rail,
/// et non l'inverse.
public struct BlankCanvasPasteStarter: View {
    let canAddMedia: Bool
    let onItems: ([StoryPastedItem]) -> Void

    public init(canAddMedia: Bool, onItems: @escaping ([StoryPastedItem]) -> Void) {
        self.canAddMedia = canAddMedia
        self.onItems = onItems
    }

    @Environment(\.storyPaste) private var provider

    public var body: some View {
        if StoryPasteStarter.offers(hasResolver: provider != nil,
                                                canAddMedia: canAddMedia),
           let resolver = provider {
            PasteButton(supportedContentTypes: StoryPasteStarter.contentTypes) { providers in
                HapticFeedback.light()
                // Résolution SÉQUENTIELLE app-side, dans une tâche qui HÉRITE de
                // l'isolation MainActor : `NSItemProvider` n'est pas `Sendable`,
                // le confier à une tâche détachée est refusé net par Swift 6.
                // C'est le patron exact de la cible de dépôt de la barre de
                // conversation, pour la même raison.
                Task { onItems(await resolver.items(from: providers)) }
            }
            .labelStyle(.titleAndIcon)
            .buttonBorderShape(.capsule)
            .frame(minHeight: 44)
        }
    }
}
