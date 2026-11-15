import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La bulle

/// La bulle Rivière — anatomie GELÉE de la rangée plate du Fil (`thread.*`,
/// §7ter A2) posée SUR la ligne de son auteur.
///
/// **§7ter A.5 (amendement) — l'identité est AU-DESSUS de la
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
/// **Lot G — deux bulles d'un même groupe partagent UNE
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
    /// #8283 — tap sur l'APERÇU du média cité ⇒ ce qu'il fait en Script : un
    /// vocal se joue sur place (#8320), une image ou une vidéo s'ouvre en plein
    /// écran. L'hôte retombe lui-même sur le saut quand il n'a rien d'honnête à
    /// jouer ni à ouvrir ; le reste de la citation garde `onOpenReply`.
    var onQuotedMediaTap: ((ReplyReference) -> Void)? = nil
    /// R-5 — le nom (et l'avatar) ouvrent la fiche de la voix ; le cercle de
    /// story non lue ouvre sa story. Reçus de l'hôte, jamais résolus ici.
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    var onViewStory: ((String) -> Void)? = nil
    /// « Ouvrir dans le fil » (retour Script + atterrissage, comme Résumé) —
    /// une action d'accessibilité nommée de la bulle.
    var onOpenInThread: ((String) -> Void)? = nil
    /// #11224 — l'appui long rend la main à l'hôte, qui ouvre LE menu du
    /// message (`presentLongPressMenu`) : mêmes actions, mêmes droits, même
    /// aperçu que dans les autres modes. La Rivière n'a plus de menu à elle.
    var onLongPress: ((String) -> Void)? = nil
    /// #7452 — la consommation d'une vue unique, reçue de l'hôte. `nil` ⇒ le
    /// voile ne se lève pas : `BubbleBlurRevealController.requestReveal` est
    /// fail-closed sur un message qui exige l'accusé serveur. C'est le bon
    /// défaut — un texte à vue unique ne doit jamais s'afficher parce qu'un
    /// site de montage a oublié de brancher son canal.
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)? = nil
    /// #8310 — le plein écran de l'hôte, le MÊME que celui du Fil.
    var onMediaTap: ((MessageAttachment) -> Void)? = nil
    /// #12630 — la respiration de tête appartient au RANG, pas à la bulle : le
    /// cadre publié ne la compte pas, et l'aperçu d'appui long la retire pour
    /// que la bulle tombe au haut de ce cadre.
    var drawsTopSeam = true

    @Environment(\.colorScheme) private var colorScheme

    static func == (lhs: RiverBubbleView, rhs: RiverBubbleView) -> Bool {
        lhs.content == rhs.content && lhs.contentWidth == rhs.contentWidth && lhs.drawsTopSeam == rhs.drawsTopSeam
    }

    private var colorHex: String { DynamicColorGenerator.colorForName(content.colorSeed) }
    private var laneColor: Color { Color(hex: colorHex) }
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // « les messages s'empilent bord à
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
        // #7467 — la destruction se VOIT ici aussi. La rivière était, avec le
        // résumé, l'un des deux modes où un éphémère disparaissait d'un coup.
        .ephemeralBurn(isBurning: content.isBurning, side: .init(isMine: content.bubble.isViewer))
    }

    /// Le haut du rang. Une nouvelle voix qui prend la parole gagne du VIDE
    /// (`Row.gap`) ; la MÊME voix qui continue ne gagne RIEN — sa bulle vient
    /// se COLLER à la précédente, bord à bord, et c'est SON contour qui porte
    /// la jointure : un bord haut en pointillé, PARTAGÉ (`sharedEdge`), à la
    /// place d'une couture posée entre deux contours fermés (« bulles fermées + trait pointillé en
    /// plus », est retirée). Le groupement lui-même reste une décision de la
    /// LOI (`isFirstInGroup`) — cette vue ne fait que le dessiner.
    @ViewBuilder
    private var topSeam: some View {
        if drawsTopSeam, !content.groupPosition.joinsAbove {
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
            // #8303 — la flamme-œil en filigrane, au bord d'attaque de la bulle.
            // #9574 — le contenu protégé, dans la couche sécurisée.
            messageBox.captureShield(content.capturesBlocked)
                .afterReadWatermark(content.protection.isAfterRead, gutter: 36, tint: ComposerProtection.ephemeral.tint, overhang: 22)
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
        .accessibilityActions {
            quotedMediaAccessibilityAction
            openInThreadAccessibilityAction
            menuAccessibilityAction
        }
        .simultaneousGesture(
            // Le geste de la rangée du Fil (`ConditionalBubbleLongPress`) : même
            // durée, même tolérance, même retrait devant une pièce qui a réclamé
            // l'appui, même clavier baissé avant la surcouche.
            LongPressGesture(minimumDuration: MessagePressClaim.rowMinimumDuration, maximumDistance: 6).onEnded { _ in
                guard let onLongPress, !MessagePressClaim.isClaimed() else { return }
                HapticFeedback.medium()
                MessageMenuKeyboard.dismiss()
                onLongPress(content.bubble.messageId)
            },
            including: onLongPress == nil ? .subviews : .all
        )
    }

    /// L'appui long d'un élément COMBINÉ n'est pas garanti sous VoiceOver : le
    /// menu s'ouvre aussi par une action nommée, comme la rangée du Fil.
    @ViewBuilder
    private var menuAccessibilityAction: some View {
        if let onLongPress {
            Button(String(localized: "a11y.message.actions.long_press", bundle: .main)) {
                onLongPress(content.bubble.messageId)
            }
        }
    }

    @ViewBuilder
    private var openInThreadAccessibilityAction: some View {
        if let onOpenInThread {
            Button(String(localized: "riviere.bubble.openInThread", defaultValue: "Ouvrir dans le fil", bundle: .main)) {
                onOpenInThread(content.bubble.messageId)
            }
        }
    }

    /// #8283 — la bulle se lit d'un seul élément : la zone média y devient une
    /// action nommée, présente seulement quand elle est armée, et nommée comme
    /// dans les autres modes (« Écouter le message cité » pour un vocal).
    @ViewBuilder
    private var quotedMediaAccessibilityAction: some View {
        if content.storyCitation == nil, let media = content.replyPreview?.media, let onQuotedMediaTap {
            Button(QuotedZoneAccessibility.mediaActionLabel(for: media.reference)) {
                onQuotedMediaTap(media.reference)
            }
        }
    }

    /// Le texte du message, nu. Extrait pour que le voile de protection
    /// l'enveloppe sans dupliquer sa typographie.
    ///
    /// #8147 — la Rivière tronque désormais comme les autres modes : l'extrait
    /// d'un message long, « … Lire la suite », dépliage en place. L'état vient
    /// de l'hôte par l'environnement (`longMessageExpansion(_:)`).
    @ViewBuilder
    private var riverText: some View {
        if let emojiSize = content.emojiFontSize {
            Text(content.text)
                .font(MeeshyFont.emoji(emojiSize))
                .fixedSize(horizontal: false, vertical: true)
        } else {
            riverExpandableText
        }
    }

    private var riverExpandableText: some View {
        BubbleExpandableText(
            content: content.text,
            isMe: false,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: MeeshyColors.mentionColor(isDark: isDark),
            hashtagTint: MeeshyColors.hashtagColor(isDark: isDark),
            linkTint: laneColor,
            isDark: isDark,
            linksAreInert: content.linksAreInert,
            fontSize: FocalMetrics.Text.size
        )
        .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: FocalMetrics.Text.size))
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

            // **#7452 — le décompte, enfin.** La rivière était, avec le résumé,
            // l'un des deux modes où un éphémère ne disait RIEN de son
            // échéance. Le chrome est celui des quatre autres modes, pas un
            // cinquième badge : `MessageProtectionChrome`, monté ici comme
            // `BubbleForwardedIndicator` l'est au-dessus.
            MessageProtectionChrome(descriptor: content.protection, isDark: isDark)
                .equatable()

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
            //
            // #7452 — mais VOILÉ tant que le lecteur n'a pas fait le geste,
            // quand le message est flouté ou à vue unique. La rivière rendait
            // le texte d'une vue unique EN CLAIR, exactement comme la rangée
            // plate avant ce lot. Le wrapper est le même que celui de Focal :
            // il possède l'état de révélation, la rivière reste sans `@State`.
            if let chip = content.viewOnceChip {
                ViewOnceChip(state: chip, isDark: isDark) {
                    onConsumeViewOnce?(content.bubble.messageId) { _ in }
                }
            } else if content.protection.requiresVeil {
                FocalProtectedContent(
                    isBlurred: true,
                    isViewOnce: content.protection.isViewOnce,
                    isDark: isDark,
                    messageId: content.bubble.messageId,
                    onConsumeViewOnce: onConsumeViewOnce,
                    tap: content.protectedTap,
                    tapAfterReveal: content.tapAfterReveal, onMediaTap: onMediaTap
                ) {
                    riverText
                }
            } else {
                riverText
                    .viewOnceRetouch(isActive: content.isViewOnceRevealed) {
                        onConsumeViewOnce?(content.bubble.messageId) { _ in }
                    }
                    .onDisappear {
                        guard content.isViewOnceRevealed else { return }
                        onConsumeViewOnce?(content.bubble.messageId) { _ in }
                    }
            }

            // #8139 — les cartes, par les MÊMES points que les autres modes.
            if let linkEmbed = content.linkEmbed {
                BubbleLinkEmbed(text: linkEmbed, accentColor: colorHex, isDark: isDark)
            }
            ForEach(content.contactCards.items) { attachment in
                BubbleAttachmentView(attachment: attachment, isMe: false, isDark: isDark, accentHex: colorHex, contactCardScope: content.contactCards.scope)
            }

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
        // produit: `baseGap` (l'écart de pile entre les blocs)
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
        HStack(spacing: MeeshySpacing.xsPlus) {
            avatar(identity: identity)

            // §7ter A.5 — borné à la moitié de la largeur de la bulle : la
            // branche descend à l'aplomb du CENTRE du couloir, cette borne
            // garantit qu'elle croise du vide ici, jamais un mot. Un nom
            // plus long s'élide (`.lineLimit(1)`), comme sur le Fil.
            Text(content.senderDisplayName)
                .font(MeeshyFont.relative(FocalMetrics.Name.size, weight: FocalMetrics.Name.weight))
                .foregroundStyle(laneColor)
                .lineLimit(1)
                .frame(
                    maxWidth: contentWidth * RiverMetrics.Bubble.identityNameMaxWidth,
                    alignment: .leading
                )

            Spacer(minLength: 0)
            // L'heure N'EST PLUS répétée ici : elle vit en base de bulle, pour
            // TOUS les rangs. La tête de groupe
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
                isHere: identity.isHere,
                ring: identity.ring,
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
                .foregroundStyle(metaTint)
        }
    }

    private var metaTint: Color {
        isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
    }

    // MARK: - Citation de réponse — une ligne, jamais plus (§7ter A4)

    /// La ligne, puis — #8283 — l'aperçu du média cité, que le rail longe
    /// sans rupture. Deux zones : l'APERÇU joue le vocal sur place ou ouvre le
    /// plein écran, TOUT LE RESTE garde le saut au message cité (R-6).
    private func quotedReply(_ reply: RiverReplyPreview) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            quotedReplyLine(reply)
            if let media = reply.media {
                quotedMediaRow(media)
            }
        }
        .captureShield(reply.capturesBlocked)
    }

    private func quotedMediaRow(_ media: RiverQuotedMedia) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(laneColor.opacity(0.6))
                .frame(width: FocalMetrics.Quote.railWidth)
            RiverQuotedMediaFace(media: media, tint: laneColor, audioTint: metaTint, isArmed: onQuotedMediaTap != nil)
                .equatable()
                .contentShape(Rectangle())
                .onTapGesture { openQuotedMedia(media.reference) }
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel(QuotedZoneAccessibility.mediaActionLabel(for: media.reference))
                .accessibilityAction { openQuotedMedia(media.reference) }
                .padding(.leading, MeeshySpacing.sm)
                .padding(.top, MeeshySpacing.xs)
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
        .onTapGesture { followQuote() }
        .accessibilityAction(named: Text(String(localized: "bubble.reply.go_to_quoted", defaultValue: "Aller au message cité", bundle: .main))) { followQuote() }
    }

    /// La lecture ou le plein écran quand l'hôte l'offre, le saut à l'original
    /// sinon : une zone qu'on touche n'est jamais une cible morte (loi 4).
    private func openQuotedMedia(_ reference: ReplyReference) {
        guard let onQuotedMediaTap else { return followQuote() }
        onQuotedMediaTap(reference)
    }

    private func followQuote() {
        guard let targetId = content.bubble.replyToMessageId else { return }
        onOpenReply?(targetId)
    }

    @ViewBuilder
    private func quotedReplyLine(_ reply: RiverReplyPreview) -> some View {
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
                .foregroundStyle(metaTint)
                .lineLimit(1)
                .padding(.leading, MeeshySpacing.sm)
        }
        // Le rail prend la hauteur de la LIGNE, jamais celle qu'on lui propose.
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
    }

    // MARK: - Accessibilité

    private var accessibilityLabel: String {
        let body = content.viewOnceChip.map(ViewOnceChip.accessibilityLabel(for:)) ?? content.text
        var parts = [content.senderDisplayName, body, content.timeString]
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
