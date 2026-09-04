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
}

// MARK: - Contour de groupe — une forme PURE, éprouvée sans monter la vue

/// Le contour PLEIN d'une bulle selon sa position de groupe : fermé des
/// quatre côtés quand elle est seule, OUVERT du côté qu'elle partage avec sa
/// voisine. Le bord partagé n'est pas dessiné ici — c'est la jointure
/// pointillée (`RiverBubbleView.sharedEdge`), posée à part. Les coins ne
/// s'arrondissent qu'aux extrémités du groupe : un fond continu
/// (`UnevenRoundedRectangle`, mêmes rayons) relie les bulles sans encoche.
///
/// Directive produit 2026-08-22 : « bordure jointe en pointillé et partagée,
/// non pas des bordures fermées puis des pointillés en plus ».
struct RiverBubbleOutline: Shape {
    let position: RiverGroupPosition
    let cornerRadius: CGFloat
    let lineWidth: CGFloat

    /// Rayons par coin — `r` aux coins EXTÉRIEURS du groupe, `0` là où la
    /// bulle rencontre sa voisine (même valeur pour le fond et le contour).
    static func cornerRadii(position: RiverGroupPosition, radius: CGFloat) -> RectangleCornerRadii {
        let top: CGFloat = position.joinsAbove ? 0 : radius
        let bottom: CGFloat = position.joinsBelow ? 0 : radius
        return RectangleCornerRadii(topLeading: top, bottomLeading: bottom, bottomTrailing: bottom, topTrailing: top)
    }

