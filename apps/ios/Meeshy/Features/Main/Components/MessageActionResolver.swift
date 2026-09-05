import Foundation
import MeeshySDK

/// Action affichée dans la liste verticale de l'overlay appui-long.
enum PrimaryAction: String, Equatable {
    case edit, translate, copy, saveMedia, pin, unpin, star, unstar, more, delete
    /// **Composer** (lot 5, O13) — ouvre l'atelier sur le média reçu, déjà
    /// posé. Elle vit dans la liste VERTICALE et non dans « Plus… » parce que
    /// O13 fixe le budget à DEUX gestes : la feuille en coûterait trois.
    ///
    /// Le libellé est « Composer », jamais « Publier » : la pilule de la feuille
    /// de transfert PUBLIE ; cette entrée-ci ouvre un atelier, où rien ne part
    /// tant que l'auteur n'a pas pressé la flèche.
    case compose
    /// Feuille de détail d'un appel (durée précise, données, qualité réseau,
    /// transcript). Elle vivait sur l'appui long de la CARTE d'appel jusqu'au
    /// 2026-08-24 ; l'appui long étant rendu au menu du message, la
    /// destination entre ICI plutôt que d'être perdue.
    case callDetail
    /// **Entrée en mode sélection multiple (#4005, promue en primaire
    /// 2026-08-27).** Aucune condition sur le contexte du message — toujours
    /// offerte, comme `.compose`/`.edit` dont le porteur la veut voisine :
    /// « parmi les premiers éléments ». Vivait dans `MoreItem` (« Plus… »),
    /// enterrée derrière un geste supplémentaire — retour porteur explicite.
    case select
}

/// Item d'une section de la feuille « Plus… ».
/// `.language` n'apparaît jamais dans `moreSections` — il sert uniquement
/// d'ancre de navigation directe (action primaire « Traduire »).
enum MoreItem: String, Equatable {
    case reply, forward, thread, media
    /// Actions sorties du menu compact (`primaryActions`) et routées vers
    /// « Plus… » : épingler/favori (toggles) + suppression du message.
    case pin, unpin, star, unstar, delete
    /// **Épingler la DÉCORATION d'un message-sticker aux favoris de la
    /// palette** (directive porteur 2026-09-05 : « permettre de pouvoir
    /// ajouter dans favoris par long-press sur les stickers dans les composers
    /// ET messages »).
    ///
    /// Elle voisine `star`/`unstar` sans s'y confondre, et la distinction vaut
    /// d'être dite : `star` met le MESSAGE en favori — il reste dans cette
    /// conversation, avec son auteur et son horodatage. Celle-ci épingle la
    /// DÉCORATION dans la palette, où elle devient réutilisable partout
    /// ailleurs. Deux objets, deux magasins, deux verbes que le libellé sépare.
    case pinSticker, unpinSticker
    /// Actions « faire » ajoutées au menu « Plus… » (exécutent + ferment) :
    /// éditer, copier, partager. `language`/`transcription` = explorables.
    case edit, copy, share
    case language, views, reactions, transcription, sentiment, history
    case report
}

/// Section de la feuille « Plus… ».
enum MoreSection: Equatable {
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}

