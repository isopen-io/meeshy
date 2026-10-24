import Foundation
import MeeshySDK

/// Action affichée dans la liste verticale de l'overlay appui-long.
enum PrimaryAction: String, Equatable {
    case edit, translate, copy, saveMedia, more
    /// **Répondre** (#11214) — en tête, comme la loi partagée le range
    /// (`messageActionsFor`) : c'est l'usage nominal d'un appui long.
    case reply
    /// **Réessayer** l'envoi raté — en tête à la place de Répondre.
    case retry
    /// **Les actions du TYPE** (#11214), que la loi propose après Répondre :
    /// le lien (ouvrir, copier), le lieu (ouvrir dans Plans, copier l'adresse).
    case openLink, copyLink, openInMaps, copyAddress
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
    /// **Imager** (#8692, ex « Exporter en image ») — l'atelier « Imagine »
    /// (miroir du menu web, `apps/web/src/lib/view/message-actions.ts`). Même
    /// garde que « Copier » : une image est une copie qu'on partage, ce qui ne
    /// se copie pas ne se peint pas. Offert sur un texte ET sur un média seul.
    case exportImage
    /// **Export rapide** — la carte part dans le format par défaut enregistré
    /// sur l'appareil, sans passer par les options. N'existe qu'avec ce défaut.
    case exportQuick
    /// **Tout le message** (#9907) — le menu d'une PIÈCE visée rend l'aperçu
    /// et le menu du message entier. N'apparaît que dans `MessagePieceMenu`.
    case wholeMessage
    /// **Répondre à CETTE pièce** (#9908) — la citation nomme la pièce visée
    /// (`QuotedAttachmentSend`), comme la réponse du plein écran.
    case replyToPiece
    /// **Supprimer CETTE pièce** (#9908) — après confirmation, jamais une voisine.
    case deletePiece
    /// **Transférer CETTE pièce** (#9914, #10947) — l'écran de partage unique
    /// s'ouvre sur la seule pièce visée ; « Tout le message » y élargit.
    case forwardPiece
    /// **Ajouter le sticker REÇU à « Mes stickers »** (#10630) — à la place
    /// qu'« Enregistrer » tient pour une photo, comme le menu du web : offert
    /// seulement quand il n'y est pas déjà (loi 4 : un contrôle existe s'il a un effet).
    case addSticker
    /// **Mettre en favori un sticker qu'on possède déjà** (#10688) — emoji,
    /// gabarit du catalogue ou Mee : à la place d'« Ajouter à mes stickers »,
    /// qui n'a de sens que pour ce qu'on n'a pas.
    case favoriteSticker, unfavoriteSticker
    /// **Supprimer le MESSAGE, à un geste** — la loi range la suppression dans
    /// son groupe `destructive` (`MessageActionPolicy.Groups`) ; elle n'était
    /// atteignable que par « Plus… » (deux gestes). L'entrée est rouge et ne
    /// supprime rien d'elle-même : l'hôte ouvre la confirmation qui offre
    /// « pour tous », « retirer » ou « pour moi » selon les verdicts.
    case deleteMessage
}