    func path(in rect: CGRect) -> Path {
        // Inset d'un demi-trait : le trait reste DANS la bulle, comme
        // `strokeBorder` — le canvas derrière ne le voit jamais déborder.
        let r = rect.insetBy(dx: lineWidth / 2, dy: lineWidth / 2)
        let radius = min(cornerRadius, min(r.width, r.height) / 2)
        var path = Path()
        switch position {
        case .solo:
            path.addRoundedRect(in: r, cornerSize: CGSize(width: radius, height: radius), style: .continuous)
        case .head:
            // Remonte le flanc gauche, ferme le haut par ses deux coins,
            // redescend le flanc droit — le bas reste ouvert.
            path.move(to: CGPoint(x: r.minX, y: r.maxY))
            path.addLine(to: CGPoint(x: r.minX, y: r.minY + radius))
            path.addArc(center: CGPoint(x: r.minX + radius, y: r.minY + radius), radius: radius,
                        startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            path.addLine(to: CGPoint(x: r.maxX - radius, y: r.minY))
            path.addArc(center: CGPoint(x: r.maxX - radius, y: r.minY + radius), radius: radius,
                        startAngle: .degrees(270), endAngle: .degrees(360), clockwise: false)
            path.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        case .middle:
            // Les deux flancs seulement — haut partagé, bas ouvert.
            path.move(to: CGPoint(x: r.minX, y: r.minY))
            path.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            path.move(to: CGPoint(x: r.maxX, y: r.minY))
            path.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        case .tail:
            // Descend le flanc gauche, ferme le bas par ses deux coins,
            // remonte le flanc droit — le haut est partagé.
            path.move(to: CGPoint(x: r.minX, y: r.minY))
            path.addLine(to: CGPoint(x: r.minX, y: r.maxY - radius))
            path.addArc(center: CGPoint(x: r.minX + radius, y: r.maxY - radius), radius: radius,
                        startAngle: .degrees(180), endAngle: .degrees(90), clockwise: true)
            path.addLine(to: CGPoint(x: r.maxX - radius, y: r.maxY))
            path.addArc(center: CGPoint(x: r.maxX - radius, y: r.maxY - radius), radius: radius,
                        startAngle: .degrees(90), endAngle: .degrees(0), clockwise: true)
            path.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        }
        return path
    }
}

/// **Un avis système n'est la voix de personne** — et la peau doit le dire.
///
/// La loi l'a déjà retiré des voix, des couloirs, des connecteurs et des
/// groupes (`RiverLaneResolver`, « ce qu'un avis système n'est pas ») ; elle
/// le sert quand même dans `bubbles`, avec son rang, et documente que « la
/// peau le rend PLEINE LARGEUR ». Ce type porte de quoi le faire — en
/// réutilisant les vues et les clés i18n du Fil, jamais un libellé réécrit
/// pour la Rivière.
enum RiverSystemNotice: Equatable {
    /// « X a rejoint la conversation » — `BubbleJoinNoticeView`, qui sait dire
    /// l'arrivant sans compte et les droits du lien d'entrée.
    case join(BubbleContent.JoinNotice)
    /// Résumé d'appel — `BubbleCallNoticeView`, la carte compacte du Fil.
    case call(BubbleContent.CallNotice)
    /// Tout autre jalon, déjà localisé par l'appelant.
    case plain(String)
}

/// « La citation est une RÉFÉRENCE, pas une relecture » (§7ter A4) — une
/// seule ligne tronquée, même règle que `FocalQuotedReplyView`.
struct RiverReplyPreview: Equatable {
    let authorDisplayName: String
    let text: String
}

// MARK: - Initiales — pures, testables sans monter la vue

/// Extrait de la vue pour que `RiverBubbleLayoutTests` puisse l'éprouver
/// sans SwiftUI (§ tests possibles sans runtime UIKit complet).
nonisolated enum RiverBubbleLayout {
    /// Une ou deux lettres majuscules — premier caractère du premier mot, et
    /// du second s'il existe. Purement typographique : le SENS de « Toi »
    /// (résolution `isViewer`) est une affaire de l'appelant, pas de ce
    /// calcul.
    static func initials(for displayName: String) -> String {
        let letters = displayName
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .prefix(2)
            .compactMap { $0.first }
        guard !letters.isEmpty else { return "?" }
        return String(letters).uppercased()
    }
}

// MARK: - La bulle

/// La bulle Rivière — anatomie GELÉE de la rangée plate du Fil (`thread.*`,
/// §7ter A2) posée SUR la ligne de son auteur.
///
/// **§7ter A.5 (amendement, 2026-08-17) — l'identité est AU-DESSUS de la
/// bulle, HORS d'elle.** La première forme rendait la pastille+nom+heure
/// DANS le haut de la bulle, pour éviter que le trait ne traverse un mot :
/// la vraie réponse n'était pas de déplacer l'identité, c'est de BORNER le
/// nom à `RiverMetrics.Bubble.identityNameMaxWidth` (~44 % de
/// `contentWidth`, relevé sur la maquette normative) — la branche descend à
/// l'aplomb du CENTRE du couloir, donc elle croise TOUJOURS du vide dans la
/// rangée d'identité, entre le nom borné et l'heure. Une peau n'a AUCUNE
/// découpe à calculer : le trait (`RiverLaneCanvas`) passe DERRIÈRE (posé en
/// `.background` du grid par `RiverStreamHost`), et c'est le fond OPAQUE de
/// `messageBox` qui l'interrompt de lui-même — la rangée d'identité, elle,
/// n'a pas de fond, donc le trait s'y voit passer, dans le vide entre le nom
/// et l'heure.
///
/// **§7ter A.6 — l'habillage du contour suit le VERDICT DE FORME.** En
/// couloirs (`layout == .lanes`), une ligne ABORDE la bulle : contour
/// complet, même couleur/épaisseur que le trait (`RiverMetrics.Line.width`)
/// — « le bord de la bulle EST un segment de sa ligne » (amendement R). En
/// vue sérialisée, AUCUNE ligne ne l'aborde (l'axe horizontal a été retiré
/// par la loi, §7ter C) : un contour complet coloré y mimerait une branche
/// qui n'existe plus. Restent le bord GAUCHE et le bord BAS (couleur
/// d'auteur, même épaisseur que le trait), le reste neutre
/// (`RiverMetrics.Bubble.flatBorderWidth`, 1pt).
///
/// **Lot G (2026-08-22) — deux bulles d'un même groupe partagent UNE
/// bordure.** Le contour suit la position de groupe (`RiverGroupPosition`,
/// déduite purement par `RiverConversationMapping.groupPositions`) : fermé
/// quand la bulle est seule, OUVERT du côté où la voisine se colle, et le
/// bord partagé est un POINTILLÉ unique (`sharedEdge`) porté par la bulle qui
/// continue. Le fond (`UnevenRoundedRectangle`) n'arrondit que les coins
/// extérieurs du groupe — une seule surface, sans encoche. La forme du 21/08
/// (contours fermés + couture pointillée intercalée) est retirée.
///
/// **« Le message en ENTIER »** (§7ter A1) : AUCUN `.lineLimit` sur le texte
/// principal — c'est ce qui rend la hauteur du rang MESURÉE plutôt que
/// supposée. La citation d'une réponse, elle, reste UNE ligne tronquée
/// (`RiverReplyPreview`, A4).
///
/// **Ne mesure pas sa propre position.** Elle publie son cadre — identité
/// COMPRISE, désormais — via `MessageFramePreferenceKey`, la MÊME primitive
/// que le Fil (`Features/Main/Views/MessageFrameTracker.swift`, réutilisée
/// TELLE QUELLE, jamais un second `PreferenceKey` concurrent), sur le
/// conteneur EXTÉRIEUR de cette vue (identité + bulle) — dans le repère
/// `RiverCoordinateSpace.name`. `RiverLaneCanvas` LIT ce cadre pour tracer la
/// ligne ; cette vue ne trace rien, elle pose du texte (garde R15 : aucune
/// géométrie recalculée ici). C'est cette mesure ÉLARGIE, sans aucun
/// changement dans `RiverLaneCanvas.swift`, qui fait traverser le trait par
/// la rangée d'identité : le tracé est déjà, par construction, une ligne
/// droite du haut du cadre mesuré à sa base.
struct RiverBubbleView: View, Equatable {
    let content: RiverBubbleContent
    let contentWidth: CGFloat
    /// R-6 — « la citation mène à sa cible » : tap sur la citation ⇒ l'hôte
    /// pose le curseur sur le message cité et le cadre. Reçu, jamais résolu
    /// ici : cette vue ne connaît ni la géométrie ni le défilement.
    var onOpenReply: ((String) -> Void)? = nil
    /// R-5 — le nom (et l'avatar) ouvrent la fiche de la voix ; le cercle de
    /// story non lue ouvre sa story. Reçus de l'hôte, jamais résolus ici.
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    var onViewStory: ((String) -> Void)? = nil
    /// Lot 3 — l'appui long : « Ouvrir dans le fil » (retour Script +
    /// atterrissage, comme Résumé), « Répondre » (Script + composeur),
    /// « Copier ». Les deux premiers sont des actes de l'hôte.
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    static func == (lhs: RiverBubbleView, rhs: RiverBubbleView) -> Bool {
        lhs.content == rhs.content && lhs.contentWidth == rhs.contentWidth
    }