/// Contexte immuable d'un message, dérivé au point d'usage, qui pilote
/// la composition du menu appui-long.
struct MessageMenuContext: Equatable {
    let isMine: Bool
    let canEdit: Bool
    let canDelete: Bool
    let hasText: Bool
    let hasMedia: Bool
    let hasTimebasedMedia: Bool
    let isPinned: Bool
    let isStarred: Bool
    let isEdited: Bool
    let hasEditRevisions: Bool
    /// Le message porte un résumé d'appel (`Message.callSummary`). Seul fait
    /// qui ouvre `.callDetail` — le résolveur ne connaît ni `Message` ni
    /// `messageSource`, il reçoit le verdict.
    var hasCallSummary: Bool = false
    /// Nombre d'attachments enregistrables (hors location). L'action
    /// « Enregistrer » n'apparaît que pour EXACTEMENT UN attachment —
    /// le multi-attachment passe par la galerie (qui a son propre save).
    var saveableAttachmentCount: Int = 0
    /// Le VERDICT de `ComposableAttachment.offers(message:)`, jamais ses
    /// ingrédients.
    ///
    /// C'est un fait, pas une règle, et la distinction est le fond de l'affaire :
    /// « Composer » a TROIS lecteurs — cette liste verticale, le menu natif et
    /// la feuille de transfert — qui mènent au MÊME plein écran. Porter ici le
    /// COMPTE des pièces composables et un drapeau de chiffrement obligeait
    /// chaque lecteur à recomposer la conjonction lui-même, et la feuille l'avait
    /// déjà réécrite dans une `private var` de `View` qu'aucun test ne peut voir.
    var canComposeMedia: Bool = false
    /// **La décoration de ce message est-elle déjà épinglée ?** `nil` ⇒ le
    /// message n'EST PAS un sticker, et l'action n'existe pas (2026-09-05).
    ///
    /// Un tri-état plutôt qu'une paire de booléens : « ce n'est pas un
    /// sticker » et « c'est un sticker non épinglé » gouvernent des issues
    /// différentes — l'absence de l'entrée, et sa présence en position
    /// « épingler ». Deux booléens auraient laissé représentable un quatrième
    /// état qui n'existe pas (« pas un sticker, mais épinglé »).
    var stickerFavorite: Bool? = nil
    /// Réciprocité : qui ne partage pas ses accusés de lecture ne voit pas ceux
    /// des autres. L'entrée « vues » disparaît plutôt que d'ouvrir une feuille
    /// vide — le serveur ne renverrait rien de toute façon.
    ///
    /// Booléen porté par le contexte plutôt que lu ici : ce résolveur est une
    /// logique pure, entièrement testable, sans dépendance à un singleton.
    ///
    /// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    var showReadReceipts: Bool = true
    /// Transférabilité du message, DÉCIDÉE au point d'usage par
    /// `Message.isForwardable` (vue unique ⇒ le serveur refuse le transfert).
    /// Le résolveur reçoit le verdict, jamais le drapeau brut : la règle n'a
    /// qu'un seul site d'énonciation, et ce résolveur reste une logique pure.
    var isForwardable: Bool = true
}

