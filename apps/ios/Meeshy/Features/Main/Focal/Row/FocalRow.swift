import SwiftUI
import MeeshySDK
import MeeshyUI

/// La rangée plate du Fil (Focal) — contrat §WS-4. Pastille `22`,
/// « Pseudo · HH:mm » en tête de groupe, texte `15` pleine largeur au
/// contenu et citations sur la colonne du nom, méta discrète, AUCUNE bulle.
///
/// **Densité uniforme** : `input.density` n'est PAS lu par ce fichier —
/// « même rangée, densité uniforme, zéro perspective ». Aucun pass de
/// perspective : cette rangée sert le mode Script à plat, sans AUCUN transform —
/// jamais de `.visualEffect`/`.scaleEffect` conditionnel ici (garde source
/// `FocalRowSourceGuardTests`).
///
/// **Contrainte dure (§WS-4)** : aucun `@State` de langue — la sélection
/// active/secondaire vient de `input` (`activeDisplayLangCode`/
/// `secondaryLangCode`) et repart par `actions.onSetActiveDisplayLanguage`/
/// `onSetSecondaryLanguage`.
///
/// **Contrainte dure** : tout contrôle interne est un `Button(.plain)` +
/// `.contentShape(Rectangle())`, jamais `.onTapGesture` seul sur un contrôle
/// interactif (avalé par le long-press du conteneur parent) — `FocalIdentityHeader`
/// (profil) est un `Button(.plain)` ; les gestes de citation/média restent
/// `.onTapGesture` car ce sont des ZONES DE RANGÉE, pas des CONTRÔLES
/// (même patron que la bulle historique, `mediaWithReplyContainer`).
struct FocalRow: View {
    @Environment(\.announcesCapture) private var announcesCapture // #9617 — la surface annonce-t-elle sa capture ?
    let input: FocalRowInput
    let actions: FocalRowActions

    private var content: BubbleContent { input.content }

    /// Retrait CONSTANT du contenu propre ET des citations — la colonne du
    /// nom : l'avatar seul dans sa marge, une seule origine ensuite.
    ///
    /// Constant pour la même raison que `textSize` : le retrait fixe la
    /// largeur disponible, donc le retour à la ligne, donc la hauteur ; le
    /// faire varier avec le focus ferait changer la cellule de taille au
    /// basculement d'élection, et la liste sauterait.
    private var indent: CGFloat {
        FocalMetrics.Row.contentIndent
    }

    /// **Le « 15 → 16 » de §4.6 est ABANDONNÉ, et c'est un choix.**
    ///
    /// Grossir le texte de l'élue relance le calcul de retour à la ligne :
    /// un paragraphe de quatre lignes en 15 peut en faire cinq en 16, et la
    /// cellule change de hauteur. Comme la reconfiguration a lieu à l'ARRÊT
    /// du défilement, ce changement de hauteur déplaçait tout ce qui était à
    /// l'écran — filmé au simulateur, un saut par arrêt de geste.
    ///
    /// Le contrat écrivait cet écart quand la rangée élue n'avait rien
    /// d'autre pour se distinguer. Elle a maintenant sa pastille de 34, son
    /// nom agrandi, sa date complète, sa barre de contrôles — et surtout
    /// l'échelle pleine que le pass de perspective lui donne pendant qu'il
    /// réduit ses voisines. Un point de corps de plus ne vaut pas un
    /// défilement saccadé.
    private var textSize: CGFloat {
        FocalMetrics.Text.size
    }

    var body: some View {
        Group {
            switch content.kind {
            case .deleted, .system:
                systemBody
            case .ephemeralExpired:
                EmptyView()
            case .standard, .viewOnceSealed, .viewOnceOpened:
                standardBody
            }
        }
        // La destruction se VOIT, dans la rangée plate comme dans la
        // bulle : même modificateur, même durée, même repli.
        .ephemeralBurn(isBurning: content.isBurning)
        // Ce que les visionneuses ouvertes depuis cette rangée laissent sortir.
        .contentExitGate(content.exitGate)
        .padding(.top, input.isFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0)
        .padding(.vertical, FocalMetrics.Row.paddingVertical)
        .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
        // Une cellule qui porte encore une hauteur ESTIMÉE (auto-dimension-
        // nement différé pendant le mouvement) propose plus de place que le
        // contenu n'en prend : le contenu reste collé en HAUT, ses espaces
        // internes intacts — jamais centré ni étiré dans le vide.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // Envoi optimiste (matrice §5) : 0,7 d'opacité tant que le gateway
        // n'a pas accusé. La rangée possède son opacité — `cell.alpha` n'a
        // pas d'autre écrivain.
        .opacity(input.isOptimistic ? 0.7 : 1)
        .environment(\.layoutDirection, input.isRightToLeft ? .rightToLeft : .leftToRight)
        // « 1 rangée = 1 élément VoiceOver » (critère §7) : combine tous les
        // enfants + libellé composé par le composeur partagé WS-1 (aucune
        // seconde résolution — le composeur lit `content` seul, comme WS-4
        // le prescrit).
        .accessibilityElement(children: .combine)
        .accessibilityLabel(MessageAccessibilityLabelComposer.compose(content))
        .accessibilityValue(expansionAccessibilityValue)
        .accessibilityActions {
            quotedZoneAccessibilityActions
            expansionAccessibilityActions
        }
    }

    /// La rangée fusionnée absorbe le libellé « Lire la suite » :
    /// l'état se DIT par la valeur, et le geste reste une action nommée.
    private var isLongText: Bool { LongMessageExcerpt.isLong(effectiveText) }

