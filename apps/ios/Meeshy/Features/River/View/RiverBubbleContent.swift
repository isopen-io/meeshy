import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Contenu — le pont entre la géométrie PURE et ce que le lecteur voit

/// Ce que `RiverBubbleView` affiche pour un message. `RiverLaneResolver.RiverBubble`
/// (la loi) ne connaît ni texte ni nom — ce type porte ce que la loi ne
/// porte pas, résolu par l'appelant. Le Prisme (`resolveLastMessagePreview`/
/// `preferredTranslation`) s'applique ICI, côté appelant, comme pour toute
/// bulle du Fil (amendement R) — cette vue ne résout AUCUNE langue.
struct RiverBubbleContent: Equatable {
    let bubble: RiverLaneResolver.RiverBubble
    let senderDisplayName: String
    /// Graine de couleur — PAS un hex déjà résolu. `RiverBubbleView` appelle
    /// elle-même `DynamicColorGenerator.colorForName` (contrat R-133 :
    /// « couleur de ligne par participant via DynamicColorGenerator »).
    let colorSeed: String
    let timeString: String
    let text: String
    /// §7ter A.6 — verdict de forme de la géométrie source
    /// (`RiverGeometry.layout`), porté PAR BULLE plutôt qu'en lisant la
    /// géométrie complète depuis cette vue (même discipline que `bubble`,
    /// qui porte déjà sa part de la loi). Gouverne l'HABILLAGE du contour :
    /// `.lanes` ⇒ contour complet coloré (une ligne aborde la bulle) ;
    /// `.serialized` ⇒ bord gauche + bord bas colorés SEULS, reste neutre —
    /// aucune ligne n'aborde la bulle en vue sérialisée, un contour complet y
    /// mimerait une branche que le verdict de forme vient de retirer.
    let layout: RiverLaneResolver.RiverLayout
    let replyPreview: RiverReplyPreview?
    /// L'avis système, prêt à peindre — non-nil UNIQUEMENT quand
    /// `bubble.isSystem`. Défaut `nil` : les sites de montage antérieurs à
    /// le lot 2 (et leurs témoins) restent inchangés.
    let systemNotice: RiverSystemNotice?
    /// Lot G (2026-08-22) — où la bulle se tient dans son groupe, déduit par
    /// `RiverConversationMapping.groupPositions` (pur). Gouverne le CONTOUR :
    /// une bulle jointe partage son bord haut en pointillé et laisse son bas
    /// ouvert si la suivante la continue. Défaut `.solo` : contour fermé.
    let groupPosition: RiverGroupPosition
    /// R-5 (2026-08-22) — l'identité VIVANTE de la voix : présence, cercle de
    /// story, avatar, fiche à ouvrir. Résolue par l'appelant (singletons de
    /// l'app), injectée ici — la vue n'en lit aucun. `nil` pour un avis
    /// système : il n'est la voix de personne.
    let identity: RiverBubbleIdentity?

    /// **Qui est nommé sous un message transféré — DÉJÀ TRANCHÉ** (#5058).
    ///
    /// `nil` ⇒ le message n'a pas été transféré. La rivière n'affichait AUCUN
    /// badge : c'était le seul des quatre modes où la feature n'existait pas du
    /// tout — pas un repli dégradé, une absence.
    ///
    /// La valeur est résolue par `RiverConversationMapping`, la PROJECTION,
    /// jamais par la vue. C'est la même discipline que `BubbleContent` tient
    /// pour la bulle et la rangée plate ; ce ne sont pas deux résolutions mais
    /// deux projections d'une règle qui vit chez `ForwardBadgePolicy`.
    let forwardAttribution: ForwardAttribution?

    /// **La story citée, quand elle QUITTE la bulle** — vue `3h` (#5059).
    ///
    /// `nil` ⇒ rien à détacher, et `replyPreview` rend l'aperçu plat comme
    /// avant. Non-`nil` ⇒ la scène est rendue en 9:16, jamais aplatie sur une
    /// ligne « 📷 Story · il y a 3 h ».
    ///
    /// La règle du détachement n'est pas réécrite ici : c'est
    /// `BubbleContent.detachedStoryCitation`, projeté par le mapping.
    let storyCitation: ReplyReference?

    /// **Le chrome de protection — le MÊME que celui des quatre autres modes**
    /// (#7452). La rivière n'affichait AUCUN décompte : un éphémère y vivait
    /// sans jamais annoncer qu'il allait disparaître, et une vue unique ne s'y
    /// désignait pas davantage. La valeur est résolue par la PROJECTION
    /// (`RiverConversationMapping`) via `MeeshyMessage.protection`, jamais par
    /// la vue. Défaut vide : les sites de montage antérieurs restent justes.
    let protection: MessageProtectionDescriptor

    /// Ce message est en train d'être DÉTRUIT sous les yeux du lecteur
    /// (#7467) — projeté par `RiverConversationMapping`, jamais lu ici.
    let isBurning: Bool

    /// Vue unique scellée (#7618) ou déjà ouverte (#7579) : la bulle ne porte
    /// QUE la puce, `text` est vide par la projection, jamais masqué par la vue.
    let viewOnceChip: ViewOnceChip.State?
    /// Vue unique TEXTE lue sur place (#7579) : la retoucher, ou la voir sortir
    /// de l'écran, la fait passer à « déjà ouvert ».
    let isViewOnceRevealed: Bool
    /// Ce que fait le toucher sur le voile : le lever SUR PLACE (#8389).
    /// Projeté par `RiverConversationMapping`, jamais décidé ici.
    let protectedTap: ProtectedContentTap
    /// Le toucher SUIVANT, sur le contenu révélé : la Rivière ne rend aucun
    /// média (#8310), c'est lui qui ouvre le plein écran de l'image floutée.
    let tapAfterReveal: ProtectedContentTap