extension PrimaryAction {
    /// Les entrées qui détruisent : teintées en rouge, jamais à l'accent.
    var isDestructive: Bool { self == .deletePiece || self == .deleteMessage }
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
    /// **Imager** dans « Plus… » (#8692) — la même porte que l'action
    /// primaire, pour qui la cherche dans le grand menu.
    case imager
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
    /// **Le message EST un sticker** (#10630) : son image jointe n'est pas une
    /// photo, donc « Enregistrer » (Photos) n'est JAMAIS offert.
    var isSticker: Bool = false
    /// « Ajouter à mes stickers » est offert : image à déposer ET absente de la
    /// bibliothèque (`ReceivedSticker.offersAdd`).
    var stickerAddable: Bool = false
    /// Réciprocité : qui ne partage pas ses accusés de lecture ne voit pas ceux
    /// des autres. L'entrée « vues » disparaît plutôt que d'ouvrir une feuille
    /// vide — le serveur ne renverrait rien de toute façon.
    ///
    /// Booléen porté par le contexte plutôt que lu ici : ce résolveur est une
    /// logique pure, entièrement testable, sans dépendance à un singleton.
    ///
    /// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    var showReadReceipts: Bool = true
    /// **Ce que le message laisse SORTIR** (#9573) — la projection de la loi de
    /// sortie, posée au point d'usage par `Message.exitOffer`. Transférer,
    /// copier, enregistrer, partager, « Imager » et « Composer » ne s'offrent
    /// que si elle l'autorise ; le résolveur reçoit le verdict, jamais un
    /// drapeau brut, et reste une logique pure.
    var exits: MessageExitOffer = .unrestricted
    /// **Le message est une vue unique** — scellée, lue sur place ou déjà
    /// ouverte (#7579). Son appui long ne montre AUCUN contenu : ni copie, ni
    /// traduction, ni transfert, ni partage, ni réponse citée. Le menu se réduit
    /// à ce qui a un sens — Supprimer et Infos. Verdict posé au point d'usage
    /// par `MeeshyMessage.holdsViewOnce`.
    var isViewOnce: Bool = false
    /// **Le message est flouté** (#8009) — verdict `Message.holdsBlur`. Le flou
    /// retient le contenu dans le fil ; le menu ne doit pas le rendre par une
    /// autre porte : ni copie, ni traduction, ni transfert, ni partage, ni
    /// enregistrement, ni historique d'édition.
    var isBlurred: Bool = false
    /// Un format d'export par défaut est enregistré sur l'appareil : « Export
    /// rapide » l'applique sans options (`MessageCardFormat.readDefault`).
    var hasDefaultExportFormat: Bool = false
    /// Le message porte un média qu'une carte peut peindre — photo, vidéo,
    /// son (`MessageCardSubject.paintableMedia`). « Imager » s'offre alors
    /// même sans texte (#8692).
    var hasPaintableMedia: Bool = false

    /// Les VERDICTS de la loi partagée (#11214) — `MessageActionPolicy`, posés
    /// par `MessageMenuContext.make`, seul site de production. Leurs défauts
    /// gardent ouvert ce que le menu offrait avant la loi ; la fabrique les
    /// ferme selon le rôle, le type, le chiffrement et l'état du message.
    var canReply: Bool = true
    var canPin: Bool = true
    var canStar: Bool = true
    var canReport: Bool = true
    var canTranslate: Bool = true
    /// **Traduire SUR L'APPAREIL** (verdict `.device` de la loi) : en E2EE le
    /// serveur ne lit pas le clair, la vue Langue ne sait demander qu'à lui.
    /// La traduction se fait alors par `DeviceTranslationCoordinator`, et
    /// « Traduire » reste offert au lieu de disparaître.
    var translatesOnDevice: Bool = false
    /// Le verdict `canReact` de la loi : message vivant, non système, lecteur
    /// membre actif d'une conversation ouverte. Faux ⇒ ni barre d'emojis, ni
    /// réaction de pièce.
    var canReact: Bool = true
    /// Les verdicts de suppression, distincts : un tiers modérateur RETIRE
    /// avec motif, l'auteur supprime pour tous, chacun pour soi, et un envoi
    /// jamais parti s'abandonne (`.discard`). `canDelete` en est l'union — la
    /// porte de l'entrée « Supprimer ».
    var canRemove: Bool = false
    var canDeleteForEveryone: Bool = false
    var canDeleteForMe: Bool = true
    var canDiscard: Bool = false
    /// Le verdict `forward` de la loi : ni E2EE, ni avis système, ni envoi raté.
    var canForward: Bool = true
    var isFailed: Bool = false
    /// Supprimé ou éphémère échu : il ne reste que « Supprimer pour moi ».
    var isGone: Bool = false
    /// Un lieu n'a ni texte à copier ni média à supprimer : il s'ouvre dans Plans.
    var isLocation: Bool = false
    /// Chiffré de bout en bout : transcription et sentiment côté serveur n'existent pas.
    var serverFeaturesAbsent: Bool = false
    var kindActions: [PrimaryAction] = []

    /// « Imager » a-t-il quelque chose à peindre ? Un texte ou un média peignable.
    var canImagine: Bool { hasText || hasPaintableMedia }