    private var expansionAccessibilityValue: String {
        guard isLongText else { return "" }
        return input.isExpanded ? BubbleExpandableText.expandedValue : BubbleExpandableText.collapsedValue
    }

    @ViewBuilder
    private var expansionAccessibilityActions: some View {
        if isLongText, let toggle = actions.onToggleExpanded {
            Button(input.isExpanded ? BubbleExpandableText.collapseTitle : BubbleExpandableText.readMoreTitle) { toggle() }
        }
    }

    /// **LOI DES ZONES — la moitié VoiceOver.** Site unique des deux rangées :
    /// `QuotedZoneAccessibility`. La citation d'un message VOCAL est
    /// hébergée par le widget audio et n'est pas rendue ici — mais elle vit
    /// sous CETTE rangée, dont le libellé combiné l'absorbe : les actions
    /// valent donc pour elle aussi, `content.reply` étant renseigné dans les
    /// deux cas.
    private var quotedZoneAccessibilityActions: some View {
        QuotedZoneAccessibility.actions(
            reference: content.reply?.reference,
            onQuotedAuthorTap: actions.onQuotedAuthorTap,
            onQuotedMediaTap: actions.onQuotedMediaTap,
            onReplyTap: actions.onReplyTap
        )
    }

    // MARK: - Rangées système (déléguées à WS-3)

    private var systemBody: some View {
        FocalSystemRows.view(
            for: content,
            accentHex: input.accentHex,
            isDark: input.isDark,
            onCallBack: { _ in actions.onCallBack?(input.localId) },
            onLongPress: { actions.onLongPressCallDetail?(input.localId) },
            onOpenParticipantProfile: actions.onOpenParticipantProfile
        )
    }

    // MARK: - Rangée standard

    /// **DEUX COLONNES** : la bulle à gauche, la date et l'accusé au BAS de sa
    /// droite.
    ///
    /// La ligne basse ne porte pas la méta : `FocalRevealedDetail` masque
    /// l'heure et les coches par OPACITÉ, donc une ligne dédiée réserverait,
    /// sous chaque message, une hauteur pleine et son espacement à de
    /// l'invisible.
    ///
    /// `.bottom` est la forme exacte demandée : la date se pose au niveau de la
    /// DERNIÈRE ligne de la bulle, jamais de la première.
    ///
    /// **La carte de focus vit ICI, sur les deux colonnes** : elle est le fond
    /// de la rangée ENTIÈRE, méta comprise. `.messageEffects`, lui, épouse
    /// `contentColumn`, comme le chemin bulle épouse sa bulle : le poser au
    /// niveau de la rangée étirerait le liseré arc-en-ciel sur toute la
    /// largeur de l'écran (355 pt de cadre pour 174 pt de message).
    @ViewBuilder
    private var standardBody: some View {
        HStack(alignment: .bottom, spacing: FocalMetrics.MetaColumn.spacing) {
            // La flamme-œil, dans la gouttière de l'avatar jusqu'à la première lettre.
            contentColumn.afterReadWatermark(content.protection.isAfterRead, gutter: indent, tint: ComposerProtection.ephemeral.tint)
                // Le cadre de l'élu épouse la colonne du
                // MESSAGE, et tout ce qu'il porte y vit ENTIER, à
                // `electedCardMargin` de ses quatre bords — l'identité en haut
                // du bloc, la bande et l'heure sous le contenu. Des
                // superpositions et un fond : aucune hauteur réservée, tout
                // apparaît AVEC le cadre, au tick d'élection.
                //
                // Seul le CONTENU grossit (`focalElectedLoupe`) : le
                // cadre et la bande se posent sur sa mesure réelle, lue par
                // préférence, et gardent leur échelle d'origine.
                .backgroundPreferenceValue(FocalElectedContentKey.self) { elected in
                    if input.isFocused { focusChrome.electedCardBackground(elected) }
                }
                .overlay(alignment: .topLeading) {
                    if input.isFocused { focusChrome.focusIdentityChip.offset(y: -focusLift) }
                }
                .overlayPreferenceValue(FocalElectedContentKey.self) { elected in
                    if input.isFocused { focusChrome.electedStrip(elected) }
                }

            // En focus, `focusStampChip` dit la même chose dans le cadre : la
            // colonne s'efface alors, comme la ligne basse, sans céder sa
            // place — largeur stable, zéro relayout à l'élection.
            FocalMetaColumn(
                isMe: content.isMe,
                timeString: content.meta.timeString,
                deliveryStatus: BubbleFooterModel.glyphStatus(content.meta.deliveryStatus, retryBandShown: isFailedOutgoing),
                isDark: input.isDark,
                editedAt: content.editedAt,
                isEditSaving: content.isEditSaving,
                hasEditHistory: content.hasEditHistory,
                onShowReadStatus: actions.onShowReadStatus.map { show in { show(content.messageId) } }
            )
            .equatable()
            .opacity(input.isFocused ? 0 : 1)
        }
        // Une SUITE magnifiée descend sous sa pastille, en rendu seul.
        .offset(y: focusLift)
        // Le message long DÉPLIÉ (hors élection) garde le bloc de
        // verre de la rangée entière, à ses marges d'origine.
        .background {
            if input.isExpanded && !input.isFocused { focusChrome.focusCardBackground }
        }
        // L'effet épouse le bloc CONTENU, pas la rangée : le chemin bulle pose
        // l'effet sur la bulle elle-même parce qu'« il encadrait du vide », et
        // Focal suit le même périmètre. Sur la rangée entière, le liseré
        // arc-en-ciel s'étirerait sur 355 pt pour 174 pt de message. La méta
        // reste dehors — en Focal c'est une colonne détachée au bord opposé, et
        // l'inclure étirerait le cadre.
        
    }

