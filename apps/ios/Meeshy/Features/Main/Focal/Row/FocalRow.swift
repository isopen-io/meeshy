import SwiftUI
import MeeshySDK
import MeeshyUI

/// La rangée plate du Fil (Focal) — contrat §WS-4. Pastille `22`,
/// « Pseudo · HH:mm » en tête de groupe, texte `15` pleine largeur au
/// retrait `29`, méta discrète, AUCUNE bulle.
///
/// **Densité uniforme** : `input.density` n'est PAS lu par ce fichier —
/// « même rangée, densité uniforme, zéro perspective ». RETRAIT FOCAL iOS
/// (2026-08-18) : le pass de perspective (`FocalScrollPass`) est supprimé ;
/// cette rangée sert le mode Script à plat, sans AUCUN transform —
/// jamais de `.visualEffect`/`.scaleEffect` conditionnel ici (garde source
/// `FocalRowSourceGuardTests`).
///
/// **Contrainte dure (§WS-4)** : aucun `@State` de langue — la sélection
/// active/secondaire vient de `input` (`activeDisplayLangCode`/
/// `secondaryLangCode`) et repart par `actions.onSetActiveDisplayLanguage`/
/// `onSetSecondaryLanguage` (régression `b9a39c2c`).
///
/// **Contrainte dure** : tout contrôle interne est un `Button(.plain)` +
/// `.contentShape(Rectangle())`, jamais `.onTapGesture` seul sur un contrôle
/// interactif (avalé par le long-press du conteneur parent) — `FocalIdentityHeader`
/// (profil) est un `Button(.plain)` ; les gestes de citation/média restent
/// `.onTapGesture` car ce sont des ZONES DE RANGÉE, pas des CONTRÔLES
/// (même patron que la bulle historique, `mediaWithReplyContainer`).
struct FocalRow: View {
    let input: FocalRowInput
    let actions: FocalRowActions

    private var content: BubbleContent { input.content }

