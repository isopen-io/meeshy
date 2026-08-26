import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Lentille Conversation Row (contrat LWS-7, workshop I-065)
//
// Rang plat de la Lentille — MÊMES entrées que `ThemedConversationRow`
// (`Meeshy/Features/Main/Views/ThemedConversationRow.swift`, INTERDIT
// d'édition : c'est le modèle d'entrées et de `==` de ce fichier), rendu
// radicalement différent : AUCUNE carte (ni `backgroundSecondary`, ni
// gradient de chaleur, ni bordure — la focus card de LWS-8 est la seule
// carte de l'écran), rang plat `LentilleMetrics.Row.height` (64), avatar
// `LentilleMetrics.Avatar` (44, contexte `.conversationHeaderCollapsed`) +
// anneau accent propre, `Nom · heure`, ligne 2 dont la précédence
// (typing > brouillon > pont ✦ > préview) est **inchangée** par rapport au
// rang historique.
//
// Le rang ne porte AUCUN `@State` de langue : la résolution du texte passe
// exclusivement par `resolvedLastMessagePreview(preferredLanguages:)` (SDK,
// gelé) pour la préview, et par le même algorithme copié pour l'étage agent
// du pont (`LentilleBridgeLine.resolveAgentText`, voir ce fichier) — jamais
// un cache local de traduction.

struct LentilleConversationRow: View {
    let conversation: Conversation
    var community: MeeshyCommunity? = nil
    var availableWidth: CGFloat = 200
    var isDragging: Bool = false
    var presenceState: PresenceState = .offline
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil
    var onCommunityTap: (() -> Void)? = nil

    var isDark: Bool = false
    var storyRingState: StoryRingState = .none
    var moodStatus: StatusEntry? = nil
    var typingUsername: String? = nil
    /// iPad / macOS split-view : la ligne active est signalée par une fine
    /// barre latérale accent — JAMAIS un fond, ce serait une carte.
    var isSelected: Bool = false
    var draftSummary: DraftSummary? = nil
    var preferredContentLanguages: [String] = []
    /// Appel en cours (Scène) — contrat LWS-2bis/§3.3, behaviour-matrix:L13.
    /// `nil` (défaut) ⇒ AUCUN rendu : zéro donnée fabriquée, exactement le
    /// même contrat que `moodStatus`/`draftSummary`. Le rang ne nomme
    /// AUCUN `Local…Provider`/`Gateway…Provider` (garde source LWS-2bis) —
    /// il reçoit la valeur déjà résolue par l'appelant, à qui revient le
    /// câblage du provider (`ConversationLiveCallProviding`, hors périmètre
    /// de ce fichier ; voir le commentaire de `liveCall` pour l'état du
    /// câblage amont).
    var liveCall: ConversationLiveCall? = nil
    /// Tap sur le bouton Rejoindre — jamais invoqué si `liveCall.joined`
    /// (pas de bouton, contrat §3.3 « rien de plus »).
    var onJoinLiveCall: (() -> Void)? = nil
    /// MAGNIFICATION EN PLACE (2026-08-23) — `nil` au repos, non-`nil` sur la
    /// rangée élue. La rangée ne devient pas une AUTRE vue : elle reste
    /// elle-même et gagne trois choses, sans qu'aucune de ses features ne
    /// soit à recopier ailleurs (directive produit : « mettre à jour la
    /// rangée cible avec des données et un style adéquats afin qu'elle hérite
    /// des features du mode normal »).
    ///
    /// 1. Une ligne AU-DESSUS du titre : la catégorie (actionnable) puis les
    ///    étiquettes NOMMÉES — points colorés de 6 px au repos.
    /// 2. L'aperçu coule sur DEUX lignes au lieu d'une.
    /// 3. La ligne de date — vide à gauche au repos — accueille la pastille
    ///    de mode de lecture et l'effectif (tous deux actionnables), et la
    ///    date passe du relatif court (« 5d ») au complet (« Lundi à 17:36 »).
    ///
    /// Aucune bordure, aucun fond, aucun agrandissement : « sans que
    /// l'utilisateur ne sente un changement si ce n'est le surplus
    /// d'information, l'objet reste le même ».
    var magnification: LentilleMagnification? = nil

    private var accentColorHex: String { conversation.accentColor }
    private var accent: Color { Color(hex: accentColorHex) }
    private var textPrimary: Color { MeeshyColors.textPrimary(isDark: isDark) }
    private var textSecondary: Color { MeeshyColors.textSecondary(isDark: isDark) }
    private var textMuted: Color { MeeshyColors.textMuted(isDark: isDark) }

    // MARK: - Pont ✦ — précédence (contrat §LWS-7, §3.2)

    /// `unreadCount > 0 ∧ bridge != nil` — la SEULE condition d'apparition
    /// du pont. `static` et pure pour rester testable sans construire de vue
    /// (I-065, « tests minimaux embarqués »). `nonisolated` : la cible app
    /// compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, et
    /// `LentilleConversationRow` (une `View`) hérite ce défaut — sans cette
    /// sortie explicite, un XCTest `nonisolated` ne pourrait pas appeler
    /// cette loi pure sans `await` (même précédent que
    /// `ConversationListView.isSectionContentVisible`/`LentilleRailPolicy`).
    nonisolated static func showsBridge(unreadCount: Int, bridge: ConversationBridge?) -> Bool {
        unreadCount > 0 && bridge != nil
    }