    private var focusLift: CGFloat {
        input.isFocused ? FocalScrollPerspective.electedContentLift(isFirstInGroup: input.isFirstInGroup) : 0
    }

    private var focusChrome: FocalFocusChrome {
        FocalFocusChrome(input: input, actions: actions, focusLift: focusLift)
    }

    /// La PREMIÈRE colonne — la bulle elle-même. La méta vit dans l'autre
    /// colonne, et la ligne basse est conditionnelle.
    @ViewBuilder
    private var contentColumn: some View {
        VStack(alignment: .leading, spacing: FocalMetrics.Row.paddingVertical) {
            // Les badges éphémère/épinglé/transféré restent AU-DESSUS DE L'IDENTITÉ —
            // avant FocalIdentityHeader, pas après, et indépendants de isFirstInGroup
            // (ce sont des propriétés du MESSAGE, pas du groupe).
            badgesSection

            // Le message EN FOCUS (Focal) porte toujours son identité — avatar,
            // présence, mood, jour et heure — même en continuation de groupe.
            // Tête de groupe : en focus, l'identité et la date passent SUR
            // les lignes de la carte (chips) — l'en-tête garde sa
            // place et s'efface, la hauteur de la rangée ne dépend jamais du
            // focus (instantané, zéro relayout).
            if input.isFirstInGroup {
                FocalIdentityHeader(
                    isMe: content.isMe,
                    senderDisplayName: input.senderDisplayName,
                    senderUsername: input.senderUsername,
                    senderAvatarURL: input.senderAvatarURL,
                    senderThumbHash: input.senderThumbHash,
                    senderColorHex: input.senderColorHex,
                    senderPresence: input.senderPresence,
                    senderIsHere: input.senderIsHere,
                    senderStoryRing: input.senderStoryRing,
                    senderMoodEmoji: input.senderMoodEmoji,
                    senderIsAnonymous: input.senderIsAnonymous, senderRing: input.senderRing,
                    profileUser: input.profileSheetUser,
                    isDark: input.isDark,
                    // WS-10 (F-089) : `input.showsAgentGrammar` PORTE DÉJÀ la
                    // décision finale (précalculée par le mux qui construit
                    // `FocalRowInput`, contrat §3.6) — cette rangée ne relit
                    // JAMAIS `MeeshyFeatureFlags.isAgentGrammarEnabled`
                    // elle-même (garde « vue pure », même règle que
                    // `input.density`). `AgentAuthoredStyle.resolve` re-gate
                    // quand même sur ce booléen : `.human` tant qu'il reste
                    // `false` (défaut de ce chantier).
                    agentStyle: AgentAuthoredStyle.resolve(
                        isAgentAuthored: input.isAgentAuthored,
                        isAgentGrammarEnabled: input.showsAgentGrammar
                    ),
                    onOpenProfile: actions.onOpenProfile,
                    onMoodTap: actions.onMoodTap
                )
                .opacity(input.isFocused ? 0 : 1)
            }

            // Matrice §5 « Éphémère / flou / vue unique » : le flou de
            // niveau MESSAGE s'applique au BLOC CONTENU (citation comprise),
            // jamais à l'identité ni à la méta : un message protégé ne s'affiche
            // jamais EN CLAIR en Focal. L'état de
            // révélation vit dans la feuille (`FocalProtectedContent`),
            // FocalRow reste sans @State (contrainte dure §WS-4).
            //
            // Le wrapper ne se MONTE que pour un message protégé — même
            // discipline que le mux de l'hôte (« plan vide ⇒ vue intacte ») :
            // l'écrasante majorité des messages n'a pas de flou et ne paie ni
            // le `@StateObject` ni le modificateur. `isBlurred` est stable
            // sur la vie du message, la branche ne bascule pas au recyclage.
            //
            // **Le voile couvre aussi la VUE UNIQUE, pas seulement le flou.** Un
            // message qu'on ne peut lire qu'une fois doit être un CHOIX, donc voilé
            // jusqu'au toucher qui le consomme (« Voir une fois » couvre le texte
            // comme les médias).
            Group {
                if let chip = content.viewOnceChipState {
                    ViewOnceChip(state: chip, isDark: input.isDark, hint: content.protectedTap().accessibilityHint) { actions.onConsumeViewOnce?(content.messageId) { _ in } }
                } else if content.requiresVeil {
                    FocalProtectedContent(
                        isBlurred: true,
                        isViewOnce: content.veilConsumesViewOnce,
                        isDark: input.isDark,
                        messageId: content.messageId,
                        onConsumeViewOnce: actions.onConsumeViewOnce,
                        tap: content.protectedTap()
                    ) {
                        contentSections
                    }
                } else {
                    contentSections.viewOnceRetouch(isActive: content.viewOnceRetouchIsActive) { actions.onConsumeViewOnce?(content.messageId) { _ in } }
                }
            }
            // Annoncé OU noir (Focal et Script).
            .captureShield(content.captureVerdict.shieldsCapture(surfaceAnnounces: announcesCapture))
            .focalElectedLoupe(isFocused: input.isFocused, rowWidth: input.availableWidth)

            failedRetrySection

            // **UNE seule ligne basse**, qui ne porte QUE les drapeaux et les
            // réactions (la date et les coches vivent dans `FocalMetaColumn`) : elle
            // est CONDITIONNELLE. Sans drapeau ni réaction (le cas nominal), aucune
            // ligne n'est réservée — une ligne réservée à une information invisible
            // serait l'essentiel du blanc entre deux messages.
            //
            // C'est aussi la disposition de la bande du message magnifié
            // (`focusStrip` … `focusStampChip`) : les deux modes disent la même
            // chose au même endroit.
            //
            // La garde (`translation != nil || showsReactions`) est celle d'origine ;
            // lui confier la méta la rendrait inconditionnelle.
            //
            // Pas de réserve sous le texte d'un élu sans ligne basse : la bande ne
            // chevauche pas la dernière ligne, elle se pose ENTIÈRE sous le contenu.
            // La rangée ne change donc pas du tout de hauteur à l'élection.
            if mountsBottomLine {
                flagAndReactionsRow
                    // En focus, la bande du cadre remplace visuellement cette
                    // ligne — qui garde sa place (hauteur stable).
                    .opacity(input.isFocused ? 0 : 1)
            }
        }
        // L'effet se pose ICI : AVANT l'étirement ci-dessous, donc sur la
        // largeur NATURELLE du contenu. Posé après, il épouserait la laisse et
        // non le message — 355 pt de liseré arc-en-ciel pour 174 pt de texte.
        // `.frame(maxWidth:)` ÉTEND, il ne
        // borne pas : tout modificateur visuel monté après lui hérite de
        // l'écran, pas du contenu.
        .messageEffects(RainbowLetters.rowEffects(input.effects))
        // La bulle prend toute la laisse que la colonne lui laisse : sans cela
        // une rangée courte se rétracterait sur son texte et sa date viendrait
        // se coller au mot, au lieu de tenir la marge droite comme les autres.
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// **La ligne basse se monte-t-elle ?** La règle est éprouvée dans
    /// `FocalMetaColumn.mountsBottomLine` — jamais réécrite ici. Elle porte
    /// deux gardes, hors d'atteinte de toute assertion si elles étaient
    /// inline : pas de drapeau en clair sur un message voilé, un seul jeu de
    /// drapeaux par groupe.
    private var mountsBottomLine: Bool {
        FocalMetaColumn.mountsBottomLine(
            hasTranslation: content.translation != nil,
            isBlurred: content.requiresVeil,
            isLastInGroup: input.isLastInGroup,
            hasReactions: mountsReactions
        )
    }

    // MARK: - Badges éphémère/épinglé/transféré

    /// `content.isPinned`/`content.isForwarded`/`content.protection` LUS et
    /// RENDUS — réutilise `BubblePinnedIndicator`/`BubbleForwardedIndicator`
    /// (§1.3, `internal`, vérifiés non `fileprivate`) TELS QUELS ; le chrome de
    /// protection est partagé avec la bulle (voir plus bas).
    ///
    /// **L'attribution est la MÊME qu'en bulle.** `BubbleContent.forwardAttribution`
    /// porte la valeur tranchée par `ForwardBadgePolicy` au site unique
    /// qu'est `BubbleContentBuilder` — pas une seconde résolution inventée ici,
    /// mais la PREMIÈRE, remontée là où les trois peaux la partagent. Une
    /// règle de confidentialité résolue à deux endroits est une règle qui
    /// divergera.
    @ViewBuilder
    private var badgesSection: some View {
        if content.isPinned {
            BubblePinnedIndicator()
        }
        if let attribution = content.forwardAttribution {
            BubbleForwardedIndicator(isMe: content.isMe, isDark: input.isDark, attribution: attribution)
        }
        // LE chrome de protection, partagé avec la bulle, la rivière
        // et le résumé.
        MessageProtectionChrome(descriptor: content.chromeProtection, isDark: input.isDark)
            .equatable()
    }

    // MARK: - Réactions live en pilule plate méta

    /// Réutilise `BubbleReactionsOverlay` (§1.3, `internal`, vérifié non
    /// `fileprivate`) TEL QUEL — pilule `11`pt, fond `backgroundSecondary`,
    /// comptes monospaced, pop `springBouncy` à l'arrivée, picker/détail
    /// inchangés : exactement F05. Le bouton `(+)` d'ajout rapide suit la
    /// MÊME règle que la bulle (`BubbleReactionsOverlay.isMounted`) : sur le
    /// dernier message reçu (`input.isLastReceivedMessage`, fourni par
    /// l'hôte).
    // (réactions : fusionnées dans `flagAndReactionsRow` — drapeau premier,
    // même ligne)



    /// La citation est rendue ICI sauf quand le lecteur audio l'héberge. Le
    /// bloc média nu n'en loge aucune : la règle de la bulle
    /// (`visualHostsReply`) n'a pas cours dans la rangée plate.
    private var showsQuotedReply: Bool { content.flatRowDrawsQuote }

    /// Le geste de la carte de scène, ou `nil` — même règle que la bulle : sans
    /// identifiant il n'y a rien à ouvrir, et un tap qui n'ouvre rien est une
    /// cible morte (loi 4). La carte, elle, se rend quand même : c'est la
    /// citation qui « subsiste » quand la story a expiré.
    private var storyCitationOpenTap: (() -> Void)? {
        guard let citation = content.flatRowStoryCitation,
              citation.opensQuotedTarget,
              let onStoryReplyTap = actions.onStoryReplyTap else { return nil }
        return { onStoryReplyTap(citation.messageId) }
    }

    /// Le bloc contenu protégé par le flou de message — citation + médias +
    /// audio + non-média + texte. Le VStack reprend le MÊME espacement que la
    /// pile parente : hauteur de rangée identique, wrapper monté ou pas.
    private var contentSections: some View {
        VStack(alignment: .leading, spacing: FocalMetrics.Row.paddingVertical) {
            // **Vue `3h` — une story citée est une SCÈNE ici aussi.**
            //
            // `FocalQuotedReplyView` ne rend pas la citation d'une story : un carré
            // de 38 pt sur une ligne « 📷 Story · il y a 3 h » serait ce que la
            // doctrine appelle *aplatie*, et la bulle suit la même règle.
            //
            // La règle de détachement n'est pas réécrite : elle vit sur
            // `BubbleContent`, que cette rangée reçoit déjà. Un `else if` plutôt
            // que deux `if` — les deux rendus s'excluent par CONSTRUCTION, pas
            // par la coïncidence de deux prédicats qui pourraient diverger.
            if let storyCitation = content.flatRowStoryCitation {
                FocalStoryCitationQuote(
                    reply: storyCitation,
                    isDark: input.isDark,
                    accentHex: input.accentHex,
                    onOpen: storyCitationOpenTap
                )
            } else if showsQuotedReply, let reply = content.reply {
                FocalQuotedReplyView(
                    reply: reply,
                    accentHex: input.accentHex,
                    isDark: input.isDark,
                    mentionDisplayNames: input.mentionDisplayNames,
                    onReplyTap: actions.onReplyTap,
                    onStoryReplyTap: actions.onStoryReplyTap,
                    onQuotedMediaTap: actions.onQuotedMediaTap
                )
                // Le rail de la citation est une forme (souple en hauteur) :
                // dans une cellule qui porte encore une hauteur ESTIMÉE, la
                // pile lui donnerait tout l'espace en trop — citation étirée,
                // rail d'un écran. La citation prend sa
                // hauteur idéale, rien de plus.
                .fixedSize(horizontal: false, vertical: true)
            }

            visualBlock
            audioBlock
            nonMediaBlock
            textOrEmojiBlock
            linkEmbedBlock
        }
    }

    /// La carte de conversation, la façade vidéo ou l'aperçu de lien du
    /// premier lien — le MÊME `BubbleLinkEmbed` que la bulle, dans Focal,
    /// Script et Rivière. Même garde que le texte
    /// (le widget audio qui héberge la légende n'a pas de carte en bulle non
    /// plus) ; un sticker ou un emoji seul ne porte aucun lien.
    @ViewBuilder
    private var linkEmbedBlock: some View {
        if content.sticker == nil, audioMode != .hostsCaption, let text = content.text, !text.isEmojiOnly {
            BubbleLinkEmbed(text: text, accentColor: input.accentHex, isDark: input.isDark)
                .padding(.leading, indent)
        }
    }

    /// Matrice §5 « Envoi optimiste / échec » : « Bande orange de retry
    /// inchangée, exclue de la perspective ». Réutilise
    /// `BubbleFailedRetryBar` TELLE QUELLE (§1.3 — spinner, blink gaté
    /// Reduce Motion, a11y) ; seule sa POSE change : une bande compacte sous
    /// le contenu au retrait de colonne, à la place de l'onglet de bord de
    /// bulle. `onRetry` est câblé par l'hôte et consommé ici : un message
    /// échoué offre un moyen de le renvoyer.
    private var isFailedOutgoing: Bool {
        content.isMe && content.meta.deliveryStatus == .failed
    }

    @ViewBuilder
    private var failedRetrySection: some View {
        if isFailedOutgoing {
            BubbleFailedRetryBar(onRetry: { actions.onRetry?(input.localId) })
                .frame(width: 72, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous))
                .padding(.leading, indent)
        }
    }

