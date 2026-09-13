import Foundation
import MeeshySDK

// MARK: - LA RÈGLE D'OFFRE DE « COMPOSER », UNE POUR TROIS SURFACES (#6085)
//
// **« Composer » appartient à la PIÈCE, pas au message qui la porte**
// (directive porteur 2026-09-11 : « il faut permettre de pouvoir composer les
// pièces jointes d'une conversation, d'un post ou d'une story »).
//
// La règle existait — `ComposableAttachment.seedPlan(in:)` — et ne savait lire
// qu'un `Message`. Trois surfaces la réclament désormais, et une règle produit
// recopiée sur trois sites est une règle qui a déjà commencé à diverger : c'est
// le constat qui a fait naître `ComposableAttachment` au #4025, et il vaut une
// seconde fois à l'échelle des SURFACES.
//
// **Ce qui la rend UNE est la SOURCE, pas un paramètre de surface.** La question
// posée est « cette chose sème-t-elle quelque chose sur un canvas ? », et sa
// réponse ne dépend d'aucun endroit : elle dépend des PIÈCES, du TEXTE et de la
// PROTECTION du porteur. Ajouter un `Surface` que nulle branche ne lirait aurait
// été une décoration — le contraire de ce que `AttachmentReactionOffer` fait,
// où la surface décide VRAIMENT (une tuile solo cède la réaction au message, le
// plein écran non).
//
// > La question de #6084 (« cette pièce offre-t-elle de RÉAGIR, ici ? ») et
// > celle-ci (« cette chose sème-t-elle un canvas ? ») ne se ressemblent que par
// > leur forme. L'une a besoin du lieu, l'autre du contenu. Les fondre aurait
// > donné une loi à deux têtes dont chaque appelant n'aurait lu qu'une moitié.
//
// `nonisolated` : le target app compile en `defaultIsolation MainActor` et le
// bundle de tests est nonisolated — sans ce modificateur, la loi est
// inappelable depuis un témoin (échec de COMPILE, cf. `AttachmentReactionOffer`).

nonisolated extension ComposableAttachment {

    /// **Ce qu'une surface remet à la règle** — et donc tout ce que la règle a le
    /// droit de savoir.
    ///
    /// Trois champs, pas un de plus : un quatrième qui nommerait la surface
    /// rouvrirait la porte à « sauf pour les posts », qui est exactement la
    /// divergence que ce type existe pour rendre impossible.
    nonisolated struct SeedSource {
        /// Les pièces du PORTEUR, déjà ramenées au vocabulaire commun
        /// (`MessageAttachment`). Le fil social les sert en `FeedMedia` ; le
        /// pont `toMessageAttachment()` du SDK est le site unique de la
        /// traduction, et il est déjà celui que le plein écran emprunte.
        let pieces: [MessageAttachment]

        /// Ce qui pré-remplit la DESCRIPTION. Non normalisé ici : la règle s'en
        /// charge, une fois, pour les trois surfaces.
        let text: String?

        /// Le PORTEUR est-il masqué ? Un message le déclare de trois façons
        /// (vue unique, flou, chiffrement) ; un post et une story n'ont aucune
        /// de ces colonnes — le champ vaut alors `false`, et le dire au site
        /// de projection vaut mieux que de laisser la règle deviner.
        let carrierIsProtected: Bool
    }

    /// **L'UNIQUE implémentation de la conjonction.** Les trois projections
    /// ci-dessous ne font que composer une `SeedSource` ; aucune ne réécrit un
    /// seul de ces quatre refus (critère 2 de #6085).
    ///
    /// - le PORTEUR n'est pas masqué — publier au-delà de son contexte ce qui y
    ///   est masqué est une divulgation, que la chose masquée soit une image ou
    ///   une phrase ;
    /// - EXACTEMENT une pièce composable — un lot mentirait sur ce qui part ;
    /// - AUCUNE pièce protégée dans le porteur, fût-ce une voisine ;
    /// - quelque chose à semer — sans ce dernier refus, « offert partout » se
    ///   lirait « offert toujours », et la porte s'ouvrirait sur une scène vide.
    static func seedPlan(for source: SeedSource) -> SeedPlan? {
        guard !source.carrierIsProtected else { return nil }

        let composables = source.pieces.filter { form(mimeType: $0.mimeType) != nil }
        let aucuneProtegee = !source.pieces.contains(where: Self.isProtected)
        let media = (composables.count == 1 && aucuneProtegee) ? composables.first : nil

        let texte = (source.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let description = texte.isEmpty ? nil : texte

        guard media != nil || description != nil else { return nil }
        return SeedPlan(media: media, description: description)
    }

    /// **Ce qu'un POST sème** (#6085).
    ///
    /// Le texte servi est `displayContent` — ce que le LECTEUR a sous les yeux,
    /// traduction comprise. Prendre `content` aurait pré-rempli la description
    /// dans la langue de l'auteur pour quelqu'un qui vient de lire la sienne :
    /// le Prisme s'applique à TOUT le contenu, la graine d'un composer comprise.
    static func seedPlan(inPost post: FeedPost) -> SeedPlan? {
        seedPlan(for: .post(post))
    }

    /// **Ce qu'une SLIDE de story sème** (#6085).
    ///
    /// `preferredLanguages` descend le Prisme du lecteur par la fonction du SDK
    /// (`StoryItem.resolvedContent(preferredLanguages:)`), qui retombe sur
    /// l'ORIGINAL quand aucune langue de la chaîne n'a de traduction — jamais
    /// sur `translations.first`. Vide ⇒ l'original, ce qui est licite et jamais
    /// souhaitable : l'appelant passe la chaîne du lecteur.
    static func seedPlan(inStory story: StoryItem, preferredLanguages: [String] = []) -> SeedPlan? {
        seedPlan(for: .story(story, preferredLanguages: preferredLanguages))
    }
}

nonisolated extension ComposableAttachment.SeedSource {

    /// Un post n'a AUCUNE colonne de protection — ni vue unique, ni flou, ni
    /// chiffrement, ni sur `Post` ni sur `PostMedia` (mesuré côté serveur au
    /// #6084). `carrierIsProtected: false` n'est donc pas un raccourci : c'est
    /// l'état du modèle, écrit là où un lecteur le cherchera.
    static func post(_ post: FeedPost) -> Self {
        Self(pieces: post.media.map { $0.toMessageAttachment() },
             text: post.displayContent,
             carrierIsProtected: false)
    }

    /// Idem pour une story : `StoryItem` porte une EXPIRATION, jamais un masque.
    /// Une story expirée ne se lit plus du tout — la question ne se pose pas à
    /// ce niveau, elle est déjà tranchée par le lecteur qui l'affiche.
    static func story(_ story: StoryItem, preferredLanguages: [String]) -> Self {
        Self(pieces: story.media.map { $0.toMessageAttachment() },
             text: story.resolvedContent(preferredLanguages: preferredLanguages),
             carrierIsProtected: false)
    }
}