    private var showsBridge: Bool {
        Self.showsBridge(unreadCount: conversation.userState.unreadCount, bridge: conversation.bridge)
    }

    /// Opacité du rang — sourdine ⇒ `LentilleMetrics.Muted.opacity` (jamais
    /// un littéral, contrat §4.3), composée avec le retour visuel de drag
    /// existant (`isDragging`, repris du rang historique). `nonisolated`
    /// pure pour rester testable sans vue (même raison que `showsBridge`).
    nonisolated static func rowOpacity(isMuted: Bool, isDragging: Bool) -> Double {
        (isMuted ? LentilleMetrics.Muted.opacity : 1.0) * (isDragging ? 0.8 : 1.0)
    }

    private var rowOpacity: Double {
        Self.rowOpacity(isMuted: conversation.userState.isMuted, isDragging: isDragging)
    }

    // MARK: - Dot de présence pendant le typing (contrat behaviour-matrix.json
    // L01 : « … et force le dot de présence au vert »)
    //
    // vol.5 §5.3 (docs/design/2026-08-15-conversation-list-lentille.html,
    // lignes 188/355/406/456/491-492, RE-PROUVÉ à cinq endroits distincts du
    // document normatif — jamais une seule occurrence isolée) : « Quelqu'un
    // écrit → dot présence forcé vert (typing = preuve d'activité) », répété
    // mot pour mot dans la matrice de couverture ET dans les critères
    // d'acceptation R5 (« typing, dot vert forcé »). Combiné SEULEMENT ici,
    // au niveau du rang — jamais dans `LentilleRowAvatar`/`MeeshyAvatar`, qui
    // restent de purs relais (même discipline que L10 ci-dessous, « mood
    // gagne, présence sinon » vit dans `MeeshyAvatar`, jamais réinterprété).
    private var effectivePresenceState: PresenceState {
        typingUsername != nil ? .online : presenceState
    }

    private var isMagnified: Bool { magnification != nil }

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            avatarView