    private var audioMode: FocalAudioMode { FocalAudioRouting.mode(for: content) }

    @ViewBuilder
    private var visualBlock: some View {
        let items = FocalAudioRouting.visualAttachments(in: content)
        if !items.isEmpty {
            FocalAttachmentBlock(
                items: items,
                accentHex: input.accentHex,
                messageDeliveryStatus: content.meta.deliveryStatus ?? .sent,
                onMediaTap: actions.onMediaTap,
                onConsumeViewOnce: actions.onConsumeViewOnce,
                onReactToAttachment: actions.onReactToAttachment,
                maxWidth: FocalMediaGridLayout.gridWidth(rowWidth: input.availableWidth)
            )
        }
    }

    @ViewBuilder
    private var audioBlock: some View {
        if audioMode != .none {
            FocalAudioBlock(
                content: content,
                accentHex: input.accentHex,
                isDark: input.isDark,
                allAudioItems: input.allAudioItems,
                translatedAudios: input.translatedAudios,
                mentionDisplayNames: input.mentionDisplayNames,
                conversationName: input.conversationName,
                // Le drapeau-toggle de la rangée pilote AUSSI la piste audio
                // et ses segments karaoké — même bascule
                // que le texte (`activeDisplayLangCode`), une seule loi.
                activeAudioLanguage: input.activeDisplayLangCode,
                voiceConsentMissing: input.voiceConsentMissing,
                onPlayAudio: actions.onPlayAudio,
                onRequestTranslation: actions.onRequestTranslation,
                onShowTranslationDetail: actions.onShowTranslationDetail,
                onReplyTap: actions.onReplyTap,
                onStoryReplyTap: actions.onStoryReplyTap,
                onQuotedAuthorTap: actions.onQuotedAuthorTap,
                onQuotedMediaTap: actions.onQuotedMediaTap,
                audioQueueTailProvider: actions.audioQueueTailProvider,
                onTapConsentNotice: actions.onTapConsentNotice,
                onMediaTap: actions.onMediaTap
            )
        }
    }