    /// Le premier lien du texte servi et ce qu'il porte (carte de
    /// conversation, façade vidéo, aperçu) — rendu par le MÊME
    /// `BubbleLinkEmbed` que les autres modes (#8139). `nil` : aucun lien, ou
    /// un texte voilé dont le lien ne doit pas fuir à côté.
    let linkEmbed: BubbleContent.Text?
    /// L'auteur n'a pas de compte (#10286) : ses adresses restent du texte brut.
    let linksAreInert: Bool
    /// Les cartes de visite du message, rendues par `BubbleAttachmentView`
    /// comme partout ailleurs (#8139).
    let contactCards: RiverContactCards
    /// La capture d'écran de ce message est bloquée (#9574) — projection de
    /// `Message.exitOffer.capture` : la bulle se rend dans la couche sécurisée.
    let capturesBlocked: Bool
    /// #10637 — la taille d'un emoji envoyé SEUL (×4 / ×3 / ×2), telle que
    /// `BubbleContent.emojiOnlyResult` l'a résolue pour les autres modes ;
    /// `nil` : un texte ordinaire (ou rien à lire : vue unique scellée).
    let emojiFontSize: CGFloat?

    init(
        bubble: RiverLaneResolver.RiverBubble,
        senderDisplayName: String,
        colorSeed: String,
        timeString: String,
        text: String,
        layout: RiverLaneResolver.RiverLayout,
        replyPreview: RiverReplyPreview? = nil,
        systemNotice: RiverSystemNotice? = nil,
        groupPosition: RiverGroupPosition = .solo,
        // **Défauts `nil`, et c'est le sens SÛR.** Un site de montage qui les
        // ignore obtient le comportement d'avant — aucun badge, aucun
        // détachement — jamais un badge fabriqué ni une carte vide. Les suites
        // antérieures à ce lot restent donc justes sans être touchées.
        //
        // Posés AVANT `identity` : ils décrivent le MESSAGE, là où `identity`
        // décrit sa VOIX. L'ordre d'un init se lit, et grouper les faits d'un
        // même sujet évite qu'un appelant en oublie un au milieu de l'autre.
        forwardAttribution: ForwardAttribution? = nil,
        storyCitation: ReplyReference? = nil,
        protection: MessageProtectionDescriptor = .unprotected,
        isBurning: Bool = false,
        viewOnceChip: ViewOnceChip.State? = nil,
        isViewOnceRevealed: Bool = false,
        protectedTap: ProtectedContentTap = .none,
        tapAfterReveal: ProtectedContentTap = .none,
        linkEmbed: BubbleContent.Text? = nil,
        linksAreInert: Bool = false,
        contactCards: RiverContactCards = RiverContactCards(items: []),
        capturesBlocked: Bool = false,
        emojiFontSize: CGFloat? = nil,
        identity: RiverBubbleIdentity? = nil
    ) {
        self.bubble = bubble
        self.senderDisplayName = senderDisplayName
        self.colorSeed = colorSeed
        self.timeString = timeString
        self.text = text
        self.layout = layout
        self.replyPreview = replyPreview
        self.systemNotice = systemNotice
        self.groupPosition = groupPosition
        self.identity = identity
        self.forwardAttribution = forwardAttribution
        self.storyCitation = storyCitation
        self.protection = protection
        self.isBurning = isBurning
        self.viewOnceChip = viewOnceChip
        self.isViewOnceRevealed = isViewOnceRevealed
        self.protectedTap = protectedTap
        self.tapAfterReveal = tapAfterReveal
        self.linkEmbed = linkEmbed
        self.linksAreInert = linksAreInert
        self.contactCards = contactCards
        self.capturesBlocked = capturesBlocked
        self.emojiFontSize = emojiFontSize
    }
}

/// Les cartes de visite d'une bulle de rivière. `MeeshyMessageAttachment`
/// n'est pas `Equatable` : l'égalité lit ce qui change le rendu d'une carte.
struct RiverContactCards: Equatable {
    let items: [MessageAttachment]
    var scope: ContactCardResolutionScope = .unknown

    static func == (lhs: RiverContactCards, rhs: RiverContactCards) -> Bool {
        lhs.items.map(\.id) == rhs.items.map(\.id) && lhs.items.map(\.fileUrl) == rhs.items.map(\.fileUrl) && lhs.scope == rhs.scope
    }
}

/// Ce qu'une tête de groupe montre de sa voix, au-delà du nom (R-5) : la
/// pastille devient un vrai avatar (présence, cercle de story), et le nom
/// devient ACTIVABLE — profil pour un compte, fiche d'information pour un
/// visiteur sans compte (`ProfileSheetUser`, le MÊME type que le Fil).
struct RiverBubbleIdentity: Equatable {
    let avatarURL: String?
    let presence: PresenceState?
    let storyRing: StoryRingState
    let profileUser: ProfileSheetUser
    /// Compte de l'auteur — la story s'ouvre par lui ; `nil` pour un visiteur.
    let userId: String?
    /// L'auteur a l'écran de cette conversation ouvert (#8892, #10956).
    var isHere: ConversationHere = .absent
    /// Son contour équipé, la référence servie avec le message (#10946).
    var ring: ServedProfileDecorItem? = nil
}