/// **Ce qu'une graine de composer sait poser sur un canvas.**
///
/// Écrit ICI, à côté du résolveur, parce que trois surfaces le lisent — le menu
/// d'appui long, le menu natif et la feuille de transfert — et qu'une règle
/// produit recopiée sur trois sites est une règle qui a déjà commencé à
/// diverger.
///
/// **Ce n'est PAS `PublicationTargetRule.targets`**, et les fondre serait le
/// raccourci coûteux de ce lot. Ce sont deux questions différentes : `targets`
/// répond « où le PONT peut-il envoyer ces octets tels quels ? » (POST / REEL /
/// STORY, note vocale comprise) ; celle-ci répond « la GRAINE peut-elle poser
/// ceci sur un CANVAS ? ». Offrir « Composer » sur un audio ouvrirait un
/// atelier où l'objet posé n'aurait aucun actif chargé — `runStoryUpload` le
/// saute en journalisant « layer will be invisible to viewers », et le geste
/// aurait l'air de marcher.
nonisolated enum ComposableAttachment {

    /// La forme sous laquelle la graine accepte le média. `nil` = pas
    /// composable, ce qui écarte GRATUITEMENT le lieu (`AttachmentKind` range
    /// `application/x-location` en `.other`) : la garde O13 « jamais
    /// `.location` » n'a donc aucune condition propre à oublier.
    enum Form: Equatable { case image, video, audio }

    /// **Le son est entré au vocabulaire au #4461**, et le doc ci-dessus dit
    /// pourquoi il en était exclu : « offrir Composer sur un audio ouvrirait un
    /// atelier où l'objet posé n'aurait aucun actif chargé ». C'était exact tant
    /// que la graine ne savait poser que des bitmaps et des pistes vidéo.
    ///
    /// Ce qu'un son sait ÊTRE dans un atelier, le dépôt le savait déjà
    /// ailleurs : `ComposerAudioPlacement` gouverne le collage d'un son depuis
    /// le #4378, et `attachPastedAudio` le pose. `StoryComposerSeed.audio`
    /// emprunte ce chemin — le son devient le SON de la scène, jamais un objet
    /// de canvas. Le refus levé était donc un refus de TRANSPORT, pas de
    /// produit.
    static func form(mimeType: String) -> Form? {
        switch AttachmentKind(mimeType: mimeType) {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .pdf, .spreadsheet, .document, .presentation,
             .archive, .code, .text, .other:
            return nil
        }
    }

    /// **La PROTECTION d'une pièce jointe, lue aux DEUX niveaux qui la
    /// déclarent.**
    ///
    /// `Message.isForwardable` ne dit que la vue unique du MESSAGE. Le dépôt
    /// déclare la protection une seconde fois sur la PIÈCE JOINTE, et cinq
    /// gardes de production la lisent déjà sous ce nom — `attachmentIsProtected`
    /// (`BubbleStandardLayout+Media`, `MessageListViewController`,
    /// `ConversationView+MessageRow`, `ConversationViewModel`). Le flou n'est
    /// qu'un MASQUE DE RENDU, jamais une transformation du blob : matérialiser
    /// une pièce floutée rend le fichier d'origine, EN CLAIR.
    static func isProtected(_ attachment: MessageAttachment) -> Bool {
        attachment.isViewOnce || attachment.isBlurred || attachment.isEncrypted
    }

    /// **LA règle d'offre de « Composer » — un site, trois lecteurs.**
    ///
    /// Rend la pièce que la graine posera, ou `nil` dès qu'une condition
    /// refuse. Chacune porte sa raison :
    ///
    /// - `isForwardable` — clause O13, lue par le prédicat qui l'énonce déjà
    ///   une fois plutôt que ré-encodée ici ;
    /// - message NI flouté NI chiffré — publier au-delà de la conversation ce
    ///   qui est masqué DANS la conversation est une divulgation ;
    /// - EXACTEMENT une pièce composable — un lot mentirait sur ce qui part ;
    /// - AUCUNE pièce protégée dans le message, fût-ce une voisine.
    static func target(in message: Message) -> MessageAttachment? {
        seedPlan(in: message)?.media
    }

    /// **Ce qu'un message sème dans l'atelier** — le canvas ET la description,
    /// portés ENSEMBLE (#4025).
    ///
    /// La règle rendait auparavant « quelle pièce poser » (`MessageAttachment?`),
    /// un type qui n'a aucun endroit où loger du texte. « Composer » n'était donc
    /// offert que sur un média, et un message TEXTE — le cas le plus courant —
    /// ne l'offrait pas, alors que son texte a une destination évidente : la
    /// DESCRIPTION de la slide.
    ///
    /// Les deux voyagent ensemble parce qu'un message porte souvent les deux, et
    /// que la légende que l'auteur a déjà écrite ne doit pas lui être redemandée.
    /// Pas `Equatable` : `MessageAttachment` ne l'est pas, et le rendre tel
    /// pour un type de plan serait faire porter à un modèle du SDK une exigence
    /// née d'un test. Les témoins comparent ce qu'ils veulent vérifier —
    /// l'identité du média et le texte — plutôt que le plan en bloc.
    struct SeedPlan {
        /// Ce qui se pose sur le CANVAS. `nil` pour un message texte, ou pour un
        /// LOT — dont le refus portait sur « quelle pièce part », jamais sur la
        /// phrase qui l'accompagne.
        let media: MessageAttachment?
        /// Ce qui pré-remplit la DESCRIPTION. Normalisé : une chaîne d'espaces
        /// n'est pas un texte.
        let description: String?
    }

    /// Les trois protections sont lues UNE fois, pour les deux moitiés du plan.
    ///
    /// Le texte les porte au même titre que le média : publier au-delà de la
    /// conversation ce qui est masqué DANS la conversation est une divulgation,
    /// que la chose masquée soit une image ou une phrase. Les poser ici, en
    /// tête, est ce qui empêche l'extension au texte de rouvrir une porte que le
    /// média avait fermée.
    static func seedPlan(in message: Message) -> SeedPlan? {
        guard message.isForwardable, !message.isBlurred, !message.isEncrypted else { return nil }

        let composables = message.attachments.filter { form(mimeType: $0.mimeType) != nil }
        let aucuneProtegee = !message.attachments.contains(where: Self.isProtected)
        let media = (composables.count == 1 && aucuneProtegee) ? composables.first : nil

        let texte = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let description = texte.isEmpty ? nil : texte

        // Un message qui ne sème RIEN n'ouvre pas d'atelier : sans ce refus,
        // « offert sur tout message » se lirait « offert toujours », et la porte
        // s'ouvrirait sur une scène vide.
        guard media != nil || description != nil else { return nil }
        return SeedPlan(media: media, description: description)
    }

    /// Le même verdict, sous la forme que lisent les surfaces qui n'ont pas
    /// besoin du plan. `seedPlan` en est l'UNIQUE implémentation : deux
    /// écritures de la même conjonction sont deux règles qui ont déjà commencé
    /// à diverger.
    static func offers(message: Message) -> Bool { seedPlan(in: message) != nil }
}