    /// Pièces jointes non-média (fichier) de `content.attachments`, panier
    /// `.nonMedia`/`.mixed` — même switch que `visualBlock`/`audioBlock`
    /// (`FocalAudioRouting`), un accesseur pur par consommateur, patron
    /// déjà établi trois fois dans ce chantier (`BubbleStandardLayout`,
    /// `MessageAccessibilityLabelComposer`, ici).
    private var nonMediaAttachments: [MessageAttachment] {
        switch content.attachments {
        case .nonMedia(let items): return items
        case .mixed(_, _, let items): return items
        case .none, .visualGrid, .audio: return []
        }
    }

    /// Lieu partagé (`content.location`) et fichiers (`nonMediaAttachments`)
    /// — corrige la rangée VIDE d'un message « lieu seul »/« fichier seul »
    /// (voir doc de tête de `FocalNonMediaBlock`). Même garde que
    /// `textOrEmojiBlock` : `audioMode == .hostsCaption` ⇒ la bulle
    /// n'atteint jamais `textBubbleContent` non plus (elle héberge la
    /// légende DANS le widget audio) — parité bulle assumée, pas une
    /// correction inventée pour ce cas résiduel.
    @ViewBuilder
    private var nonMediaBlock: some View {
        if FocalNonMediaGate.shouldRender(
            hasSharedPlace: content.location != nil,
            nonMediaCount: nonMediaAttachments.count,
            audioMode: audioMode
        ) {
            // Cartes RÉELLES (LocationMessageView + BubbleAttachmentView, réutilisées
            // telles quelles) : un document est ouvrable en Focal.
            FocalNonMediaBlock(
                items: nonMediaAttachments,
                isDark: input.isDark,
                location: content.location,
                accentHex: input.accentHex,
                isMe: content.isMe,
                onTapLocation: actions.onTapLocation,
                onShareFile: actions.onShareFile
            )
        }
    }