    /// Retrait CONSTANT — il ne suit plus la pastille.
    ///
    /// Même raison que `textSize` : le retrait fixe la largeur disponible,
    /// donc le retour à la ligne, donc la hauteur. Le faire varier avec le
    /// focus faisait changer la cellule de taille au basculement d'élection,
    /// et la liste sautait. Le retrait de l'élue (41) est retenu pour TOUTES
    /// les rangées : c'est celui qui laisse la place à la pastille de 34, que
    /// l'en-tête réserve désormais en permanence.
    private var indent: CGFloat {
        FocalMetrics.Focus.textIndent
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
            case .deleted, .burned, .system:
                systemBody
            case .ephemeralExpired:
                EmptyView()
            case .standard:
                standardBody
            }
        }
        .padding(.top, input.isFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0)
        .padding(.vertical, FocalMetrics.Row.paddingVertical)
        .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
        // Une cellule qui porte encore une hauteur ESTIMÉE (auto-dimension-
        // nement différé pendant le mouvement) propose plus de place que le
        // contenu n'en prend : le contenu reste collé en HAUT, ses espaces
        // internes intacts — jamais centré ni étiré dans le vide (2026-08-21).
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // Envoi optimiste (matrice §5) : 0,7 d'opacité tant que le gateway
        // n'a pas accusé. Depuis le RETRAIT du pass (2026-08-18), la rangée
        // possède son opacité — `cell.alpha` n'a plus d'autre écrivain.
        .opacity(input.isOptimistic ? 0.7 : 1)
        .environment(\.layoutDirection, input.isRightToLeft ? .rightToLeft : .leftToRight)
        // « 1 rangée = 1 élément VoiceOver » (critère §7) : combine tous les
        // enfants + libellé composé par le composeur partagé WS-1 (aucune
        // seconde résolution — le composeur lit `content` seul, comme WS-4
        // le prescrit).
        .accessibilityElement(children: .combine)
        .accessibilityLabel(MessageAccessibilityLabelComposer.compose(content))
        .accessibilityActions { quotedZoneAccessibilityActions }
    }

    /// **LOI DES ZONES — la moitié VoiceOver.** Les zones 1 (avatar → profil) et
    /// 2 (miniature / icône de lecture → plein écran) sont des gestes posés DANS
    /// la citation. La ligne au-dessus fusionne la rangée en UN élément
    /// (`children: .combine`) puis REMPLACE son libellé par celui du composeur
    /// partagé : ni trait, ni indice, ni libellé d'enfant n'est prononcé, et
    /// VoiceOver n'a ni tap localisé ni appui long pour atteindre ces gestes.
    /// Sans action nommée, les deux capacités sont indisponibles au lecteur
    /// d'écran — jumelle exacte de `quotedZoneAccessibilityActions` sur la peau
    /// voisine, parce que la loi ne connaît pas les peaux.
    ///
    /// Les actions suivent l'ARMEMENT, jamais la présence à l'écran : une
    /// action nommée sans effet serait un contrôle qui ment, et le rotor la
    /// réciterait. Les deux clés sont celles que la citation emploie déjà.
    ///
    /// La citation d'un message VOCAL est hébergée par le widget audio et n'est
    /// pas rendue ici — mais elle vit sous CETTE rangée, dont le libellé combiné
    /// l'absorbe de la même façon. Les actions valent donc pour elle aussi,
    /// `content.reply` étant renseigné dans les deux cas.
    @ViewBuilder
    private var quotedZoneAccessibilityActions: some View {
        if let reference = content.reply?.reference {
            if let onQuotedAuthorTap = actions.onQuotedAuthorTap, reference.offersAuthorGate {
                Button(String(localized: "bubble.reply.author_hint", defaultValue: "Affiche le profil de l'auteur cité", bundle: .main)) {
                    onQuotedAuthorTap(reference)
                }
            }
            if let onQuotedMediaTap = actions.onQuotedMediaTap, reference.offersMediaGate {
                Button(String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main)) {
                    onQuotedMediaTap(reference)
                }
            }
        }
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

    /// **DEUX COLONNES** (#5135, directive porteur 2026-09-04) : la bulle à
    /// gauche, la date et l'accusé au BAS de sa droite.
    ///
    /// Ils vivaient sur la ligne basse, qui se montait alors TOUJOURS — c'est
    /// elle qui portait la méta — et ne montrait RIEN au repos,
    /// `FocalRevealedDetail` masquant l'heure et les coches par OPACITÉ. Une
    /// hauteur pleine et son espacement, réservés sous chaque message à de
    /// l'invisible.
    ///
    /// `.bottom` est la forme exacte demandée : la date se pose au niveau de la
    /// DERNIÈRE ligne de la bulle, jamais de la première.
    ///
    /// **Les modificateurs terminaux vivent ICI, sur les deux colonnes**, et
    /// pas sur la seule colonne de contenu : la carte de focus est le fond de
    /// la rangée ENTIÈRE, et `.messageEffects` doit garder « exactement le même
    /// périmètre que la bulle historique » — identité, citation, média, texte
    /// **et méta**. Les laisser sur `contentColumn` aurait sorti la date de la
    /// carte et de l'effet, sans qu'aucun test de valeur ne tombe.
    @ViewBuilder
    private var standardBody: some View {
        HStack(alignment: .bottom, spacing: FocalMetrics.MetaColumn.spacing) {
            contentColumn

            // En focus, `focusStampChip` dit la même chose sur la bande de la
            // carte : la colonne s'efface alors, comme la ligne basse, sans
            // céder sa place — largeur stable, zéro relayout à l'élection.
            FocalMetaColumn(
                isMe: content.isMe,
                timeString: content.meta.timeString,
                deliveryStatus: content.meta.deliveryStatus,
                isDark: input.isDark,
                editedAt: content.editedAt,
                isEditSaving: content.isEditSaving,
                hasEditHistory: content.hasEditHistory,
                onShowReadStatus: actions.onShowReadStatus.map { show in { show(content.messageId) } }
            )
            .equatable()
            .opacity(input.isFocused ? 0 : 1)
        }
        // Focus (2026-08-22) : la CARTE est le fond de ce bloc — même repère
        // que ses chips, toujours consolidés quelle que soit la hauteur
        // (estimée ou posée) de la cellule ; identité sur la ligne du HAUT
        // (hors tête de groupe, qui a déjà la sienne) et bande sur la ligne
        // BASSE — des superpositions, aucune hauteur réservée : tout apparaît
        // AVEC la carte, au tick d'élection.
        .background {
            if input.isFocused {
                focusCardBackground
            }
        }
        .overlay(alignment: .topLeading) {
            if input.isFocused {
                focusIdentityChip
                    .padding(.horizontal, FocalMetrics.FocusStrip.chipInset)
                    .offset(y: -FocalMetrics.FocusStrip.identityOverhang)
            }
        }
        .overlay(alignment: .bottom) {
            if input.isFocused {
                HStack(alignment: .center, spacing: 4) {
                    focusStrip
                    Spacer(minLength: 4)
                    focusStampChip
                }
                .padding(.horizontal, FocalMetrics.FocusStrip.chipInset)
                .offset(y: FocalMetrics.FocusStrip.overhang)
            }
        }
        // F-083ter (F15) : « les effets (bitfield) s'appliquent au bloc
        // contenu » — même overlay que le chemin bulle
        // (`ThemedMessageBubble.swift:317`, `.messageEffects(message.effects)`,
        // §1.3 réutilisé tel quel via `View.messageEffects(_:)`, PAS
        // réimplémenté). Posé sur les DEUX colonnes (identité + citation +
        // média + texte + méta), exactement le même périmètre que la bulle
        // historique applique à `BubbleStandardLayout(...)`.
        .messageEffects(input.effects)
    }

    /// La PREMIÈRE colonne — la bulle elle-même. Son contenu n'a pas changé
    /// d'un espace avec #5135 : seule la méta l'a quittée, et la ligne basse
    /// est devenue conditionnelle.
    @ViewBuilder
    private var contentColumn: some View {
        VStack(alignment: .leading, spacing: FocalMetrics.Row.paddingVertical) {
            // F-083ter (F11) : « les badges éphémère/épinglé/transféré
            // restent AU-DESSUS DE L'IDENTITÉ » — avant FocalIdentityHeader,
            // pas après, et indépendants de isFirstInGroup (ce sont des
            // propriétés du MESSAGE, pas du groupe).
            badgesSection

            // Le message EN FOCUS (Focal) porte toujours son identité — avatar,
            // présence, mood, jour et heure — même en continuation de groupe.
            // Tête de groupe : en focus, l'identité et la date passent SUR
            // les lignes de la carte (chips, 2026-08-22) — l'en-tête garde sa
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
                    senderStoryRing: input.senderStoryRing,
                    senderMoodEmoji: input.senderMoodEmoji,
                    senderIsAnonymous: input.senderIsAnonymous,
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
                    onOpenProfile: actions.onOpenProfile
                )
                .opacity(input.isFocused ? 0 : 1)
            }

            // Matrice §5 « Éphémère / flou / vue unique » : le flou de
            // niveau MESSAGE s'applique au BLOC CONTENU (citation comprise),
            // jamais à l'identité ni à la méta — corrigé 2026-08-18 (un
            // message protégé s'affichait EN CLAIR en Focal). L'état de
            // révélation vit dans la feuille (`FocalProtectedContent`),
            // FocalRow reste sans @State (contrainte dure §WS-4).
            //
            // Le wrapper ne se MONTE que pour un message protégé — même
            // discipline que le mux de l'hôte (« plan vide ⇒ vue intacte ») :
            // l'écrasante majorité des messages n'a pas de flou et ne paie ni
            // le `@StateObject` ni le modificateur. `isBlurred` est stable
            // sur la vie du message, la branche ne bascule pas au recyclage.
            if content.isBlurred {
                FocalProtectedContent(
                    isBlurred: true,
                    isViewOnce: content.isViewOnce,
                    messageId: content.messageId,
                    onConsumeViewOnce: actions.onConsumeViewOnce
                ) {
                    contentSections
                }
            } else {
                contentSections
            }

            failedRetrySection

            // **UNE seule ligne basse** (directive 2026-08-24) : drapeaux et
            // réactions à gauche, date et coches TOUT À DROITE. Elles vivaient
            // sur une ligne à elles — qui, au repos, ne montre RIEN (l'heure et
            // les coches ne paraissent qu'au défilement) tout en gardant sa
            // hauteur. C'était l'essentiel du blanc entre deux messages : une
            // ligne réservée à une information invisible.
            //
            // C'est aussi la disposition qu'a déjà la bande du message
            // magnifié (`focusStrip` … `focusStampChip`) : les deux modes
            // disent maintenant la même chose au même endroit.
            // La ligne basse ne porte plus QUE les drapeaux et les réactions —
            // elle redevient donc CONDITIONNELLE. C'est très exactement le
            // blanc que la directive vient chercher : sans drapeau ni réaction
            // (le cas nominal), plus aucune ligne n'est réservée.
            //
            // Sa garde d'origine (`translation != nil || showsReactions`) était
            // juste ; c'est en lui confiant la méta qu'on l'avait rendue
            // inconditionnelle. La méta partie en colonne, la condition revient.
            if mountsBottomLine {
                flagAndReactionsRow
                    // En focus, la bande SUR la ligne basse remplace visuellement
                    // cette ligne — qui garde sa place (hauteur stable).
                    .opacity(input.isFocused ? 0 : 1)
            }
        }
        // La bulle prend toute la laisse que la colonne lui laisse : sans cela
        // une rangée courte se rétracterait sur son texte et sa date viendrait
        // se coller au mot, au lieu de tenir la marge droite comme les autres.
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// **La ligne basse se monte-t-elle ?** La règle est éprouvée dans
    /// `FocalMetaColumn.mountsBottomLine` — jamais réécrite ici. Elle portait
    /// deux gardes que ce `if` tenait inline, donc hors d'atteinte de toute
    /// assertion : pas de drapeau en clair sur un message voilé (2026-08-18),
    /// un seul jeu de drapeaux par groupe (#3919).
    private var mountsBottomLine: Bool {
        FocalMetaColumn.mountsBottomLine(
            hasTranslation: content.translation != nil,
            isBlurred: content.isBlurred,
            isLastInGroup: input.isLastInGroup,
            hasReactions: mountsReactions
        )
    }

    // MARK: - F-083ter (F11) — badges éphémère/épinglé/transféré

    /// `content.isPinned`/`content.isForwarded`/`content.ephemeral` LUS et
    /// RENDUS (jusqu'ici seul le libellé VoiceOver les portait, F-080) —
    /// réutilise `BubblePinnedIndicator`/`BubbleForwardedIndicator` (§1.3,
    /// `internal`, vérifiés non `fileprivate`) TELS QUELS, et
    /// `FocalEphemeralBadge` (ce chantier) pour un countdown vivant sans
    /// faire porter le `@StateObject` par `FocalRow`.
    ///
    /// **L'attribution est la MÊME qu'en bulle depuis le #5058.** Elle restait
    /// `.anonymous` ici — « Transféré » tout court — parce que `BubbleContent`
    /// ne portait qu'un booléen et que la rangée plate n'avait pas le `Message`
    /// d'où la bulle tirait sa `ForwardReference`. L'écart était SIGNALÉ, et le
    /// repli était le bon : jamais celui qui nommerait quelqu'un.
    ///
    /// Ce qui manquait était en AMONT. `BubbleContent.forwardAttribution` porte
    /// désormais la valeur tranchée par `ForwardBadgePolicy` au site unique
    /// qu'est `BubbleContentBuilder` — pas une seconde résolution inventée ici,
    /// ce que le repli refusait à juste titre, mais la PREMIÈRE, remontée là où
    /// les trois peaux la partagent. Une règle de confidentialité résolue à
    /// deux endroits est une règle qui divergera.
    @ViewBuilder
    private var badgesSection: some View {
        if content.isPinned {
            BubblePinnedIndicator()
        }
        if let attribution = content.forwardAttribution {
            BubbleForwardedIndicator(isMe: content.isMe, isDark: input.isDark, attribution: attribution)
        }
        if let ephemeral = content.ephemeral {
            FocalEphemeralBadge(expiresAt: ephemeral.expiresAt, isDark: input.isDark)
        }
    }

    // MARK: - F-083ter (F05) — réactions live en pilule plate méta

    /// Réutilise `BubbleReactionsOverlay` (§1.3, `internal`, vérifié non
    /// `fileprivate`) TEL QUEL — pilule `11`pt, fond `backgroundSecondary`,
    /// comptes monospaced, pop `springBouncy` à l'arrivée, picker/détail
    /// inchangés : exactement F05. Le bouton `(+)` d'ajout rapide suit la
    /// MÊME règle que la bulle (`BubbleReactionsOverlay.isMounted`) : sur le
    /// dernier message reçu (`input.isLastReceivedMessage`, fourni par
    /// l'hôte depuis 2026-08-21 — l'écart « jamais côté Focal » est comblé).
    // (réactions : fusionnées dans `flagAndReactionsRow` — drapeau premier,
    // même ligne, arbitrage user 2026-08-18)

    // RETRAIT FOCAL iOS (2026-08-18) : la barre de contrôles de l'élue et
    // sa RÉSERVE de hauteur permanente sont supprimées avec l'élection — la
    // rangée Script gagne ~28 pt de densité et une mesure de moins.


    /// Miroir de la règle réelle (`textBubbleContent`/`mediaWithReplyContainer`,
    /// lus jamais modifiés) : la citation n'est rendue ICI que si le widget
    /// média ne l'héberge pas déjà — sinon double citation.
    private var showsQuotedReply: Bool {
        content.reply != nil && !content.audioHostsReply && !content.visualHostsReply
    }

    /// Le geste de la carte de scène, ou `nil` — même règle que la bulle : sans
    /// identifiant il n'y a rien à ouvrir, et un tap qui n'ouvre rien est une
    /// cible morte (loi 4). La carte, elle, se rend quand même : c'est la
    /// citation qui « subsiste » quand la story a expiré.
    private var storyCitationOpenTap: (() -> Void)? {
        guard let citation = content.detachedStoryCitation,
              !citation.messageId.isEmpty,
              let onStoryReplyTap = actions.onStoryReplyTap else { return nil }
        return { onStoryReplyTap(citation.messageId) }
    }

    /// Le bloc contenu protégé par le flou de message — citation + médias +
    /// audio + non-média + texte. Le VStack reprend le MÊME espacement que la
    /// pile parente : hauteur de rangée identique, wrapper monté ou pas.
    private var contentSections: some View {
        VStack(alignment: .leading, spacing: FocalMetrics.Row.paddingVertical) {
            // **Vue `3h` (#5059) — une story citée est une SCÈNE ici aussi.**
            //
            // La rangée plate rendait TOUTE citation par `FocalQuotedReplyView`,
            // y compris celle d'une story : un carré de 38 pt sur une ligne
            // « 📷 Story · il y a 3 h ». C'est le mot que la doctrine emploie —
            // *aplatie* — et la bulle l'avait corrigé seule au #4098.
            //
            // La règle de détachement n'est pas réécrite : elle vit sur
            // `BubbleContent`, que cette rangée reçoit déjà. Un `else if` plutôt
            // que deux `if` — les deux rendus s'excluent par CONSTRUCTION, pas
            // par la coïncidence de deux prédicats qui pourraient diverger.
            if let storyCitation = content.detachedStoryCitation {
                BubbleStoryCitationCard(
                    reply: storyCitation,
                    isDark: input.isDark,
                    accentHex: input.accentHex,
                    onOpen: storyCitationOpenTap
                )
                .equatable()
            } else if showsQuotedReply, let reply = content.reply {
                FocalQuotedReplyView(
                    reply: reply,
                    accentHex: input.accentHex,
                    isDark: input.isDark,
                    mentionDisplayNames: input.mentionDisplayNames,
                    onReplyTap: actions.onReplyTap,
                    onStoryReplyTap: actions.onStoryReplyTap,
                    onQuotedAuthorTap: actions.onQuotedAuthorTap,
                    onQuotedMediaTap: actions.onQuotedMediaTap
                )
                // Le rail de la citation est une forme (souple en hauteur) :
                // dans une cellule qui porte encore une hauteur ESTIMÉE, la
                // pile lui donnait tout l'espace en trop — citation étirée,
                // rail d'un écran (capture 2026-08-21). La citation prend sa
                // hauteur idéale, rien de plus.
                .fixedSize(horizontal: false, vertical: true)
            }

            visualBlock
            audioBlock
            nonMediaBlock
            textOrEmojiBlock
        }
    }

    /// Matrice §5 « Envoi optimiste / échec » : « Bande orange de retry
    /// inchangée, exclue de la perspective ». Réutilise
    /// `BubbleFailedRetryBar` TELLE QUELLE (§1.3 — spinner, blink gaté
    /// Reduce Motion, a11y) ; seule sa POSE change : une bande compacte sous
    /// le contenu au retrait de colonne, à la place de l'onglet de bord de
    /// bulle. Jusqu'au 2026-08-18, `onRetry` était câblé par l'hôte mais
    /// AUCUNE vue Focal ne le consommait — un message échoué n'offrait aucun
    /// moyen de le renvoyer.
    private var isFailedOutgoing: Bool {
        content.isMe && content.meta.deliveryStatus == .failed
    }

    @ViewBuilder
    private var failedRetrySection: some View {
        if isFailedOutgoing {
            BubbleFailedRetryBar(onRetry: { actions.onRetry?(input.localId) })
                .frame(width: 72, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
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
                onConsumeViewOnce: actions.onConsumeViewOnce
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
                // et ses segments karaoké (user 2026-08-18) — même bascule
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
                onTapConsentNotice: actions.onTapConsentNotice
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
            // Lot 3.2 (2026-08-18) : cartes RÉELLES (LocationMessageView +
            // BubbleAttachmentView, réutilisées telles quelles) à la place du
            // repli texte inerte — un document redevient ouvrable en Focal.
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

    /// Miroir de la branche réelle (`:850-856`, lue jamais modifiée) :
    /// emoji-only SANS citation ⇒ grand emoji libre ; sinon texte normal SI
    /// du contenu existe ET que l'audio ne l'héberge pas déjà en caption
    /// (`audioHostsCaption` ⇒ le texte vit DANS le widget audio, WS-3).
    @ViewBuilder
    private var textOrEmojiBlock: some View {
        if let sticker = content.sticker {
            stickerBlock(sticker)
        } else if content.isEmojiOnly && content.reply == nil {
            emojiBlock
        } else if content.hasTextOrNonMediaContent && audioMode != .hostsCaption {
            textBlock
        }
    }

    /// **Le sticker se DESSINE en Focal, Script et Rivière comme en Bulles.**
    ///
    /// Ces trois modes partagent cette rangée, qui « reproduit en une seule
    /// décision » ce que `BubbleStandardLayout` fait — et la reproduction avait
    /// omis le sticker : le mot n'apparaissait pas une fois dans tout
    /// `Focal/Row/`. Un message-sticker s'y rendait par son texte de repli,
    /// c'est-à-dire par l'emoji du gabarit quand il en avait un, et par rien
    /// quand il n'en avait pas.
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
            .padding(.leading, indent)
            .accessibilityLabel(BubbleSticker.accessibilityLabel(for: sticker))
    }

    /// « emoji-only conserve 90/60/quarante-cinq pt » (critère §7) : `emojiFontSize`
    /// vient de `content.text.emojiFontSize`, jamais recalculé ici.
    /// Rendu du texte ORIGINAL (`raw`), jamais traduit — même règle que
    /// `BubbleStandardLayout.emojiOnlyContent` (lu, jamais modifié).
    private var emojiBlock: some View {
        Text(content.text?.raw ?? "")
            .font(MeeshyFont.relative(content.text?.emojiFontSize ?? FocalMetrics.Text.size))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, indent)
    }

    /// `BubbleExpandableText` (§1.3, lu jamais modifié) résout déjà `15`pt
    /// en interne (`MessageTextRenderer.render(fontSize: 15, …)`) — IDENTIQUE
    /// à `FocalMetrics.Text.size` (`MeeshyFont.bodySize`), aucun `.font()`
    /// externe à appliquer. Seul l'interligne additif (`1.42`, `.lineSpacing`
    /// est en points côté SwiftUI) et le retrait `29` sont posés ICI.
    ///
    /// **Signal multi-langue (arbitrage user 2026-08-18)** : ni icône
    /// translate, ni bande de drapeaux dans la rangée — le menu d'appui
    /// long demande/affiche les autres langues. Le SEUL indicateur est le
    /// drapeau de la langue D'ORIGINE, affiché UNIQUEMENT quand le message
    /// existe en plusieurs versions (`content.translation != nil`). Aucune
    /// seconde résolution : `originalLangCode` est déjà résolu par
    /// `BubbleContentBuilder`.
    /// Texte effectif de la rangée — `text.raw` EST déjà le contenu résolu
    /// par `BubbleContentBuilder` (Prisme + bascule manuelle
    /// `activeDisplayLangCode`), le même que la bulle. L'ancienne préférence
    /// `preferredContent ?? raw` court-circuitait la bascule V.O. : le
    /// drapeau-toggle changeait `activeLangCode` sans jamais changer le
    /// texte de la rangée plate. Partagé par le rendu, la sheet « Lire
    /// plus » et la clé du cross-fade.
    private var effectiveText: String {
        content.text?.raw ?? ""
    }

    private var textBlock: some View {
        HStack(alignment: .top, spacing: 4) {
            // Le drapeau-toggle ne vit plus ICI : il est posé en BAS de la
            // rangée, avant les réactions (`versionFlagSection`, arbitrage
            // user 2026-08-18) — commun au texte et à l'audio traduit.
            BubbleExpandableText(
                content: effectiveText,
                // La rangée plate n'a AUCUN fond teinté : `isMe` ferait passer
                // le texte en blanc (règle de la bulle « sur ma bulle
                // accent ») — illisible en mode clair (capture 2026-08-21).
                isMe: false,
                mentionDisplayNames: input.mentionDisplayNames,
                highlightTerm: input.highlightSearchTerm,
                mentionTint: MeeshyColors.mentionColor(isDark: input.isDark),
                hashtagTint: MeeshyColors.hashtagColor(isDark: input.isDark),
                linkTint: Color(hex: input.accentHex),
                isDark: input.isDark,
                trackedLinks: content.text?.trackedLinks ?? [:],
                fontSize: textSize,
                expandLabel: String(localized: "focal.readmore", defaultValue: "Lire plus", bundle: .main),
                // Aucune entrée gouvernant la HAUTEUR ne dépend de
                // `isFocused` (decisions.md 2026-08-22 bis) : le tick
                // d'élection reconfigure la rangée élue en plein geste, un
                // plafond de texte variable y ferait sauter le fil. Plafond
                // constant, comme `indent` et `textSize` avant lui.
                truncateLimit: BubbleExpandableText.truncateLimit,
                onExpandOverride: { actions.onReadMore?(readMorePayload) }
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

    /// Charge de la sheet « Lire plus » — le MÊME texte effectif que la
    /// rangée (Prisme déjà résolu), jamais une seconde résolution.
    /// En focus : « Aujourd'hui 12:30 », « Hier 18:30 », « Mardi 23:40 »,
    /// « Sam. 3 oct. 2025 · 14:41 » (`FocalFocusTimestamp`) ; sinon l'heure seule.
    /// En focus : la date complète PRÉ-CALCULÉE par la configuration
    /// (`input.focusTimestamp`) ; le calcul en body n'est qu'un filet.
    private var headerTimeString: String {
        guard input.isFocused else { return content.meta.timeString }
        if let precomputed = input.focusTimestamp { return precomputed }
        guard let sentAt = input.sentAt else { return content.meta.timeString }
        return FocalFocusTimestamp.label(
            sentAt: sentAt,
            timeString: content.meta.timeString,
            now: Date(),
            calendar: .current,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui", bundle: .main),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier", bundle: .main),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier", bundle: .main)
        )
    }

    private var readMorePayload: FocalReadMorePayload {
        FocalReadMorePayload(
            messageId: content.messageId,
            senderName: content.senderName ?? "",
            timeString: content.meta.timeString,
            text: effectiveText,
            accentHex: input.accentHex,
            isDark: input.isDark
        )
    }

    // `flagEmoji` a vécu ici, repliant sur 🌐 et lisant `LanguageData` quand la
    // source unique lit `LanguageDisplay` : deux tables pour une question, et
    // un repli qui ne distingue AUCUNE langue d'une autre là où #4248 avait
    // choisi le code en capitales — « un code se lit et se reconnaît ». La
    // production du drapeau passe désormais par `LanguageFlagChip.flag(for:)`.

    /// Drapeau-toggle + réactions sur LA MÊME LIGNE, le drapeau en PREMIER
    /// (arbitrage user 2026-08-18, précision : jamais sur une ligne à part).
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
    /// **Elle ne se monte plus QUE si elle a quelque chose à montrer** (#5135,
    /// 2026-09-04), et c'est `mountsBottomLine` qui en décide.
    ///
    /// Histoire de la ligne, en deux temps, parce que le second annule la
    /// raison du premier : la directive 2026-08-24 y avait ramené la date et
    /// les coches, jusque-là sur une ligne à elles — d'où un « elle se monte
    /// TOUJOURS, même sans drapeau ni réaction : c'est elle qui porte désormais
    /// la méta ». La méta étant passée en COLONNE, cette justification est
    /// tombée avec elle et la garde d'origine (`translation != nil ||
    /// showsReactions`) redevient la bonne — élargie de ses deux exceptions.
    private var flagAndReactionsRow: some View {
        let showsReactions = mountsReactions
        return HStack(alignment: .center, spacing: 6) {
            // Jamais de drapeau EN CLAIR sur un message protégé (revue
            // adversariale 2026-08-18) : la bulle floute sa bande de
            // drapeaux avec le contenu — révéler la langue d'origine
            // d'un message voilé fuirait une information. Les réactions,
            // elles, restent hors voile (parité bulle historique).
            //
            // UN SEUL jeu de drapeaux par groupe, sur son DERNIER message
            // (#3919, directive porteur 2026-08-26 — miroir du mode Bulles,
            // où c'est déjà le dernier message qui porte l'identité). Le
            // choix posé ici s'applique à TOUT le groupe
            // (`onSetActiveDisplayLanguageForGroup`) ; changer la langue d'UN
            // message précis du groupe reste possible via la magnification
            // (`focusStrip`, `onSetActiveDisplayLanguage`) ou le long-press.
            if let translation = content.translation, !content.isBlurred, input.isLastInGroup {
                plainLanguageFlags(translation)
            }
            if showsReactions {
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

            // Plus de `Spacer` ni de méta : la ligne se rétracte sur ce
            // qu'elle porte. Ce qui la remplissait jusqu'à la marge droite —
            // la date et les coches — vit désormais dans `FocalMetaColumn`.
        }
        .padding(.leading, indent)
    }

    private var isShowingOriginal: Bool {
        guard let translation = content.translation else { return true }
        return translation.activeLangCode.lowercased() == translation.originalLangCode.lowercased()
    }

    // MARK: - Bordure basse du message EN FOCUS (2026-08-21)

    /// Les langues proposées sur la bordure : l'originale d'abord, puis les
    /// traductions disponibles, puis la langue AFFICHÉE (sans doublon,
    /// ordre du Prisme) — l'active porte l'anneau plein.
    /// Les drapeaux proposés par une rangée, dédupliqués et PLAFONNÉS.
    ///
    /// Directive 2026-08-24 : « un message qui a plusieurs traductions
    /// disponibles liste les 3 premiers drapeaux sans magnificence, et les 5
    /// premiers en magnificence ». Sans plafond, un message très traduit
    /// remplissait sa ligne de drapeaux jusqu'à la noyer.
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

    private var focusAccent: Color { Color(hex: input.accentHex) }

    /// LA chip du focus — une seule coquille pour l'identité, la date, la
    /// traduction, les drapeaux, le (+) et les réactions : capsule OPAQUE
    /// (posée sur la ligne de la carte), teintée à l'accent de la scène —
    /// SANS contour (directive 2026-08-24). L'état se lit désormais au fond
    /// seul : dense pour le drapeau affiché (`isActive`), plein pour une
    /// réaction qui est la mienne (`filled`).
    private func focusChip<Content: View>(
        isActive: Bool = false,
        filled: Bool = false,
        height: CGFloat = FocalMetrics.FocusStrip.chipHeight,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        content()
            .padding(.horizontal, 7)
            .frame(minWidth: FocalMetrics.FocusStrip.chipMinWidth)
            .frame(height: height)
            .background(
                Capsule(style: .continuous)
                    .fill(filled ? focusAccent : MeeshyColors.backgroundSecondary(isDark: input.isDark))
                    .overlay(Capsule(style: .continuous).fill(filled ? Color.clear : focusAccent.opacity(FocalScrollPerspective.focusChipFillOpacity(isDark: input.isDark, isActive: isActive))))
            )
            .contentShape(Capsule(style: .continuous))
    }

    /// Sur la ligne BASSE de la carte du message en focus, dans CET ordre
    /// (directive 2026-08-22) : l'icône de traduction (détails), les
    /// drapeaux (afficher le contenu dans cette langue), le (+) emoji, puis
    /// les réactions — fond PLEIN quand j'ai réagi. Superposition : aucune
    /// hauteur réservée, donc affichage instantané au tick d'élection.
    private var focusStrip: some View {
        HStack(alignment: .center, spacing: 4) {
            if let translation = content.translation, !content.isBlurred {
                Button {
                    actions.onShowTranslationDetail?(content.messageId)
                } label: {
                    focusChip {
                        Image(systemName: "character.bubble")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(focusAccent)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "focal.focus.translation_detail", defaultValue: "Détails de traduction", bundle: .main))
                ForEach(
                    Self.focusFlagCodes(
                        originalLangCode: translation.originalLangCode,
                        availableFlags: translation.availableFlags,
                        activeLangCode: translation.activeLangCode,
                        limit: FocalMetrics.FocusStrip.flagLimitMagnified
                    ),
                    id: \.self
                ) { code in
                    // DIXIÈME copie (252i, #4260). Elle garde sa VUE — le fond
                    // `focusChip` n'existe que sur la bande magnifiée, et
                    // `LanguageFlagChip` étant un `Button`, l'adopter ici
                    // imbriquerait un bouton dans un bouton. Elle prend donc le
                    // VOCABULAIRE : même table, même repli, étiquette d'action,
                    // état porté par un trait et non par le seul fond de puce.
                    Button {
                        actions.onSetActiveDisplayLanguage?(content.messageId, code)
                    } label: {
                        focusChip(isActive: code.lowercased() == translation.activeLangCode.lowercased()) {
                            Text(LanguageFlagChip.flag(for: code)).font(MeeshyFont.relative(12))
                        }
                    }
                    .buttonStyle(.plain)
                    .languageFlagAccessibility(
                        code: code,
                        isActive: code.lowercased() == translation.activeLangCode.lowercased()
                    )
                }
            }
            Button {
                actions.onOpenReactPicker?(content.messageId)
            } label: {
                focusChip {
                    Image(systemName: "face.smiling")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(focusAccent)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "focal.focus.add_reaction", defaultValue: "Ajouter une réaction", bundle: .main))
            ForEach(content.reactions, id: \.emoji) { reaction in
                focusReactionChip(reaction)
            }
            Spacer(minLength: 0)
        }
        .padding(.leading, FocalMetrics.FocusStrip.chipInset)
    }

    /// Réaction sur la ligne : fond PLEIN (accent) si j'ai réagi, sinon la
    /// chip neutre ; toucher = basculer, maintenir = qui a réagi.
    private func focusReactionChip(_ reaction: MeeshyReactionSummary) -> some View {
        let mine = reaction.includesMe
        return Button {
            HapticFeedback.light()
            actions.onToggleReaction?(reaction.emoji)
        } label: {
            focusChip(filled: mine) {
                HStack(spacing: 2) {
                    Text(reaction.emoji).font(.caption2)
                    if reaction.count > 1 {
                        Text("\(reaction.count)")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(mine ? .white : focusAccent)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.4).onEnded { _ in
            HapticFeedback.medium()
            actions.onShowReactions?(content.messageId)
        })
        .accessibilityLabel("\(reaction.emoji) \(reaction.count)")
    }

    /// Le FOND du message en focus, dessiné dans le repère du CONTENU
    /// (la carte UIKit bornée à la cellule dérivait de ses chips tant que la
    /// cellule n'était pas posée). Mêmes cotes que `focusCardInsets` : elle
    /// dépasse le bloc de `focusCardInnerMargin` en haut et en bas, et
    /// s'arrête à `focusCardHorizontalInset` du bord de la cellule.
    private var focusCardBackground: some View {
        RoundedRectangle(cornerRadius: FocalScrollPerspective.focusCardCornerRadius, style: .continuous)
            .fill(focusAccent.opacity(input.isDark ? FocalScrollPerspective.focusCardFillOpacityDark : FocalScrollPerspective.focusCardFillOpacityLight))
            .padding(.horizontal, -(FocalMetrics.Row.paddingHorizontal - FocalScrollPerspective.focusCardHorizontalInset))
            .padding(.vertical, -FocalScrollPerspective.focusCardInnerMargin)
    }

    /// HAUT-GAUCHE : l'auteur, sur la ligne du haut de la carte — pour TOUTES
    /// les bulles en focus.
    ///
    /// **Directive 2026-08-24.** Cette chip recomposait une identité PAUVRE :
    /// un avatar et un nom, rien d'autre. La présence, le mood, l'anneau de
    /// story et le fantôme d'un visiteur sans compte — tout ce que
    /// `FocalIdentityHeader` sait déjà porter — s'évaporaient au moment
    /// précis où le message est le plus regardé. Elle réemploie donc l'en-tête,
    /// à un gabarit plus grand, au lieu d'en réécrire une version amputée.
    ///
    /// **Elle n'a NI fond NI capsule** (directive 2026-08-24) : l'auteur se
    /// pose HORS de la carte, juste au-dessus d'elle, exactement comme la
    /// rangée Script affiche le sien. Seule la taille demeure agrandie. La
    /// capsule opaque la faisait lire comme une pastille posée SUR la bulle,
    /// alors que l'auteur n'appartient pas au message : il le précède.
    ///
    /// Le toucher passe par `onOpenProfile`, le routage que l'hôte tient
    /// déjà : la feuille de PROFIL pour un compte, la fiche de participation
    /// pour un visiteur qui n'en a pas — lui n'a pas d'autre identité que
    /// celle-là. (Cette fiche s'ouvrait pleine d'identifiants bruts : ses 39
    /// clés étaient au catalogue sans une seule valeur française. Réparé le
    /// même jour, avec la garde qui manquait.)
    private var focusIdentityChip: some View {
        focusChip(height: FocalMetrics.FocusStrip.identityChipHeight) {
            FocalIdentityHeader(
            isMe: content.isMe,
                senderDisplayName: input.senderDisplayName,
                senderUsername: input.senderUsername,
                senderAvatarURL: input.senderAvatarURL,
                senderThumbHash: input.senderThumbHash,
                senderColorHex: input.senderColorHex,
                senderPresence: input.senderPresence,
                senderStoryRing: input.senderStoryRing,
                senderMoodEmoji: input.senderMoodEmoji,
                senderIsAnonymous: input.senderIsAnonymous,
                profileUser: input.profileSheetUser,
            isDark: input.isDark,
                agentStyle: AgentAuthoredStyle.resolve(
                isAgentAuthored: input.isAgentAuthored,
                isAgentGrammarEnabled: input.showsAgentGrammar
                ),
                onOpenProfile: actions.onOpenProfile,
                avatarDiameter: FocalMetrics.FocusStrip.identityAvatarSize,
                nameSize: FocalMetrics.FocusStrip.identityNameSize,
                fillsWidth: false
            )
            .padding(.leading, -3)
        }
    }

    /// BAS-DROITE : date complète (pré-calculée) + coche d'état de réception
    /// (mes messages), sur la ligne basse à côté de la bande — toucher =
    /// détails de lecture. Elle a quitté la ligne du HAUT le 2026-08-23 : la
    /// carte affichait alors sa date deux fois, en haut par cette chip et en
    /// bas par la méta.
    private var focusStampChip: some View {
        let metaTint: Color = input.isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
        let readTint: Color = input.isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
        return Button {
            actions.onShowReadStatus?(content.messageId)
        } label: {
            focusChip {
                HStack(spacing: 4) {
                    Text(headerTimeString)
                        .font(MeeshyFont.relative(10.5, weight: .semibold))
                        .foregroundColor(metaTint)
                        .lineLimit(1)
                    if content.isMe, let status = content.meta.deliveryStatus {
                        BubbleDeliveryCheck(status: status, isOffline: false, tint: metaTint, readTint: readTint)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(headerTimeString)
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
                // NEUVIÈME copie du drapeau-contrôle, soldée au 252i (#4260) —
                // invisible à la garde de #4248 parce qu'elle disait son état
                // par l'OPACITÉ et non par le soulignement que cette garde
                // interdit. L'opacité seule ne dit rien à VoiceOver (WCAG
                // 1.4.1), et « Français » nu ressemble à une étiquette, pas à
                // une action : la source unique porte les deux (trait
                // `.isSelected` + « Afficher en Français »).
                LanguageFlagChip(
                    code: code,
                    isActive: code.lowercased() == translation.activeLangCode.lowercased(),
                    metrics: .compact
                ) {
                    // Rangée ORDINAIRE, montée sur le DERNIER message d'un
                    // groupe (#3919) : le choix s'applique à tout le groupe.
                    actions.onSetActiveDisplayLanguageForGroup?(content.messageId, code)
                }
            }
        }
    }

    /// Drapeau-TOGGLE de version — le SEUL indicateur multi-langue de la
    /// rangée (arbitrages user 2026-08-18 : plus d'icône translate ni de
    /// bande de drapeaux ; le menu d'appui long garde l'exploration
    /// complète). Affiché UNIQUEMENT quand plusieurs versions existent
    /// (`content.translation` non-nil).
    ///
    /// Le drapeau montre L'AUTRE version disponible, et le tap y bascule :
    /// - traduction affichée → drapeau de la langue D'ORIGINE ; tap =
    ///   afficher l'original (`onSetActiveDisplayLanguage(originalLangCode)`) ;
    /// - original affiché → drapeau de la langue CONFIGURÉE sur le profil
    ///   (la cible du Prisme, `preferredLangCode`) ; tap = revenir à la
    ///   traduction (`onSetActiveDisplayLanguage(nil)` → résolution Prisme).
    /// Quand le Prisme n'a aucune traduction préférée (`preferredLangCode`
    /// nil), le drapeau d'origine reste un simple indicateur multi-versions.
    @ViewBuilder
    private var originalLanguageFlag: some View {
        if let translation = content.translation {
            let profileLang = translation.preferredLangCode
            let showsProfileFlag = isShowingOriginal && profileLang != nil
            Button {
                if isShowingOriginal {
                    // Retour à la traduction — seulement si le Prisme en a une.
                    guard profileLang != nil else { return }
                    actions.onSetActiveDisplayLanguage?(content.messageId, nil)
                } else {
                    actions.onSetActiveDisplayLanguage?(content.messageId, translation.originalLangCode)
                }
            } label: {
                Text(showsProfileFlag
                     ? LanguageFlagChip.flag(for: profileLang ?? "")
                     : LanguageFlagChip.flag(for: translation.originalLangCode))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showsProfileFlag
                ? String(
                    format: String(localized: "focal.translation.back_to_translation_flag", defaultValue: "Revenir à la traduction (%@)", bundle: .main),
                    LanguageData.info(for: (profileLang ?? "").lowercased())?.nativeName ?? (profileLang ?? "")
                )
                : String(
                    format: String(localized: "focal.translation.show_original_flag", defaultValue: "Afficher la version originale (%@)", bundle: .main),
                    LanguageData.info(for: translation.originalLangCode.lowercased())?.nativeName ?? translation.originalLangCode
                ))
        }
    }
}

// MARK: - EquatableFocalRow — le gate de re-render

/// Enveloppe la rangée pour le gate `.equatable()` — même topologie que
/// `EquatableMessageBubble` (`ThemedMessageBubble.swift:481-491`, lue jamais
/// modifiée). Le gate ne se pose JAMAIS sur `FocalRow` lui-même (contrat
/// §WS-4 : régression documentée du 2026-05-25) — `FocalRow` n'est donc PAS
/// `Equatable` ; seule cette enveloppe l'est, en comparant `row.input`
/// (`FocalRowActions` en est exclu par construction, comme `FocalRowInput.==`
/// ne le compare jamais).
struct EquatableFocalRow: View {
    let row: FocalRow
    var body: some View { row }
}

extension EquatableFocalRow: @MainActor Equatable {
    static func == (lhs: EquatableFocalRow, rhs: EquatableFocalRow) -> Bool {
        lhs.row.input == rhs.row.input
    }
}