/// Logique pure de composition du menu appui-long. Aucune dépendance UI —
/// entièrement testable. Source unique de vérité pour « quelle action, où ».
enum MessageActionResolver {
    /// Liste verticale COMPACTE de l'overlay (façon iMessage) : uniquement les
    /// actions clés + `.more` toujours en fin. `pin`/`star`/`delete` sont
    /// routés vers « Plus… » (`moreSections`), jamais affichés ici.
    static func primaryActions(_ ctx: MessageMenuContext) -> [PrimaryAction] {
        var out: [PrimaryAction] = []
        if ctx.hasCallSummary { out.append(.callDetail) }
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
        // « Sélectionner » — retour porteur 2026-08-27 : juste À CÔTÉ
        // d'Éditer, parmi les premiers éléments (jamais dans « Plus… »).
        out.append(.select)
        if ctx.hasText { out.append(.translate) }
        if ctx.hasText { out.append(.copy) }
        if ctx.saveableAttachmentCount == 1 { out.append(.saveMedia) }
        // « Composer » suit immédiatement « Enregistrer » : ce sont les deux
        // gestes qui EMPORTENT le média hors de la conversation, et le second se
        // cherche à côté du premier. La CONDITION, elle, n'est pas ici : elle
        // vit dans `ComposableAttachment.offers`, que les trois lecteurs de ce
        // geste partagent. Le résolveur n'en tient qu'un fait.
        if ctx.canComposeMedia { out.append(.compose) }
        // Le repli « jamais de menu réduit à Plus… seul » (média-seul non
        // enregistrable, localisation…) est devenu SANS OBJET : `.select`,
        // toujours ajouté ci-dessus, garantit déjà `out` non vide.
        out.append(.more)
        return out
    }

    /// Sections de la feuille « Plus… » (SSOT overflow, filtrées par contexte).
    /// Accueille les actions sorties du menu compact : pin/star (toggles) et
    /// la suppression du message. `.language` n'y figure jamais.
    static func moreSections(_ ctx: MessageMenuContext) -> [MoreSection] {
        var sections: [MoreSection] = []

        // « Faire » (exécutent + ferment) : répondre, transférer, discussion,
        // éditer (si éditable), copier (si texte), partager, épingler/favori,
        // supprimer.
        var actions: [MoreItem] = [.reply]
        if ctx.isForwardable { actions.append(.forward) }
        actions.append(.thread)
        if ctx.isMine && ctx.canEdit && ctx.hasText { actions.append(.edit) }
        if ctx.hasText { actions.append(.copy) }
        actions.append(.share)
        actions.append(ctx.isPinned ? .unpin : .pin)
        actions.append(ctx.isStarred ? .unstar : .star)
        // **La décoration, juste après le favori du MESSAGE** — c'est le
        // voisin qu'on cherche quand on vient d'y penser, et le libellé fait
        // la différence entre les deux objets.
        if let epinglee = ctx.stickerFavorite {
            actions.append(epinglee ? .unpinSticker : .pinSticker)
        }
        if ctx.canDelete && ctx.hasMedia { actions.append(.media) }
        if ctx.canDelete { actions.append(.delete) }
        sections.append(.actions(actions))

        // « Infos & Prisme » (explorables → morph icônes + contenu) : traduire
        // (langue), transcription (audio/vidéo), réactions (voir + ajouter),
        // vues, sentiment (texte), historique (édité).
        var info: [MoreItem] = []
        if ctx.hasText || ctx.hasTimebasedMedia { info.append(.language) }
        if ctx.hasTimebasedMedia { info.append(.transcription) }
        info.append(.reactions)
        if ctx.showReadReceipts { info.append(.views) }
        if ctx.hasText { info.append(.sentiment) }
        if ctx.isEdited && ctx.hasEditRevisions { info.append(.history) }
        sections.append(.info(info))

        sections.append(.moderation([.report]))
        return sections
    }
}