    /// Miroir de la bulle : emoji seul ⇒ grand emoji libre, citation ou non
    /// (`flatRowRendersLargeEmoji`) ; sinon texte normal SI
    /// du contenu existe ET que l'audio ne l'héberge pas déjà en caption
    /// (`audioHostsCaption` ⇒ le texte vit DANS le widget audio, WS-3).
    @ViewBuilder
    private var textOrEmojiBlock: some View {
        if let sticker = content.sticker {
            stickerBlock(sticker)
        } else if content.flatRowRendersLargeEmoji {
            emojiBlock
        } else if content.hasTextOrNonMediaContent && audioMode != .hostsCaption {
            textBlock
        }
    }

    /// **Le sticker se DESSINE en Focal, Script et Rivière comme en Bulles.**
    ///
    /// Ces trois modes partagent cette rangée, qui « reproduit en une seule
    /// décision » ce que `BubbleStandardLayout` fait — sticker compris. Sans
    /// ce cas, un message-sticker serait rendu par son texte de repli,
    /// c'est-à-dire par l'emoji du gabarit quand il en a un, et par rien
    /// quand il n'en a pas.
    ///
    /// Le dessin n'est pas recopié : `MessageStickerArtwork` est l'atome que la
    /// bulle monte aussi. Une règle qui divergerait — la priorité gabarit →
    /// image → emoji, la place réservée avant rasterisation, le mouvement —
    /// divergerait pour les quatre modes à la fois, donc pour aucun.
    ///
    /// Il vient AVANT l'emoji-only : un sticker gabarit porte un emoji de repli
    /// (`wireEmoji`), si bien qu'un message-sticker peut satisfaire
    /// `isEmojiOnly` et se faire rendre comme un gros emoji — le repli servi à
    /// la place de la chose, alors que la chose est disponible.
    ///
    /// Le côté est celui de la rangée, plus petit que dans la bulle : le Focal
    /// tient une colonne de texte, pas une carte.
    @ViewBuilder
    private func stickerBlock(_ sticker: BubbleContent.Sticker) -> some View {
        MessageStickerArtwork(sticker: sticker, side: FocalMetrics.Sticker.side)
            .stickerFloat()
            .stickerSheetOnTap(sticker: sticker, isMine: content.isMe, senderName: content.senderName)
            .padding(.leading, indent)
            .accessibilityLabel(BubbleSticker.accessibilityLabel(for: sticker))
    }