    private var colorHex: String { DynamicColorGenerator.colorForName(content.colorSeed) }
    private var laneColor: Color { Color(hex: colorHex) }
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Retour produit 2026-08-21 : « les messages s'empilent bord à
            // bord sans espace ». Chaque rang porte SA propre respiration en
            // tête — jamais un `spacing` sur la pile, qui ne saurait pas la
            // remplacer par une couture. Le rythme vertical reste donc
            // constant (`RiverMetrics.Row.gap`), et c'est son CONTENU qui dit
            // s'il s'agit d'un silence ou d'une continuation.
            topSeam
            if content.bubble.isSystem {
                systemNoticeRow
            } else {
                speechRow
            }
        }
    }

    /// Le haut du rang. Une nouvelle voix qui prend la parole gagne du VIDE
    /// (`Row.gap`) ; la MÊME voix qui continue ne gagne RIEN — sa bulle vient
    /// se COLLER à la précédente, bord à bord, et c'est SON contour qui porte
    /// la jointure : un bord haut en pointillé, PARTAGÉ (`sharedEdge`), à la
    /// place d'une couture posée entre deux contours fermés (directive produit
    /// 2026-08-22 — la forme du 21/08, « bulles fermées + trait pointillé en
    /// plus », est retirée). Le groupement lui-même reste une décision de la
    /// LOI (`isFirstInGroup`) — cette vue ne fait que le dessiner.
    @ViewBuilder
    private var topSeam: some View {
        if !content.groupPosition.joinsAbove {
            Color.clear
                .frame(width: contentWidth, height: RiverMetrics.Row.gap)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Avis système — GRAVÉ, jamais une prise de parole

    /// Pleine largeur, centré, heure EN TÊTE : exactement ce que le Fil et
    /// Focal en font (`BubbleJoinNoticeView`, `FocalSystemNoticeRow`), donc
    /// exactement les mêmes vues. Ni pastille d'auteur, ni contour de couloir,
    /// ni heure en base : l'avis n'a pas d'auteur à montrer, et la loi ne lui
    /// a donné aucune branche à porter. Il ne publie PAS son cadre — aucun
    /// trait ne l'aborde, `RiverLaneCanvas` n'a rien à y lire.
    @ViewBuilder
    private var systemNoticeRow: some View {
        Group {
            switch content.systemNotice {
            case .join(let notice):
                BubbleJoinNoticeView(notice: notice, isDark: isDark, timeString: content.timeString)
            case .call(let notice):
                BubbleCallNoticeView(notice: notice, accentHex: colorHex, isDark: isDark)
            case .plain(let text):
                FocalSystemNoticeRow(text: text, isDark: isDark, timeString: content.timeString)
            case .none:
                // Un avis dont l'appelant n'a pas résolu le libellé garde
                // quand même son rang et son heure — le fil ne saute jamais
                // un jalon en silence.
                FocalSystemNoticeRow(text: content.text, isDark: isDark, timeString: content.timeString)
            }
        }
        .frame(width: contentWidth, alignment: .center)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Prise de parole

    private var speechRow: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            if content.bubble.isFirstInGroup {
                identityHeader
            }
            messageBox
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: MessageFramePreferenceKey.self,
                    value: [content.bubble.messageId: proxy.frame(in: .named(RiverCoordinateSpace.name))]
                )
            }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .contextMenu { bubbleMenu }
    }

    // MARK: - Appui long — les actes que le Fil offre déjà, avec ses mots

    /// Les libellés sont CEUX du Fil (`action.reply`, `action.copy`,
    /// `MessageMoreSheet`) — un seul vocabulaire pour un même acte.
    @ViewBuilder
    private var bubbleMenu: some View {
        if let onOpenInThread {
            Button {
                onOpenInThread(content.bubble.messageId)
            } label: {
                Label(
                    String(localized: "riviere.bubble.openInThread", defaultValue: "Ouvrir dans le fil", bundle: .main),
                    systemImage: "text.bubble"
                )
            }
        }
        if let onReply {
            Button {
                onReply(content.bubble.messageId)
            } label: {
                Label(String(localized: "action.reply", defaultValue: "Répondre", bundle: .main), systemImage: "arrowshape.turn.up.left")
            }
        }
        Button {
            UIPasteboard.general.string = content.text
        } label: {
            Label(String(localized: "action.copy", defaultValue: "Copier", bundle: .main), systemImage: "doc.on.doc")
        }
    }

    // MARK: - Corps du message — la bulle proprement dite

    /// Le rectangle qui porte le fond opaque et le contour (§7ter A.6) — SEUL
    /// à porter `contentWidth`/le padding interne. L'identité (`identityHeader`)
    /// N'EN FAIT PLUS PARTIE (§7ter A.5).
    private var messageBox: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            // **#5058 — le badge de transfert, enfin.** La rivière était le seul
            // des quatre modes à n'en afficher AUCUN : pas un repli dégradé
            // comme la rangée plate, une absence. `BubbleForwardedIndicator`
            // est réutilisé TEL QUEL, avec l'attribution que la projection a
            // tranchée — la vue ne décide de rien.
            if let attribution = content.forwardAttribution {
                BubbleForwardedIndicator(
                    isMe: content.bubble.isViewer,
                    isDark: isDark,
                    attribution: attribution
                )
            }

            // **#5059 — une story citée est une SCÈNE ici aussi.**
            //
            // La carte fait 132 pt de large, donc elle tient dans une bulle de
            // rivière (210–540). Elle est posée DANS la bulle et non au-dessus,
            // contrairement à la peau bulle : là-bas la carte se pose sur le
            // fond de la conversation pour ne pas vivre dans le fond COLORÉ
            // d'une bulle ; ici la bulle est neutre (`backgroundSecondary`), et
            // la sortir romprait le contour, les rayons de groupe et la
            // géométrie des couloirs qui la décrivent comme une unité.
            //
            // `onOpen: nil` — DETTE NOMMÉE, pas un oubli. Cette vue n'a aucun
            // canal vers le lecteur de stories (ses actions sont « ouvrir dans
            // le fil » et « répondre »). La carte se rend quand même : c'est la
            // citation qui « subsiste », et un `onTapGesture` posé sans
            // gestionnaire avalerait le tap au lieu de le laisser passer — une
            // cible morte, loi 4.
            if let storyCitation = content.storyCitation {
                BubbleStoryCitationCard(
                    reply: storyCitation,
                    isDark: isDark,
                    accentHex: colorHex,
                    onOpen: nil
                )
                .equatable()
            } else if let replyPreview = content.replyPreview {
                quotedReply(replyPreview)
            }

            // « Le message en ENTIER » (§7ter A1) — pas de lineLimit ici.
            Text(content.text)
                .font(MeeshyFont.relative(FocalMetrics.Text.size))
                .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: FocalMetrics.Text.size))

            // « L'heure d'une bulle doit TOUJOURS être en bas dans la bulle »
            // (arbitrage produit 2026-08-21). Elle ne vivait en base que pour
            // les bulles de SUITE ; une tête de groupe la portait dans sa
            // rangée d'identité, si bien qu'une même conversation lisait son
            // horloge à deux endroits selon le rang.
            footerTime
        }
        // `gutter` reste au propriétaire de la COLONNE (`RiverStreamHost`,
        // l'espace EXTÉRIEUR à la bulle où passe le trait) — jamais dupliqué
        // ici. Le retrait INTÉRIEUR, lui, a son propre token depuis le retour
        // produit du 2026-08-21 : `baseGap` (l'écart de pile entre les blocs)
        // en tenait lieu et laissait le texte coller au contour.
        .padding(.horizontal, RiverMetrics.Bubble.contentPadding)
        .padding(.vertical, RiverMetrics.Bubble.contentPadding)
        .frame(width: contentWidth, alignment: .leading)
        // Le fond n'arrondit que les coins EXTÉRIEURS du groupe : deux bulles
        // jointes forment UNE surface continue, sans encoche à la jointure.
        .background(
            UnevenRoundedRectangle(cornerRadii: cornerRadii, style: .continuous)
                .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
        )
        .overlay(bubbleOutline)
        .overlay(alignment: .top) { sharedEdge }
    }

    private var cornerRadii: RectangleCornerRadii {
        RiverBubbleOutline.cornerRadii(position: content.groupPosition, radius: RiverMetrics.Bubble.detourRadius)
    }

    private var solidOutline: RiverBubbleOutline {
        RiverBubbleOutline(
            position: content.groupPosition,
            cornerRadius: RiverMetrics.Bubble.detourRadius,
            lineWidth: content.layout == .lanes ? RiverMetrics.Line.width : RiverMetrics.Bubble.flatBorderWidth
        )
    }

    /// La JOINTURE — le bord haut d'une bulle qui continue son groupe, en
    /// pointillé (`Row.continuationDash*`), couleur d'auteur. C'est le SEUL
    /// dessin à cet endroit : le contour plein y est ouvert (`RiverBubbleOutline`),
    /// la bulle précédente y est ouverte aussi (`joinsBelow`). Une bordure,
    /// partagée — jamais deux contours fermés plus un trait.
    @ViewBuilder
    private var sharedEdge: some View {
        if content.groupPosition.joinsAbove {
            Path { path in
                path.move(to: CGPoint(x: 0, y: 0.5))
                path.addLine(to: CGPoint(x: contentWidth, y: 0.5))
            }
            .stroke(
                laneColor.opacity(0.55),
                style: StrokeStyle(
                    lineWidth: 1,
                    dash: [RiverMetrics.Row.continuationDashLength, RiverMetrics.Row.continuationDashGap]
                )
            )
            .frame(width: contentWidth, height: 1)
            .accessibilityHidden(true)
        }
    }

    /// §7ter A.6 — l'habillage suit le VERDICT DE FORME, jamais une
    /// préférence de peau (voir la docstring de tête du fichier).
    @ViewBuilder
    private var bubbleOutline: some View {
        if content.layout == .lanes {
            // Contour plein, OUVERT du côté partagé (lot G) — même trait,
            // même couleur que la ligne : « le bord de la bulle EST un segment
            // de sa ligne ».
            solidOutline.stroke(laneColor, lineWidth: RiverMetrics.Line.width)
        } else {
            // Vue sérialisée : contour neutre (ouvert du côté partagé, lui
            // aussi), puis deux barres droites en couleur d'auteur — le flanc
            // gauche sur TOUTE la hauteur (il court le long du groupe), le
            // bas sur la QUEUE ou la bulle seule seulement (sinon la suivante
            // s'y colle) — approximation décorative assumée (deux
            // rectangles, pas une découpe de coin).
            ZStack {
                solidOutline.stroke(neutralOutlineColor, lineWidth: RiverMetrics.Bubble.flatBorderWidth)
                if !content.groupPosition.joinsBelow {
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)
                        Rectangle()
                            .fill(laneColor)
                            .frame(height: RiverMetrics.Line.width)
                    }
                }
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(laneColor)
                        .frame(width: RiverMetrics.Line.width)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// Contour NEUTRE de la vue sérialisée. Aucun système de couleur
    /// « ligne/séparateur » établi côté iOS pour ce sous-système à ce jour
    /// (RE-PREUVE : ni `MeeshyColors`, ni `ThemeManager` ne portent de teinte
    /// nommée « line »/« separator » — écart signalé, pas contourné en
    /// silence) — équivalent le plus proche : la couleur système de
    /// séparation, qui s'adapte déjà light/dark sans travail supplémentaire.
    private var neutralOutlineColor: Color { Color(uiColor: .separator) }

    // MARK: - En-tête d'identité (tête de groupe seulement) — §7ter A.5, HORS de la bulle

    /// R-5 — la pastille devient un avatar VIVANT (présence, cercle de
    /// story) et l'identité entière s'active : un tap ouvre la fiche de la
    /// voix, exactement comme l'en-tête d'identité du Fil
    /// (`FocalIdentityHeader`). Le cercle de story non lue, lui, ouvre la
    /// story — `MeeshyAvatar` arbitre déjà cette priorité.
    @ViewBuilder
    private var identityHeader: some View {
        if let identity = content.identity, let onOpenProfile {
            Button {
                onOpenProfile(identity.profileUser)
            } label: {
                identityRow(identity: identity)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(content.senderDisplayName)
            .accessibilityHint(
                String(localized: "bubble.avatar.viewProfile", defaultValue: "Voir le profil", bundle: .main)
            )
        } else {
            identityRow(identity: content.identity)
        }
    }

    private func identityRow(identity: RiverBubbleIdentity?) -> some View {
        HStack(spacing: 7) {
            avatar(identity: identity)

            // §7ter A.5 — borné à la moitié de la largeur de la bulle : la
            // branche descend à l'aplomb du CENTRE du couloir, cette borne
            // garantit qu'elle croise du vide ici, jamais un mot. Un nom
            // plus long s'élide (`.lineLimit(1)`), comme sur le Fil.
            Text(content.senderDisplayName)
                .font(MeeshyFont.relative(FocalMetrics.Name.size, weight: FocalMetrics.Name.weight))
                .foregroundColor(laneColor)
                .lineLimit(1)
                .frame(
                    maxWidth: contentWidth * RiverMetrics.Bubble.identityNameMaxWidth,
                    alignment: .leading
                )

            Spacer(minLength: 0)
            // L'heure N'EST PLUS répétée ici : elle vit en base de bulle, pour
            // TOUS les rangs (arbitrage produit 2026-08-21). La tête de groupe
            // ne porte plus que l'identité — la pastille et le nom.
        }
        // Même largeur que `messageBox` (`contentWidth`) : la pastille
        // s'aligne sur le bord GAUCHE de la bulle, l'heure sur son bord
        // DROIT — la rangée d'identité partage l'emprise horizontale de la
        // bulle, exactement comme `.idh`/`.bub`, deux enfants directs de
        // `.cell` dans la maquette normative.
        .frame(width: contentWidth, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// L'avatar de la voix — `MeeshyAvatar` (présence, cercle de story,
    /// image ou initiales) dès qu'une identité est là ; la pastille colorée
    /// d'initiales sinon. La COULEUR reste celle du couloir : c'est elle qui
    /// dit à quelle branche la voix appartient.
    @ViewBuilder
    private func avatar(identity: RiverBubbleIdentity?) -> some View {
        if let identity {
            MeeshyAvatar(
                name: content.senderDisplayName,
                context: .custom(FocalMetrics.Avatar.size),
                accentColor: colorHex,
                avatarURL: identity.avatarURL,
                storyState: identity.storyRing,
                presenceState: identity.presence,
                enablePulse: false,
                isDark: isDark,
                onViewStory: identity.userId.flatMap { userId in
                    identity.storyRing == .none ? nil : { onViewStory?(userId) }
                }
            )
        } else {
            Circle()
                .fill(laneColor)
                .frame(width: FocalMetrics.Avatar.size, height: FocalMetrics.Avatar.size)
                .overlay(
                    Text(RiverBubbleLayout.initials(for: content.senderDisplayName))
                        .font(MeeshyFont.relative(FocalMetrics.Avatar.size / 2, weight: .bold))
                        .foregroundColor(.white)
                )
        }
    }

    // MARK: - Heure en base de bulle (rangée de suite)

    private var footerTime: some View {
        HStack {
            Spacer(minLength: 0)
            Text(content.timeString)
                .font(FocalMetrics.Time.font)
                .foregroundColor(metaTint)
        }
    }

    private var metaTint: Color {
        isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
    }

    // MARK: - Citation de réponse — une ligne, jamais plus (§7ter A4)

    @ViewBuilder
    private func quotedReply(_ reply: RiverReplyPreview) -> some View {
        if let targetId = content.bubble.replyToMessageId, let onOpenReply {
            // R-6 : la citation est une RÉFÉRENCE — et une référence se suit.
            Button { onOpenReply(targetId) } label: { quotedReplyLabel(reply) }
                .buttonStyle(.plain)
                .accessibilityHint(
                    String(localized: "riviere.bubble.replyHint", defaultValue: "Ouvre le message cité", bundle: .main)
                )
        } else {
            quotedReplyLabel(reply)
        }
    }

    private func quotedReplyLabel(_ reply: RiverReplyPreview) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(laneColor.opacity(0.6))
                .frame(width: FocalMetrics.Quote.railWidth)
            Text("\(reply.authorDisplayName) · \(reply.text)")
                .font(MeeshyFont.relative(FocalMetrics.Text.size - 2))
                .foregroundColor(metaTint)
                .lineLimit(1)
                .padding(.leading, 8)
        }
        // Le rail prend la hauteur de la LIGNE, jamais celle qu'on lui propose.
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
    }

    // MARK: - Accessibilité

    private var accessibilityLabel: String {
        var parts = [content.senderDisplayName, content.text, content.timeString]
        if let reply = content.replyPreview {
            parts.append(
                String(
                    format: String(localized: "riviere.bubble.replyTo", defaultValue: "en réponse à %@", bundle: .main),
                    reply.authorDisplayName
                )
            )
        }
        return parts.joined(separator: ", ")
    }
}