    /// **Une suppression qui part vers la PASSERELLE** — « Supprimer le média »,
    /// supprimer une pièce. « Supprimer pour moi » est local et n'en ouvre
    /// aucune : la passerelle refuse un membre sur le message d'autrui.
    var canDeleteOnServer: Bool { canDeleteForEveryone || canRemove }
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
    /// La loi de sortie juge la DISPARITION ; le dépôt déclare une autre
    /// protection sur la PIÈCE JOINTE, et cinq
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
    /// - le message offre la sortie `.publish` (`Message.exitOffer`, #9573) —
    ///   ni vue unique, ni flamme, ni flou, ni chiffrement : publier au-delà de
    ///   la conversation ce qui y disparaît ou y est masqué est une divulgation ;
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
    /// **Elle n'implémente plus la conjonction : elle la PROJETTE** (#6085).
    ///
    /// Le post et la slide de story posent exactement la même question, et la
    /// recopier une deuxième puis une troisième fois l'aurait fait diverger au
    /// premier ajustement de l'une. La règle vit désormais dans
    /// `seedPlan(for:)` (`ComposableAttachmentSurfaces.swift`) ; ce qui reste
    /// ici est ce que ce projeteur est SEUL à savoir — les trois façons dont un
    /// MESSAGE déclare qu'il est masqué.
    static func seedPlan(in message: Message) -> SeedPlan? {
        seedPlan(for: SeedSource(
            pieces: message.attachments,
            text: message.content,
            carrierIsProtected: !message.exitOffer.offers(.publish)
        ))
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
    /// Liste verticale COMPACTE de l'overlay (façon iMessage) : au plus
    /// `MessageActionPolicy.maxPrimaryActions` actions clés, puis `.more`
    /// toujours en fin. `pin`/`star`/`delete` sont routés vers « Plus… »
    /// (`moreSections`), jamais affichés ici.
    ///
    /// **« Supprimer » est à un geste** (`.deleteMessage`, rouge, juste avant
    /// « Plus… ») dès que la loi ouvre une suppression (`canDelete` = l'union
    /// de son groupe `destructive`). Sa place suit le contenu : après les
    /// actions du contenu d'un message vivant, mais SEUL devant « Plus… » quand
    /// le contenu ne se montre pas (vue unique, supprimé, échu) — c'est alors
    /// le seul geste qui reste.
    static func primaryActions(_ ctx: MessageMenuContext) -> [PrimaryAction] {
        let removal: [PrimaryAction] = ctx.canDelete ? [.deleteMessage] : []
        guard !ctx.isViewOnce, !ctx.isGone else { return removal + [.more] }
        return capped(candidates(ctx)) + removal + [.more]
    }

    /// Au-delà de six, ce qui a un JUMEAU dans « Plus… » y passe d'abord —
    /// l'export rapide et « Imager » (« Imager »), « Copier », « Traduire »
    /// (la vue Langue), « Éditer ». Ce qui n'en a pas — Répondre, les actions du
    /// type, Sélectionner, Enregistrer, Composer — reste à portée d'un geste.
    private static let overflowOrder: [PrimaryAction] = [.exportQuick, .exportImage, .copy, .translate, .edit]

    private static func capped(_ candidates: [PrimaryAction]) -> [PrimaryAction] {
        let limit = MessageActionPolicy.maxPrimaryActions
        let excess = candidates.count - limit
        guard excess > 0 else { return candidates }
        let dropped = Set(overflowOrder.filter { candidates.contains($0) }.prefix(excess))
        return Array(candidates.filter { !dropped.contains($0) }.prefix(limit))
    }

    private static func candidates(_ ctx: MessageMenuContext) -> [PrimaryAction] {
        var out: [PrimaryAction] = []
        if ctx.isFailed { out.append(.retry) }
        if ctx.hasCallSummary { out.append(.callDetail) }
        if ctx.canReply { out.append(.reply) }
        let showsContent = !ctx.isBlurred
        if showsContent { out.append(contentsOf: ctx.kindActions) }
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
        // « Sélectionner » — retour porteur 2026-08-27 : juste À CÔTÉ
        // d'Éditer, parmi les premiers éléments (jamais dans « Plus… »).
        out.append(.select)
        if ctx.hasText && showsContent && (ctx.canTranslate || ctx.translatesOnDevice) { out.append(.translate) }
        if ctx.hasText && showsContent && !ctx.isLocation && ctx.exits.offers(.copy) { out.append(.copy) }
        if ctx.canImagine && showsContent && ctx.exits.offers(.imagine) {
            out.append(.exportImage)
            if ctx.hasDefaultExportFormat { out.append(.exportQuick) }
        }
        if ctx.saveableAttachmentCount == 1 && !ctx.isSticker && showsContent && ctx.exits.offers(.save) { out.append(.saveMedia) }
        if ctx.stickerAddable && showsContent && ctx.exits.offers(.save) { out.append(.addSticker) }
        if let favorite = ctx.stickerFavorite, showsContent {
            out.append(favorite ? .unfavoriteSticker : .favoriteSticker)
        }
        // « Composer » suit immédiatement « Enregistrer » : ce sont les deux
        // gestes qui EMPORTENT le média hors de la conversation, et le second se
        // cherche à côté du premier. La CONDITION, elle, n'est pas ici : elle
        // vit dans `ComposableAttachment.offers`, que les lecteurs de ce geste
        // partagent. Le résolveur n'en tient qu'un fait.
        if ctx.canComposeMedia && showsContent && ctx.exits.offers(.publish) { out.append(.compose) }
        return out
    }

    /// Sections de la feuille « Plus… » (SSOT overflow, filtrées par contexte).
    /// Accueille les actions sorties du menu compact : pin/star (toggles) et
    /// la suppression du message. `.language` n'y figure jamais.
    static func moreSections(_ ctx: MessageMenuContext) -> [MoreSection] {
        if ctx.isViewOnce { return viewOnceSections(ctx) }
        if ctx.isGone { return ctx.canDelete ? [.actions([.delete])] : [] }
        var sections: [MoreSection] = []

        // « Faire » (exécutent + ferment) : répondre, transférer, discussion,
        // éditer (si éditable), copier (si texte), partager, épingler/favori,
        // supprimer.
        let showsContent = !ctx.isBlurred
        var actions: [MoreItem] = ctx.canReply ? [.reply] : []
        // D8 (#10949) : un flouté se TRANSFÈRE, flou hérité — la loi de sortie
        // le dit (`MessageExitOffer.offers(.forward)`), la feuille ne la
        // resserre pas ; glissé et VoiceOver lisent ce verdict (#12626).
        if ctx.canForward && ctx.exits.offers(.forward) { actions.append(.forward) }
        actions.append(.thread)
        if ctx.isMine && ctx.canEdit && ctx.hasText { actions.append(.edit) }
        if ctx.hasText && showsContent && ctx.exits.offers(.copy) { actions.append(.copy) }
        if showsContent && ctx.exits.offers(.share) { actions.append(.share) }
        if ctx.canImagine && showsContent && ctx.exits.offers(.imagine) { actions.append(.imager) }
        if ctx.canPin { actions.append(ctx.isPinned ? .unpin : .pin) }
        if ctx.canStar { actions.append(ctx.isStarred ? .unstar : .star) }
        // **La décoration, juste après le favori du MESSAGE** — c'est le
        // voisin qu'on cherche quand on vient d'y penser, et le libellé fait
        // la différence entre les deux objets.
        if let epinglee = ctx.stickerFavorite {
            actions.append(epinglee ? .unpinSticker : .pinSticker)
        }
        if ctx.canDeleteOnServer && ctx.hasMedia && !ctx.isLocation { actions.append(.media) }
        if ctx.canDelete { actions.append(.delete) }
        sections.append(.actions(actions))

        // « Infos & Prisme » (explorables → morph icônes + contenu) : traduire
        // (langue), transcription (audio/vidéo), réactions (voir + ajouter),
        // vues, sentiment (texte), historique (édité).
        var info: [MoreItem] = []
        // Chiffré de bout en bout : le serveur ne lit pas le clair, ses
        // services n'existent pas (#11214) — la feuille le dit, le menu ne
        // les offre pas. La vue Langue n'existe que si elle peut traduire.
        let serverReads = !ctx.serverFeaturesAbsent
        let translatesText = ctx.hasText && ctx.canTranslate
        let translatesAudio = ctx.hasTimebasedMedia && serverReads
        if (translatesText || translatesAudio) && showsContent { info.append(.language) }
        if ctx.hasTimebasedMedia && showsContent && serverReads { info.append(.transcription) }
        info.append(.reactions)
        if ctx.showReadReceipts { info.append(.views) }
        // Le sentiment se calcule SUR L'APPAREIL (`NLTagger`) : rien ne part,
        // il reste offert en E2EE.
        if ctx.hasText && showsContent { info.append(.sentiment) }
        if ctx.isEdited && ctx.hasEditRevisions && showsContent { info.append(.history) }
        sections.append(.info(info))

        if ctx.canReport { sections.append(.moderation([.report])) }
        return sections
    }

    /// Le menu d'une vue unique (#7579) : Supprimer (pour moi, et pour tous
    /// si j'en suis l'auteur — la feuille de suppression en décide), et les
    /// Infos, qui ne disent rien du contenu.
    private static func viewOnceSections(_ ctx: MessageMenuContext) -> [MoreSection] {
        var sections: [MoreSection] = []
        if ctx.canDelete { sections.append(.actions([.delete])) }
        if ctx.showReadReceipts { sections.append(.info([.views])) }
        return sections
    }
}