            VStack(alignment: .leading, spacing: 2) {
                if let magnification {
                    LentilleMagnifiedTopLine(
                        conversation: conversation,
                        magnification: magnification,
                        isDark: isDark
                    )
                }
                headerLine
                line2
                dateLine
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, LentilleMetrics.Row.paddingHorizontal)
        .padding(.vertical, LentilleMetrics.Row.paddingVertical)
        // DEUX hauteurs, et c'est la clé du « zéro relayout » (R2).
        //
        // 1. Hauteur VISUELLE — 100 en magnification, 84 au repos. C'est la
        //    place que le contenu occupe à l'écran : la 4ᵉ ligne (catégorie +
        //    étiquettes) et l'aperçu qui coule sur deux lignes ont besoin des
        //    16 pt de plus.
        // 2. Hauteur de LAYOUT — `Row.height`, TOUJOURS. C'est elle que la
        //    `LazyVStack` mesure. Sans ce second cadre, magnifier une rangée
        //    poussait de 16 pt tout ce qui la suit, à chaque changement d'élu,
        //    en pleine inertie de défilement : la liste sautait sous le doigt.
        //
        // SwiftUI ne rogne pas un enfant plus grand que son cadre : la
        // magnification déborde donc de 8 pt de chaque côté, exactement dans
        // les marges que la respiration (`FocusCard.breathing`, la même valeur)
        // vient d'ouvrir entre l'élue et ses voisines.
        .frame(height: isMagnified ? LentilleMetrics.FocusInline.height : LentilleMetrics.Row.height)
        .frame(height: LentilleMetrics.Row.height)
        .opacity(rowOpacity)
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .animation(.easeOut(duration: 0.15), value: isDragging)
        .overlay(alignment: .leading) {
            if isSelected {
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(accent)
                    .frame(width: 3)
                    .padding(.vertical, 6)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        // Idem `ThemedConversationRow` — dont ce libellé est justement dérivé
        // (`accessibilityLabel` réutilise `conversationAccessibilityLabel`) :
        // le compte de non-lus y figure déjà, pluralisé. La valeur rendait
        // `accessibility.unread_messages` sans `String(format:)` et laissait
        // fuir son `%lld` dans l'annonce VoiceOver.
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(String(localized: "accessibility.opens_conversation", bundle: .main))
        .accessibilityAddTraits(.isButton)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    /// Réutilise le libellé VoiceOver du rang historique — même contenu
    /// annoncé des deux côtés du drapeau (workshop §7 : « même chose au
    /// premier coup d'œil »). `conversationAccessibilityLabel` est une
    /// propriété calculée PURE de `ThemedConversationRow` (déclarée sans
    /// `private` dans le fichier historique, précisément pour être
    /// consommée hors de ce fichier — voir son commentaire d'en-tête) ;
    /// construire une instance jetable pour la LIRE n'édite pas ce fichier
    /// interdit, ça le CONSOMME, exactement comme le reste du chantier
    /// consomme `Lentille/Core` gelé.
    ///
    /// Q-140/L16-iOS — trou découvert par la recette Q-140 : ce libellé
    /// hérité ignore TOUJOURS le pont ✦ (`ThemedConversationRow` n'a même
    /// pas connaissance du concept), alors que la ligne 2 visible du rang
    /// plat le rend à sa place dès `showsBridge` (`line2`, cas `.bridge`
    /// ci-dessus). Inverse symétrique du défaut web corrigé par V4ter/B1
    /// (`LentilleRow.tsx`, commit e55961fa) : là-bas l'aria retombait
    /// toujours sur `lastMessage.content` sous `hasBridge` ; ici elle
    /// retombe toujours sur le libellé du rang historique, qui ne sait
    /// composer QUE `typing > brouillon > préview` (jamais `pont`). Même
    /// remède : dériver l'aria du pont de la MÊME source que son rendu
    /// visuel (`LentilleBridgeLine.resolveAriaText`, extraite par ce lot de
    /// `LentilleBridgeLine.resolvedText` — une seule résolution, deux
    /// consommateurs), jamais une seconde loi de langue. Le segment remplacé
    /// est le SEUL que la ligne 2 remplace visuellement — la préview
    /// résolue (`resolvedPreviewText`, MÊME propriété que `previewLine`
    /// utilise) — épinglé dans le libellé hérité par
    /// `accessibility.last_message_preview`/`…_ephemeral` (`ThemedConversationRow.swift`,
    /// `%@` positionnel portant `resolvedPreview` verbatim). Pont absent ⇒
    /// `base` retourné TEL QUEL, caractère pour caractère (témoins hérités
    /// de `ThemedConversationRowAccessibilityLabelTests` inchangés).
    ///
    /// Internal (pas `private`) : même convention que
    /// `ThemedConversationRow.conversationAccessibilityLabel` (voir son
    /// commentaire ci-dessus) — lue directement par
    /// `LentilleFlatRowBridgeAriaTests` via `@testable import`.
    var accessibilityLabel: String {
        let base = ThemedConversationRow(
            conversation: conversation,
            preferredContentLanguages: preferredContentLanguages
        ).conversationAccessibilityLabel

        guard showsBridge, let bridge = conversation.bridge else { return base }
        let bridgeText = LentilleBridgeLine.resolveAriaText(bridge: bridge, preferredLanguages: preferredContentLanguages)
        guard !bridgeText.isEmpty else { return base }

        let preview = resolvedPreviewText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !preview.isEmpty, base.contains(preview) {
            // Cas nominal : le segment préview épinglé dans `base` existe et
            // se reconnaît verbatim (`%@` positionnel des clés
            // `accessibility.last_message_preview`/`…_ephemeral`) — remplacé
            // par le texte du pont, exactement comme la ligne 2 le remplace
            // à l'écran.
            return base.replacingOccurrences(of: preview, with: bridgeText)
        }
        // Repli sûr : rien à remplacer proprement (préview vide, message
        // position-seule/expiré/masqué/vue-unique — states dont le libellé
        // hérité ne compose aucun `%@` de contenu à retrouver). Le pont
        // n'est JAMAIS un donnée fabriquée qu'on tairait faute de pouvoir
        // remplacer : il complète le libellé en fin de chaîne plutôt que de
        // rester muet (contrat « le lecteur d'écran doit entendre ce que
        // l'œil voit »).
        return base + ", " + bridgeText
    }

    // MARK: - Avatar — 44 (`.conversationHeaderCollapsed`) + anneau accent

    private var avatarView: some View {
        ZStack {
            Circle()
                .strokeBorder(accent.opacity(LentilleMetrics.Avatar.ringOpacity), lineWidth: LentilleMetrics.Avatar.ringWidth)
                .frame(
                    width: LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth * 2,
                    height: LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth * 2
                )

            LentilleRowAvatar(
                conversation: conversation,
                presenceState: effectivePresenceState,
                storyRingState: storyRingState,
                moodStatus: moodStatus,
                onViewStory: onViewStory,
                onViewProfile: onViewProfile,
                onViewConversationInfo: onViewConversationInfo,
                onMoodBadgeTap: onMoodBadgeTap,
                onCreateShareLink: onCreateShareLink
            )
        }
    }

    // MARK: - `Nom · heure`

    private var headerLine: some View {
        HStack(spacing: MeeshySpacing.xs) {
            // behaviour-matrix:L07 — « l'épingle ajoute un glyphe 📌 avant
            // le nom » (vol.5 §5.3, re-preuve ligne 296/361 du document
            // normatif : « 📌/🔒 avant le nom »). Décorative — annoncée par
            // `accessibilityLabel` (même clé « accessibility.pinned » que
            // le rang historique).
            if conversation.userState.isPinned {
                Text("📌")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }

            Text(conversation.displayName)
                .font(LentilleMetrics.Name.font)
                .foregroundColor(textPrimary)
                .lineLimit(1)
                .layoutPriority(1)

            // Sourdine — 🔕 après le nom (affordance manquante à l'audit,
            // contrat §4.3 « muted »). Annoncée par `accessibilityLabel`
            // ci-dessus (même clé que le rang historique) : décorative ici.
            if conversation.userState.isMuted {
                Text("🔕")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }

            // Favori — même émoji de classification que le rang historique
            // (`userState.reaction`), taille du token `Tags.emojiSize`.
            if let reaction = conversation.userState.reaction, !reaction.isEmpty {
                Text(reaction)
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }

            // Au repos, les étiquettes sont des points colorés ici. En
            // magnification elles montent NOMMÉES sur la ligne du haut : les
            // peindre deux fois dirait deux fois la même chose.
            if !isMagnified {
                tagPastilles
            }

            // behaviour-matrix:L13 — appel en cours (Scène) : « … remplace
            // toute autre info à droite » (contrat §3.3). `liveCall == nil`
            // (défaut) ⇒ la queue de ligne INCHANGÉE (heure + outbox) :
            // zéro donnée fabriquée quand l'appelant ne branche rien
            // (contrat LWS-2bis, « un appel inconnu n'est pas affiché »).
            if let liveCall {
                Spacer(minLength: 0)
                LentilleLiveCallBadge(liveCall: liveCall, accentColorHex: accentColorHex)
                if !liveCall.joined {
                    joinLiveCallButton
                }
            } else {
                // La date a QUITTÉ cette ligne le 2026-08-22 : elle vit seule,
                // en bas à droite (`dateLine`). Le nom possède donc toute la
                // ligne, et l'aperçu commence à la même abscisse que lui.
                Spacer(minLength: 0)

                // Pile de non-lus — MÊME place et MÊME rouge qu'en magnification
                // (retour produit 2026-08-22, soir : « enlever l'effectif sur les
                // rows non magnifiées, mais mettre le chip rouge si messages non
                // lus »). La loupe n'ajoute que l'effectif et la précision de la
                // date : elle agrandit, elle ne recompose pas.
                //
                // **Supersession assumée du contrat §LWS-7** (« aucun badge
                // chiffré nulle part », vol.5 « badge rouge 99+ supprimé ») :
                // cette règle datait d'un rang où le non-lu se disait par le seul
                // point accent du pont ✦. Or le pont n'apparaît QUE si la
                // conversation en a un — une conversation non lue SANS pont ne
                // disait donc rien du tout. Le chip, lui, parle toujours.
                //
                // Le chrome vient de l'ATOME PARTAGÉ, jamais d'une copie locale :
                // la matrice L06 l'exige nommément (« via l'atome partagé
                // UnreadCountBadge »), et c'est ce câblage qu'une fusion avait
                // perdu — l'atome existait, testé, sans un seul consommateur.
                if conversation.userState.unreadCount > 0 {
                    UnreadCountBadge(count: conversation.userState.unreadCount, isDark: isDark)
                        .fixedSize()
                        .layoutPriority(1)
                }
            }
        }
    }

    /// Troisième ligne — la date SEULE, poussée à droite (retour produit
    /// 2026-08-22 : « en bas sur une nouvelle ligne à droite mettre la date ;
    /// la date gardera cette place même en magnificence »).
    ///
    /// **Le glyphe d'outbox ⟳ ne la précède plus** (behaviour-matrix L09,
    /// amendement du lot 2, CONFIRMÉ par le porteur produit le 2026-08-23).
    /// L'outbox continue de renvoyer toute seule — le retrait ne touche que
    /// l'AFFORDANCE de liste, jamais le mécanisme. Une rangée n'est pas le bon
    /// endroit pour dire l'état d'un envoi : elle le disait pour toutes les
    /// conversations à la fois, sans rien offrir à faire de cette information.
    ///
    /// `LentilleRowTimestamp` garde son `TimelineView` — l'horodatage relatif
    /// doit ticker hors du portillon `.equatable()`, qui n'a délibérément
    /// aucune composante temporelle.
    private var dateLine: some View {
        HStack(spacing: MeeshySpacing.xs) {
            // Le flanc GAUCHE de cette ligne est vide au repos — c'est le
            // seul espace libre de la rangée, et c'est donc là que le surplus
            // atterrit : « le pill de mode de lecture se met exactement où
            // c'est actuellement, avec la chip du nombre d'utilisateurs qui
            // doit être actionnable » (directive 2026-08-23).
            if let magnification {
                LentilleModePill(
                    conversation: conversation,
                    isAnonymous: magnification.isAnonymous,
                    isDark: isDark
                )
                if conversation.type != .direct {
                    LentilleMemberCountChip(
                        conversation: conversation,
                        onShowParticipants: magnification.onShowParticipants
                    )
                }
            }

            Spacer(minLength: 0)

            // Le glyphe d'outbox a quitté cette ligne en amont (amendement
            // L09 : « l'outbox continue de renvoyer, sans affordance de
            // liste ») — la magnification ne le rétablit pas. Elle n'ajoute
            // que de la PRÉCISION à la date, jamais une affordance que le
            // repos n'a pas.
            timestampText
                .font(LentilleMetrics.Time.font)
                .foregroundColor(Self.timestampColor(unreadCount: conversation.userState.unreadCount, accent: accent, isDark: isDark))
                .lineLimit(1)
                .fixedSize()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    /// La date garde EXACTEMENT sa place en magnification (« la date gardera
    /// cette place même en magnificence », 2026-08-22) : seule sa PRÉCISION
    /// change — relatif court au repos, date complète sous la loupe, par la
    /// même loi que le message en focus du fil.
    ///
    /// `LentilleRowTimestamp` garde son `TimelineView` au repos : l'horodatage
    /// relatif doit ticker hors du portillon `.equatable()`, qui n'a
    /// délibérément aucune composante temporelle. La date complète, elle, n'a
    /// rien à ticker.
    @ViewBuilder
    private var timestampText: some View {
        if let magnification {
            Text(LentilleFocusCard.fullTimestamp(
                lastMessageAt: conversation.lastMessageAt,
                now: magnification.now,
                calendar: .current,
                locale: .current
            ))
        } else {
            LentilleRowTimestamp(date: conversation.lastMessageAt)
        }
    }

    /// Tags — « pastilles 6 (≤ 3) » (contrat §4.3), après le nom. Adaptation
    /// au rang plat du `tagsRow` historique (capsules de texte, en propre
    /// ligne) : ici de simples points colorés, inline, jamais une carte.
    private var tagPastilles: some View {
        HStack(spacing: 3) {
            ForEach(conversation.tags.prefix(LentilleMetrics.Tags.maxCount)) { tag in
                Circle()
                    .fill(Color(hex: tag.color))
                    .frame(width: LentilleMetrics.Tags.size, height: LentilleMetrics.Tags.size)
            }
        }
        .accessibilityHidden(true)
    }

    /// behaviour-matrix:L06 — « le timestamp rouge sur non-lu [est]
    /// supprimé […] l'heure reste TERTIAIRE au même format ». Diverge
    /// délibérément de `ThemedConversationRow.timestampColor` (rouge
    /// sémantique si non-lu, sinon accent) : le rang plat ne bascule plus
    /// JAMAIS sur le rouge — le pont ✦ + le point accent 8 px portent déjà
    /// la nouvelle du non-lu (contrat §LWS-7), le timestamp reste un
    /// troisième niveau de texte, quel que soit l'état de lecture.
    /// `unreadCount`/`accent` restent dans la signature pour la stabilité
    /// d'appel (site d'appel + suite de tests inchangés) mais ne
    /// discriminent plus rien ; `isDark` a un défaut pour rester appelable
    /// sans vue (tests purs, même discipline que `rowOpacity`/`showsBridge`).
    nonisolated static func timestampColor(unreadCount: Int, accent: Color, isDark: Bool = false) -> Color {
        MeeshyColors.textMuted(isDark: isDark)
    }

    // MARK: - Appel en cours (Scène) — bouton Rejoindre (behaviour-matrix:L13)

    /// « Non rejoint : bouton Rejoindre capsule accent en trailing » (contrat
    /// §3.3) — réutilise la clé `call.header.rejoin` déjà traduite dans les
    /// 7 langues de l'app (`ConversationView+Header.swift`, bandeau d'appel
    /// du fil) plutôt que d'ouvrir une seconde clé pour le même mot.
    /// `Button(.plain)` + `.contentShape(Rectangle())` (contrat §LWS-7 : un
    /// contrôle interne au rang ne doit jamais être un `.onTapGesture`, avalé
    /// par le long-press du conteneur).
    private var joinLiveCallButton: some View {
        Button(action: { onJoinLiveCall?() }) {
            Text(String(localized: "call.header.rejoin", defaultValue: "Rejoindre", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.vertical, 3)
                .background(Capsule(style: .continuous).fill(accent))
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .accessibilityLabel(String(localized: "call.header.rejoin.a11y", defaultValue: "Appel en cours, toucher pour rejoindre", bundle: .main))
    }

    // MARK: - Ligne 2 — précédence INCHANGÉE : typing > brouillon > pont > préview

    /// Décision PURE de la ligne 2 — séparée du rendu pour rester testable
    /// sans SwiftUI (I-065, « tests minimaux embarqués : précédence
    /// ligne 2 »). Complétée par I-068. `nonisolated` — même raison que
    /// `showsBridge` ci-dessus.
    nonisolated enum Line2Kind: Equatable {
        case typing, draft, bridge, preview

        nonisolated static func resolve(hasTyping: Bool, hasDraft: Bool, showsBridge: Bool) -> Line2Kind {
            if hasTyping { return .typing }
            if hasDraft { return .draft }
            if showsBridge { return .bridge }
            return .preview
        }
    }

    private var line2Kind: Line2Kind {
        Line2Kind.resolve(
            hasTyping: typingUsername != nil,
            hasDraft: draftSummary != nil,
            showsBridge: showsBridge
        )
    }

    @ViewBuilder
    private var line2: some View {
        switch line2Kind {
        case .typing:
            typingLine
        case .draft:
            if let draftSummary { draftLine(draftSummary) }
        case .bridge:
            if let bridge = conversation.bridge {
                LentilleBridgeLine(
                    bridge: bridge,
                    preferredLanguages: preferredContentLanguages,
                    accentColor: accentColorHex,
                    isDark: isDark
                )
            }
        case .preview:
            previewLine
        }
    }

    private var typingLine: some View {
        HStack(spacing: 5) {
            Text(typingUsername.map { name in
                String(format: String(localized: "typing.named", bundle: .main), name)
            } ?? String(localized: "typing.anonymous", bundle: .main))
                .font(LentilleMetrics.Line2.font)
                .italic()
                .foregroundColor(accent)
                .lineLimit(1)
            LentilleTypingDots(accentColorHex: accentColorHex)
        }
    }

    private func draftLine(_ draft: DraftSummary) -> some View {
        HStack(spacing: 4) {
            Text(draft.previewText.isEmpty
                ? String(localized: "draft.label", bundle: .main)
                : String(localized: "draft.label_prefix", bundle: .main))
                .font(LentilleMetrics.Line2.font)
                .foregroundColor(MeeshyColors.error)
            if !draft.previewText.isEmpty {
                Text(draft.previewText)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        }
    }

    /// B1 (Prisme Linguistique), règle 3 — la préview TELLE QU'ELLE SERA
    /// RENDUE, résolue exclusivement par le SDK gelé. Aucun `@State` de
    /// langue ici (contrat §LWS-7, contrainte dure).
    private var resolvedPreviewText: String {
        conversation.resolvedLastMessagePreview(preferredLanguages: preferredContentLanguages) ?? ""
    }

    // behaviour-matrix:L03 — « conservent leurs glyphes SF actuels (timer,
    // eye.slash, flame) en tête de ligne 2, en italique » — les quatre
    // glyphes ci-dessous reprennent `ThemedConversationRow` (lignes
    // ~510/549/561/573, fichier interdit d'édition, lu seulement) : `timer`
    // pour l'éphémère actif, `timer.badge.xmark` pour l'expiré, `eye.slash`
    // pour le masqué, `flame` pour la vue unique — jamais réimportés
    // (fichier interdit), reproduits ici comme `timestampColor` l'est déjà.
    @ViewBuilder
    private var previewLine: some View {
        switch conversation.lastMessageSummaryKind() {
        case .expired:
            HStack(spacing: 4) {
                Image(systemName: "timer.badge.xmark")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(textMuted)
                Text(String(localized: "message.expired"))
                    .font(LentilleMetrics.Line2.font)
                    .italic()
                    .foregroundColor(textMuted)
                    .lineLimit(1)
            }

        case .hidden:
            HStack(spacing: 4) {
                senderLabel
                Image(systemName: "eye.slash")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(textSecondary)
                Text(String(localized: "conversation.summary.hidden"))
                    .font(LentilleMetrics.Line2.font)
                    .italic()
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }

        case .viewOnce:
            HStack(spacing: 4) {
                senderLabel
                Image(systemName: "flame")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(accent)
                Text(String(localized: "conversation.summary.view_once"))
                    .font(LentilleMetrics.Line2.font)
                    .italic()
                    .foregroundColor(accent)
                    .lineLimit(1)
            }

        case .ephemeralActive:
            standardPreview(showEphemeralIcon: true)

        case .standard:
            standardPreview(showEphemeralIcon: false)
        }
    }

    @ViewBuilder
    private func standardPreview(showEphemeralIcon: Bool) -> some View {
        let hasText = !resolvedPreviewText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let attachments = conversation.lastMessageAttachments
        let totalCount = conversation.lastMessageAttachmentCount

        if hasText {
            // « Auteur : message » en UN SEUL texte (retour produit
            // 2026-08-22 : « juste mettre l'auteur : message »), même
            // grammaire que la carte de magnification — deux `Text` côte à
            // côte dans un `HStack` laissaient l'auteur occuper sa propre
            // colonne et tronquaient le message avant le bord.
            HStack(spacing: 4) {
                if showEphemeralIcon {
                    Image(systemName: "timer")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(accent)
                }
                (senderPrefix + Text(resolvedPreviewText)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary))
                    .lineLimit(isMagnified ? 2 : 1)
            }
        } else if let first = attachments.first {
            let display = AttachmentDisplay.make(for: first.mimeType)
            HStack(spacing: 4) {
                if showEphemeralIcon {
                    Image(systemName: "timer")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(accent)
                }
                senderLabel
                Image(systemName: display.icon)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(display.tintColor)
                Text(display.shortLabel)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
                if totalCount > 1 {
                    Text("+\(totalCount - 1)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(accent)
                }
            }
        } else if let place = conversation.lastMessageLocation {
            HStack(spacing: 4) {
                senderLabel
                Image(systemName: "mappin.and.ellipse")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(accent)
                Text(place.name ?? String(localized: "conversation.summary.location", defaultValue: "Position"))
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        } else {
            Text("")
                .font(LentilleMetrics.Line2.font)
        }
    }

    /// « Auteur : » — la règle, pure et partagée avec la carte de
    /// magnification (`LentilleFocusCard.senderPrefix`), pour que les deux
    /// vues ne puissent pas dériver l'une de l'autre. `nil` quand il n'y a
    /// personne à nommer : le message commence alors la ligne.
    nonisolated static func authorPrefix(name: String?) -> String? {
        guard let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return "\(trimmed) : "
    }

    /// Le préfixe, en `Text` concaténable — teinté accent, comme la carte.
    private var senderPrefix: Text {
        guard let prefix = Self.authorPrefix(name: conversation.lastMessageSenderName) else { return Text("") }
        return Text(prefix)
            .font(MeeshyFont.relative(LentilleMetrics.Line2.size, weight: .semibold))
            .foregroundColor(accent)
    }

    /// Conservé pour les branches qui INTERCALENT un glyphe entre l'auteur et
    /// le libellé (pièce jointe, localisation, masqué, vue unique) : là, la
    /// concaténation en un seul `Text` est impossible.
    private var senderLabel: some View {
        Group {
            if let name = conversation.lastMessageSenderName, !name.isEmpty {
                Text(name)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .foregroundColor(accent)
                    .lineLimit(1)
                    .layoutPriority(1)
            }
        }
    }
}

// MARK: - Equatable — COPIÉ depuis `ThemedConversationRow.==` puis ÉTENDU au
// champ `bridge` (contrat §LWS-7 : « pas réécrit — sous-comparer, c'est
// geler une ligne ; sur-comparer, c'est perdre le portillon »).
//
// `renderFingerprint` (SDK, C-029) replie déjà `bridge` en ENTIER — kind,
// unreadCount, suggestedMode, isComplete, text, originalLanguage,
// translations (valeurs comprises), data (auteurs/+N/messageCount/médias) —
// exactement pour que ce portillon ne gèle jamais un pont ré-émis (E13,
// régression jumelle de B1). La comparaison directe de `bridge` ci-dessous
// est donc redondante avec `renderFingerprint` dans tous les cas atteints
// aujourd'hui ; elle reste écrite en toutes lettres parce que c'est
// EXACTEMENT ce que demande le contrat (« étendu au champ bridge », pas
// « laissé au hash »), et parce qu'un futur hash tronqué ou une collision
// ne doit jamais pouvoir geler le pont derrière ce portillon.
extension LentilleConversationRow: @MainActor Equatable {
    static func == (lhs: LentilleConversationRow, rhs: LentilleConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.conversation.bridge == rhs.conversation.bridge &&
        lhs.typingUsername == rhs.typingUsername &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState &&
        lhs.isSelected == rhs.isSelected &&
        lhs.draftSummary == rhs.draftSummary &&
        lhs.preferredContentLanguages == rhs.preferredContentLanguages &&
        lhs.liveCall == rhs.liveCall &&
        // La magnification décide de TROIS lignes de rendu : elle doit passer
        // le portillon. Ses fermetures en sont exclues — comparées, elles le
        // feraient rater à chaque passe de body de la liste.
        LentilleMagnification.rendersIdentically(lhs.magnification, rhs.magnification)
    }
}

// MARK: - Avatar du rang plat

/// Même stratégie de menu contextuel que `ConversationAvatarView`
/// (`ThemedConversationRow.swift`, privée à ce fichier interdit) :
/// `ConversationAvatarMenu`/`AvatarMenuRole` sont déclarés SANS modificateur
/// d'accès dans le fichier historique (donc `internal`, module-wide) —
/// réutilisés tels quels plutôt que redéclarés (Single Source of Truth).
/// Seule différence avec l'original : le contexte d'avatar,
/// `LentilleMetrics.Avatar.context` (44pt) au lieu de `.conversationList`
/// (52pt, réservé au rang historique, §0).
private struct LentilleRowAvatar: View {
    let conversation: Conversation
    let presenceState: PresenceState?
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil

    private var isDirect: Bool { conversation.type == .direct }

    private var directContextMenuItems: [AvatarContextMenuItem] {
        ConversationAvatarMenu.directRoles().map(menuItem(for:))
    }

    private var groupContextMenuItems: [AvatarContextMenuItem] {
        let sharableTypes: [MeeshyConversation.ConversationType] = [.group, .public, .global, .broadcast]
        let canShare = sharableTypes.contains(conversation.type) && onCreateShareLink != nil
        return ConversationAvatarMenu.groupRoles(canShare: canShare).map(menuItem(for:))
    }

    private func menuItem(for role: AvatarMenuRole) -> AvatarContextMenuItem {
        switch role {
        case .conversationInfo:
            return AvatarContextMenuItem(
                label: String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main),
                icon: "info.circle.fill"
            ) { onViewConversationInfo?() }
        case .profile:
            return AvatarContextMenuItem(
                label: String(localized: "Voir le profil", bundle: .main),
                icon: "person.circle.fill"
            ) { onViewProfile?() }
        case .shareLink:
            return AvatarContextMenuItem(
                label: String(localized: "menu.create_share_link", bundle: .main),
                icon: "link.badge.plus"
            ) { onCreateShareLink?() }
        }
    }

    var body: some View {
        MeeshyAvatar(
            name: conversation.name,
            context: LentilleMetrics.Avatar.context,
            accentColor: conversation.accentColor,
            secondaryColor: conversation.colorPalette.secondary,
            avatarURL: isDirect ? conversation.participantAvatarURL : conversation.avatar,
            storyState: storyRingState,
            moodEmoji: moodStatus?.moodEmoji,
            // behaviour-matrix:L10 — « … avec des dots de présence aussi
            // pour les groupes (agrégat PresenceManager, "quelqu'un
            // d'actif") ». La règle « un seul coin, mood gagne, présence
            // sinon » vit dans MeeshyAvatar (§1.3, frozen) : ce fichier ne
            // fait plus que la moitié de cette règle (mood gagne), le
            // second membre (« présence sinon ») ne doit plus être
            // court-circuité par `isDirect` — un groupe a autant droit à un
            // dot de présence agrégée qu'un DM. `presenceState` porte déjà
            // `.offline` = aucun dot (contrat §4.3 « offline = aucun dot »,
            // verrouillé par MeeshyAvatar, pas ici).
            presenceState: moodStatus == nil ? presenceState : nil,
            onTap: isDirect ? onViewProfile : onViewConversationInfo,
            onViewProfile: nil,
            onViewStory: (isDirect && storyRingState != .none) ? onViewStory : nil,
            onMoodTap: onMoodBadgeTap,
            contextMenuItems: isDirect ? directContextMenuItems : groupContextMenuItems
        )
    }
}

// MARK: - Horodatage relatif (ticker 60 s)

/// Même patron que `ThemedConversationRow.RelativeTimestampText` (privée à
/// ce fichier interdit) : `TimelineView(.periodic)` ticke le texte hors du
/// portillon `.equatable()` (qui n'a délibérément aucune composante
/// temporelle), sans quoi l'horodatage relatif gèlerait au montage.
private struct LentilleRowTimestamp: View {
    let date: Date

    var body: some View {
        // Miroir de `ThemedConversationRow.RelativeTimestampText.liveTickWindow`
        // (audit chauffe 2026-08-26) : le tick minute ne vit que tant que le
        // libellé change à la minute ; une rangée ancienne rend un texte
        // statique, rafraîchi au prochain passage de body de la liste.
        if Date().timeIntervalSince(date) > 3600 {
            Text(RelativeTimeFormatter.shortString(for: date))
        } else {
            TimelineView(.periodic(from: date, by: 60)) { _ in
                Text(RelativeTimeFormatter.shortString(for: date))
            }
        }
    }
}

// MARK: - Indicateur de saisie

/// Même patron que `ThemedConversationRow.TypingDotsView` (privée à ce
/// fichier interdit), reproduit ici pour le rang plat — trois points
/// pulsés, désactivés par Reduce Motion (repos à la phase HAUTE, jamais
/// figés à mi-animation).
private struct LentilleTypingDots: View {
    let accentColorHex: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color(hex: accentColorHex))
                    .frame(width: 5, height: 5)
                    .scaleEffect(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.5))
                    .opacity(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.4))
                    .animation(
                        reduceMotion
                            ? nil
                            : Animation.easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.18),
                        value: isAnimating
                    )
            }
        }
        .onAppear { isAnimating = true }
        .onDisappear { isAnimating = false }
        .accessibilityHidden(true)
    }
}