    /// L'emoji seul prend la taille de `content.text.emojiFontSize` (×4 / ×3 /
    /// ×2), jamais recalculée ici — et à la taille EXACTE
    /// (`MeeshyFont.emoji`) : `relative` la plafonnerait à 34 pt.
    /// Rendu du texte ORIGINAL (`raw`), jamais traduit — même règle que
    /// `BubbleStandardLayout.emojiOnlyContent` (lu, jamais modifié).
    private var emojiBlock: some View {
        Text(content.text?.raw ?? "")
            .font(content.text?.emojiFontSize.map(MeeshyFont.emoji)
                  ?? MeeshyFont.relative(FocalMetrics.Text.size))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, indent)
    }

    /// `BubbleExpandableText` (§1.3, lu jamais modifié) résout déjà `15`pt
    /// en interne (`MessageTextRenderer.render(fontSize: 15, …)`) — IDENTIQUE
    /// à `FocalMetrics.Text.size` (`MeeshyFont.bodySize`), aucun `.font()`
    /// externe à appliquer. Seul l'interligne additif (`1.42`, `.lineSpacing`
    /// est en points côté SwiftUI) et le retrait du contenu sont posés ICI.
    ///
    /// **Signal multi-langue** : ni icône
    /// translate, ni bande de drapeaux dans la rangée — le menu d'appui
    /// long demande/affiche les autres langues. Le SEUL indicateur est le
    /// drapeau de la langue D'ORIGINE, affiché UNIQUEMENT quand le message
    /// existe en plusieurs versions (`content.translation != nil`). Aucune
    /// seconde résolution : `originalLangCode` est déjà résolu par
    /// `BubbleContentBuilder`.
    /// Texte effectif de la rangée — `text.raw` EST déjà le contenu résolu
    /// par `BubbleContentBuilder` (Prisme + bascule manuelle
    /// `activeDisplayLangCode`), le même que la bulle. Une préférence
    /// `preferredContent ?? raw` court-circuiterait la bascule V.O. : le
    /// drapeau-toggle changerait `activeLangCode` sans jamais changer le
    /// texte de la rangée plate. Partagé par le rendu, l'extrait du message
    /// long et la clé du cross-fade.
    private var effectiveText: String {
        content.text?.raw ?? ""
    }

    private var textBlock: some View {
        HStack(alignment: .top, spacing: 4) {
            // Le drapeau-toggle ne vit pas ICI : il est posé en BAS de la
            // rangée, avant les réactions (`versionFlagSection`) —
            // commun au texte et à l'audio traduit.
            BubbleExpandableText(
                content: effectiveText,
                // La rangée plate n'a AUCUN fond teinté : `isMe` ferait passer
                // le texte en blanc (règle de la bulle « sur ma bulle
                // accent ») — illisible en mode clair.
                isMe: false,
                mentionDisplayNames: input.mentionDisplayNames,
                highlightTerm: input.highlightSearchTerm,
                mentionTint: MeeshyColors.mentionColor(isDark: input.isDark),
                hashtagTint: MeeshyColors.hashtagColor(isDark: input.isDark),
                linkTint: Color(hex: input.accentHex),
                isDark: input.isDark,
                trackedLinks: content.text?.trackedLinks ?? [:], linksAreInert: content.text?.linksAreInert == true,
                fontSize: textSize,
                // Aucune entrée gouvernant la HAUTEUR ne dépend de
                // `isFocused` (decisions.md) : seul le
                // dépliage, geste explicite, change la hauteur — et l'hôte
                // l'anime sans saut de défilement.
                expansion: expansion,
                // L'arc-en-ciel de la rangée plate colore les LETTRES (aucune bulle à entourer).
                rainbowSeed: RainbowLetters.seed(for: input.effects, messageId: input.localId)
            )
            .equatable()
            .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: textSize))
            // Matrice §5 « Traductions qui arrivent » : « swap du texte en
            // place (cross-fade 150 ms) ». L'identité suit le texte effectif :
            // quand la traduction préférée arrive après coup (reconfigure
            // ciblé), l'ancien rendu se fond dans le nouveau — fondu
            // d'opacité pur, toléré sous Reduce Motion (doctrine effets).
            .id(effectiveText)
            .transition(.opacity)
        }
        .padding(.leading, indent)
        .animation(.easeInOut(duration: 0.15), value: effectiveText)
    }

    /// Le dépliage EN PLACE, tenu par l'hôte : un seul message
    /// déplié à la fois. Sans hôte, le texte garde son état local.
    private var expansion: LongMessageExpansion? {
        actions.onToggleExpanded.map { LongMessageExpansion(messageId: input.localId, isExpanded: input.isExpanded, toggle: $0) }
    }

    // La production du drapeau passe par `LanguageFlagChip.flag(for:)`, source
    // unique (`LanguageDisplay`) : un repli unique sur 🌐 ne distinguerait
    // AUCUNE langue d'une autre, d'où le code en capitales — « un code se lit
    // et se reconnaît ».

    /// Drapeau-toggle + réactions sur LA MÊME LIGNE, le drapeau en PREMIER
    /// (jamais sur une ligne à part).
    /// Rendue pour tout message multi-versions (texte traduit ET attachement
    /// audio porteur de traductions — le builder pose `content.translation`
    /// dès que `translations` OU `translatedAudios` est non vide) et/ou
    /// porteur de réactions.
    /// Le (+) et les pastilles se montent selon la règle de la bulle —
    /// calculé HORS de `flagAndReactionsRow` (garde « drapeau en premier »).
    private var mountsReactions: Bool {
        BubbleReactionsOverlay.isMounted(
            hasReactions: !content.reactions.isEmpty,
            isMe: content.isMe,
            isLastReceivedMessage: input.isLastReceivedMessage
        )
    }

    @ViewBuilder
    /// La ligne BASSE — drapeaux et réactions.
    ///
    /// **Elle ne se monte QUE si elle a quelque chose à montrer**, et c'est
    /// `mountsBottomLine` qui en décide.
    ///
    /// La date et les coches vivent dans une COLONNE à part : la ligne n'a donc
    /// aucune raison de se monter sans drapeau ni réaction, et la garde
    /// (`translation != nil || showsReactions`) est la bonne — élargie de ses
    /// deux exceptions.
    private var flagAndReactionsRow: some View {
        // `mountsReactions` lu DIRECTEMENT plutôt que lié à un `let` : la
        // liaison imposait un `return` explicite, qui DÉSARME le `ViewBuilder`
        // de la propriété. Inoffensif tant que le corps tient en une
        // expression — et un piège dès qu'on y ajoutera une seconde vue, qui
        // ne se monterait alors pas.
        HStack(alignment: .center, spacing: MeeshySpacing.xsPlus) {
            // Jamais de drapeau EN CLAIR sur un message protégé : la bulle floute sa bande de
            // drapeaux avec le contenu — révéler la langue d'origine
            // d'un message voilé fuirait une information. Les réactions,
            // elles, restent hors voile (parité bulle historique).
            //
            // UN SEUL jeu de drapeaux par groupe, sur son DERNIER message
            // (miroir du mode Bulles,
            // où c'est déjà le dernier message qui porte l'identité). Le
            // choix posé ici s'applique à TOUT le groupe
            // (`onSetActiveDisplayLanguageForGroup`) ; changer la langue d'UN
            // message précis du groupe reste possible via la magnification
            // (`focusStrip`, `onSetActiveDisplayLanguage`) ou le long-press.
            if let translation = content.translation, !content.requiresVeil, input.isLastInGroup {
                plainLanguageFlags(translation)
            }
            if mountsReactions {
                BubbleReactionsOverlay(
                    messageId: content.messageId,
                    summaries: content.reactions,
                    isMe: content.isMe,
                    isDark: input.isDark,
                    isLastReceivedMessage: input.isLastReceivedMessage,
                    accentHex: input.accentHex,
                    onAddReaction: actions.onAddReaction,
                    onToggleReaction: actions.onToggleReaction,
                    onOpenReactPicker: actions.onOpenReactPicker,
                    onShowReactions: actions.onShowReactions
                )
                .equatable()
            }

            // Ni `Spacer` ni méta : la ligne se rétracte sur ce
            // qu'elle porte. La date et les coches vivent dans `FocalMetaColumn`.
        }
        .padding(.leading, indent)
    }

    // MARK: - Bordure basse du message EN FOCUS

    /// Les langues proposées sur la bordure : l'originale d'abord, puis les
    /// traductions disponibles, puis la langue AFFICHÉE (sans doublon,
    /// ordre du Prisme) — l'active porte l'anneau plein.
    /// Les drapeaux proposés par une rangée, dédupliqués et PLAFONNÉS.
    ///
    /// Un message qui a plusieurs traductions disponibles liste les 3 premiers
    /// drapeaux sans magnificence, et les 5 premiers en magnificence. Sans
    /// plafond, un message très traduit remplirait sa ligne de drapeaux
    /// jusqu'à la noyer.
    ///
    /// L'ORDRE porte le sens et survit à la coupe : l'original d'abord — c'est
    /// la version que le message est —, puis les traductions disponibles, puis
    /// la langue affichée. Cette dernière est ajoutée en queue et pourrait
    /// donc tomber sous le plafond : elle est ramenée en tête de la coupe
    /// quand elle n'y figure pas, car un drapeau ACTIF invisible serait un
    /// état sans son témoin.
    nonisolated static func focusFlagCodes(
        originalLangCode: String,
        availableFlags: [String],
        activeLangCode: String,
        limit: Int
    ) -> [String] {
        var seen = Set<String>()
        let ordered = ([originalLangCode] + availableFlags + [activeLangCode])
            .filter { seen.insert($0.lowercased()).inserted }
        guard limit > 0, ordered.count > limit else { return ordered }
        let kept = Array(ordered.prefix(limit))
        guard !kept.contains(where: { $0.lowercased() == activeLangCode.lowercased() }) else { return kept }
        return [activeLangCode] + kept.dropLast()
    }

    /// Les drapeaux d'une rangée ORDINAIRE — trois au plus.
    ///
    /// Elle n'en montrait qu'UN, le basculeur original/traduction. Un message
    /// disponible en six langues n'en laissait donc rien paraître hors
    /// magnificence : il fallait l'élire pour découvrir qu'il y avait à
    /// choisir. Toucher un drapeau affiche cette langue — la même action que
    /// sur la ligne du message magnifié, jamais une seconde grammaire.
    @ViewBuilder
    private func plainLanguageFlags(_ translation: BubbleContent.Translation) -> some View {
        HStack(spacing: 4) {
            ForEach(
                Self.focusFlagCodes(
                    originalLangCode: translation.originalLangCode,
                    availableFlags: translation.availableFlags,
                    activeLangCode: translation.activeLangCode,
                    limit: FocalMetrics.FocusStrip.flagLimitPlain
                ),
                id: \.self
            ) { code in
                // Le drapeau-contrôle ne dit pas son état par l'OPACITÉ seule : elle ne
                // dit rien à VoiceOver (WCAG
                // 1.4.1), et « Français » nu ressemble à une étiquette, pas à
                // une action : la source unique porte les deux (trait
                // `.isSelected` + « Afficher en Français »).
                LanguageFlagChip(
                    code: code,
                    isActive: code.lowercased() == translation.activeLangCode.lowercased(),
                    metrics: .compact
                ) {
                    // Rangée ORDINAIRE, montée sur le DERNIER message d'un
                    // groupe : le choix s'applique à tout le groupe.
                    actions.onSetActiveDisplayLanguageForGroup?(content.messageId, code)
                }
            }
        }
    }
}