// MARK: - Appel en cours (Scène) — badge (behaviour-matrix:L13)

/// « ● pulsant (accent) + « {n} voix · depuis {durée} » — durée par le
/// TimelineView 60 s déjà présent pour l'heure » (contrat §3.3). Même
/// patron que `LentilleRowTimestamp` pour le ticker : la durée vit HORS du
/// portillon `.equatable()` du rang, recalculée à chaque tick plutôt que
/// figée au montage. Purement dérivé de `ConversationLiveCall` (LWS-2bis,
/// `LentilleProviders.swift`) : cette vue ne sait rien d'un
/// `Local…Provider`/`Gateway…Provider`, elle reçoit une valeur déjà
/// résolue — zéro donnée fabriquée.
private struct LentilleLiveCallBadge: View {
    let liveCall: ConversationLiveCall
    let accentColorHex: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isPulsing = false

    private var accent: Color { Color(hex: accentColorHex) }

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(accent)
                .frame(width: LentilleMetrics.Tags.size, height: LentilleMetrics.Tags.size)
                .scaleEffect(reduceMotion ? 1.0 : (isPulsing ? 1.3 : 1.0))
                .animation(
                    reduceMotion
                        ? nil
                        : Animation.easeInOut(duration: 0.9).repeatForever(autoreverses: true),
                    value: isPulsing
                )
                .onAppear { isPulsing = true }
                .onDisappear { isPulsing = false }

            TimelineView(.periodic(from: liveCall.startedAt, by: 60)) { _ in
                Text(
                    String(
                        format: String(
                            localized: "lentille.livecall.status",
                            defaultValue: "%lld voix · depuis %@",
                            bundle: .main
                        ),
                        liveCall.voices,
                        RelativeTimeFormatter.shortString(for: liveCall.startedAt)
                    )
                )
                .font(LentilleMetrics.Line2.font)
                .foregroundColor(accent)
                .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
