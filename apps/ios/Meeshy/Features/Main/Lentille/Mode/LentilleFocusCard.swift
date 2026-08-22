import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Pourquoi ce fichier vit dans Lentille/Mode/, pas Lentille/Perspective/
//
// Re-preuve d'ancrage (règle §0 du workshop) : le contrat/workshop citent
// « Lentille/Perspective/ + Lentille/Mode/ » comme territoire d'I-071. Mais
// `Lentille/Perspective/` porte une garde de source GELÉE et déjà VERTE
// (`LentillePerspectiveCurveTests.test_perspective_appliesOpacityAndScaleOnly`,
// scan DYNAMIQUE de tout le dossier) qui interdit `.font(`, `.offset(`,
// `blur(`, `rotationEffect(`… à TOUT fichier qu'il contient — la carte, qui a
// besoin des trois pour son texte, sa position et son rendu, y ferait rougir
// une suite gelée. `Lentille/Mode/` est le SECOND dossier que LWS-8 possède
// (contrat §1.4, « Lentille/Perspective/*.swift, Lentille/Mode/*.swift ») et
// ne porte aucune garde de ce type : c'est le domicile correct de la carte.
// `Lentille/Perspective/*.swift` (GELÉ : `LentillePerspective.swift`,
// `LentilleFocusElection.swift`, `LentilleFocusElectionHost.swift`) est
// CONSOMMÉ ici, jamais édité.

// MARK: - La carte MAGNIFIÉE (2026-08-21)
//
// Avant : un cadre vide (fond + anneau + encoche) peint PAR-DESSUS la rangée
// élue, repositionné seulement au changement d'élu — il dérivait jusqu'à
// 45 pt de la rangée pendant le défilement (hystérésis), masquait la 2ᵉ ligne
// et restait planté dans le vide en fin de liste. L'encoche ouvrait un
// `.popover`, qui devient une feuille plein écran sur iPhone.
//
// Maintenant : la carte EST la rangée élue, en grand — avatar 52, nom, heure,
// non-lus, 2ᵉ ligne sur deux lignes (pont ✦ ou aperçu Prisme), badge de type,
// et l'encoche est un `Menu` natif (Liquid Glass sur iOS 26). Elle suit la
// rangée à CHAQUE tick de défilement (hôte abonné au relais) ; sa hauteur
// (`LentilleMetrics.FocusCard.height`) déborde légèrement de la rangée — la
// loupe — sans jamais toucher la hauteur des rangées (zéro relayout, R2).
// Le contenu est `Equatable` : un tick ne fait que DÉPLACER la carte.

struct LentilleFocusCard: View, Equatable {

    let conversation: Conversation
    let preference: ReadingModeOrchestrator.ReadingModePreference
    let decision: ReadingModeOrchestrator.OrchestratorDecision
    let capabilities: ReadingModeOrchestrator.ReadingModeCapabilities
    let preferredContentLanguages: [String]
    let isDark: Bool
    let reduceMotion: Bool
    var onSelectPreference: (ReadingModeOrchestrator.ReadingModePreference) -> Void = { _ in }
    /// Catégories de l'utilisateur — l'encoche HAUT-GAUCHE (directive
    /// 2026-08-21 : « la catégorie en haut à gauche exactement comme le
    /// mode ; en y touchant, la liste des catégories pour déplacer »).
    var categories: [ConversationSection] = []
    /// Étiquette qui filtre la liste EN CE MOMENT (`nil` = aucun filtre) —
    /// la chip correspondante propose « retirer le filtre » au lieu de
    /// « afficher les conversations avec ce tag ».
    var activeTagFilter: String? = nil
    var onMoveToSection: (String) -> Void = { _ in }
    var onFilterByTag: (String?) -> Void = { _ in }
    var onRemoveTag: (MeeshyConversationTag) -> Void = { _ in }
    /// Appui sur l'icône de synchronisation ⇒ synchronisation IMMÉDIATE.
    var onForceSync: () -> Void = {}
    /// Appui sur l'effectif ⇒ la feuille des participants (2026-08-22).
    var onShowParticipants: () -> Void = {}
    /// Pastille de présence de l'avatar (2026-08-22 : « il manque la
    /// pastille de présence dans la magnificence ») — même source que la
    /// rangée plate ; `.offline`/`nil` = aucun point.
    var presenceState: PresenceState? = nil
    /// Horloge de la date complète (injectée par les tests).
    var now: Date = Date()

    static func == (lhs: LentilleFocusCard, rhs: LentilleFocusCard) -> Bool {
        lhs.conversation.id == rhs.conversation.id
            && lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint
            && lhs.preference == rhs.preference
            && lhs.decision == rhs.decision
            && lhs.capabilities == rhs.capabilities
            && lhs.preferredContentLanguages == rhs.preferredContentLanguages
            && lhs.isDark == rhs.isDark
            && lhs.reduceMotion == rhs.reduceMotion
            && lhs.categories == rhs.categories
            && lhs.activeTagFilter == rhs.activeTagFilter
            && lhs.presenceState == rhs.presenceState
    }

    /// Date COMPLÈTE du dernier message, MÊME loi que le message en focus du
    /// fil (`FocalFocusTimestamp`) avec le joint « à » : « Aujourd'hui à
    /// 5:49 », « Hier à 22:12 », « Mardi à 23:50 », « Sam. 3 oct. 2025 à
    /// 14:41 » (directive 2026-08-21).
    nonisolated static func fullTimestamp(lastMessageAt: Date, now: Date, calendar: Calendar, locale: Locale) -> String {
        FocalFocusTimestamp.listLabel(
            sentAt: lastMessageAt,
            timeString: TimeStringCache.shared.format(lastMessageAt),
            now: now,
            calendar: calendar,
            locale: locale,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui", bundle: .main),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier", bundle: .main),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier", bundle: .main),
            atWord: String(localized: "conversations.focus.at", defaultValue: "à", bundle: .main)
        )
    }

    private var accent: Color { Color(hex: conversation.accentColor) }
    private var textPrimary: Color { MeeshyColors.textPrimary(isDark: isDark) }
    private var textSecondary: Color { MeeshyColors.textSecondary(isDark: isDark) }
    private var textMuted: Color { MeeshyColors.textMuted(isDark: isDark) }

    nonisolated static func ringOpacity(reduceMotion: Bool) -> Double {
        reduceMotion ? 0 : 1
    }

    /// Le pont ✦ ne remplace l'aperçu que s'il y a quelque chose à rattraper —
    /// même règle que `LentilleConversationRow.showsBridge`.
    nonisolated static func showsBridge(unreadCount: Int, bridge: ConversationBridge?) -> Bool {
        unreadCount > 0 && bridge != nil
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            cardBackground
                // Décoratif SEUL : ne doit intercepter ni le défilement, ni
                // le tap/long-press/swipe de la rangée réelle qu'elle recouvre.
                .allowsHitTesting(false)

            magnifiedContent
                .allowsHitTesting(false)

            // CSS `top: -9; right: 14` (§4.3) : l'encoche POKE hors du bord
            // haut de la carte (offset y NÉGATIF, `ModeNotch.top` l'est déjà)
            // et s'inset depuis le bord droit.
            notch
                .offset(x: -LentilleMetrics.ModeNotch.right, y: LentilleMetrics.ModeNotch.top)
        }
        // **UN seul ancrage de bord bas** (retour produit 2026-08-22 : « la
        // conversation magnifiée semble trop surchargée avec des espaces
        // compliqués ; les éléments autour doivent être plus discrets ou
        // enlevés »).
        //
        // La carte portait CINQ ancrages — encoche de mode, catégorie,
        // étiquettes, effectif + synchronisation, nom original — soit jusqu'à
        // six capsules bordées d'accent débordant des deux bords, dont trois à
        // la même ordonnée. Une carte de magnification est un instrument de
        // LECTURE : elle doit dire « voici de qui il s'agit et ce qui vient
        // d'être dit », en plus gros. Elle le disait moins bien que la rangée
        // plate qu'elle recouvre.
        //
        // Le critère qui a tranché chaque retrait : « cette action a-t-elle
        // déjà un domicile ? » — catégorie : trois (menu contextuel, panneau,
        // glisser-déposer sur les chips de section) ; synchronisation : deux
        // appels AUTOMATIQUES (reconnexion socket, retour au premier plan), et
        // la rangée plate en peint déjà le glyphe ; participants : l'avatar de
        // la rangée SOUS la carte ouvre la même feuille et reste touchable
        // (`allowsHitTesting(false)` ci-dessus) ; nom original : feuille
        // d'infos et champ Renommer.
        //
        // Restent l'ENCOCHE DE MODE — seule capsule bordée de la carte, et
        // seule raison FONCTIONNELLE de son existence — et, en bas, les
        // étiquettes avec l'effectif. Les étiquettes ne peuvent PAS partir
        // sèchement : `activeTagFilter` n'a qu'un seul écrivain dans toute
        // l'app, ce menu. Elles perdent donc leur contour d'accent au lieu de
        // leur place ; leur relogement dans le menu contextuel reste à faire.
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: MeeshySpacing.xs) {
                if !conversation.tags.isEmpty {
                    tagChips
                }
                Spacer(minLength: 0)
                if conversation.type != .direct {
                    typeBadge
                }
            }
            .padding(.horizontal, LentilleMetrics.ModeNotch.right)
            .offset(y: -LentilleMetrics.ModeNotch.top)
        }
    }

    // MARK: - Fond + anneau

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: LentilleMetrics.FocusCard.radius, style: .continuous)
            .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
            .overlay(
                RoundedRectangle(cornerRadius: LentilleMetrics.FocusCard.radius, style: .continuous)
                    .strokeBorder(accent, lineWidth: LentilleMetrics.FocusCard.ringSize)
                    // Reduce motion ⇒ « fond SEUL » (critère LWS-8).
                    .opacity(Self.ringOpacity(reduceMotion: reduceMotion))
            )
            .shadow(
                color: Color.black.opacity(isDark ? LentilleMetrics.FocusCard.shadowOpacityDark : LentilleMetrics.FocusCard.shadowOpacityLight),
                radius: LentilleMetrics.FocusCard.shadowRadius,
                x: 0,
                y: LentilleMetrics.FocusCard.shadowY
            )
    }

    // MARK: - Contenu magnifié

    private var magnifiedContent: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            avatar
            VStack(alignment: .leading, spacing: 3) {
                headerLine
                line2
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, LentilleMetrics.Row.paddingHorizontal)
        .padding(.vertical, LentilleMetrics.FocusCard.paddingVertical)
    }

    private var avatar: some View {
        MeeshyAvatar(
            name: conversation.displayName,
            context: LentilleMetrics.FocusCard.avatarContext,
            kind: conversation.type == .direct ? .user : .entity,
            accentColor: conversation.accentColor,
            avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
            presenceState: presenceState,
            isDark: isDark
        )
    }

    private var headerLine: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if conversation.userState.isPinned {
                Text("📌")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }
            Text(conversation.displayName)
                .font(LentilleMetrics.FocusCard.nameFont)
                .foregroundColor(textPrimary)
                .lineLimit(1)
                // L'IDENTITÉ gagne toujours la ligne (2026-08-22). La date
                // avait la priorité la plus forte : c'était le NOM qui
                // tronquait en premier, sur une carte dont le seul métier est
                // de montrer de qui il s'agit, en plus gros. La magnification
                // rétrécissait l'identité.
                .layoutPriority(2)
            if conversation.userState.isMuted {
                Text("🔕")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }
            Text("·")
                .font(LentilleMetrics.Time.font)
                .foregroundColor(textMuted)
            Text(Self.fullTimestamp(lastMessageAt: conversation.lastMessageAt, now: now, calendar: .current, locale: .current))
                .font(LentilleMetrics.Time.font)
                .foregroundColor(textMuted)
                .lineLimit(1)
                // La date complète reste — c'est une vraie valeur ajoutée de
                // la magnification — mais elle cède la place la première.
                .layoutPriority(0)
            Spacer(minLength: 0)
            if conversation.userState.unreadCount > 0 {
                // Jamais comprimé : c'est le NOM qui tronque, pas le badge.
                unreadBadge
                    .fixedSize()
                    .layoutPriority(3)
            }
        }
    }

    private var unreadBadge: some View {
        Text(conversation.userState.unreadCount > 99 ? "99+" : "\(conversation.userState.unreadCount)")
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .heavy))
            .foregroundColor(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Capsule(style: .continuous).fill(accent))
            // Le libellé annonce l'effectif RÉEL, pas le « 99+ » affiché : le
            // plafond est une contrainte de largeur du badge, pas une donnée.
            // Ce site était le TROISIÈME porteur de `accessibility.unread_messages`
            // — 235i n'en avait corrigé que deux, et la clé qu'elle a retirée du
            // catalogue est restée référencée ici.
            .accessibilityLabel(UnreadCountLabel.messages(conversation.userState.unreadCount))
    }

    @ViewBuilder
    private var line2: some View {
        if Self.showsBridge(unreadCount: conversation.userState.unreadCount, bridge: conversation.bridge),
           let bridge = conversation.bridge {
            LentilleBridgeLine(
                bridge: bridge,
                preferredLanguages: preferredContentLanguages,
                accentColor: conversation.accentColor,
                isDark: isDark
            )
        } else {
            previewLine
        }
    }

    private var previewText: String {
        let text = conversation.resolvedLastMessagePreview(preferredLanguages: preferredContentLanguages)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !text.isEmpty { return text }
        if let first = conversation.lastMessageAttachments.first {
            let display = AttachmentDisplay.make(for: first.mimeType)
            let extra = conversation.lastMessageAttachmentCount > 1
                ? " +\(conversation.lastMessageAttachmentCount - 1)"
                : ""
            return display.shortLabel + extra
        }
        return ""
    }

    /// « Auteur : début du texte » en UN seul texte qui coule sur deux
    /// lignes — retour à la ligne naturel après l'auteur, la suite dessous
    /// (directive 2026-08-22). Le dernier expéditeur, pour TOUTES les
    /// conversations (2026-08-21) — la rangée plate le réserve aux groupes.
    @ViewBuilder
    private var previewLine: some View {
        // Rien à dire (ni expéditeur, ni texte) ⇒ rien de monté : un `Text`
        // vide concaténé cassait la mise en page de toute la carte (rangée
        // « charlie amah », 2026-08-22).
        if !previewText.isEmpty || !(conversation.lastMessageSenderName ?? "").isEmpty {
            (senderPrefix + Text(previewText).font(LentilleMetrics.Line2.font).foregroundColor(textSecondary))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
    }

    private var senderPrefix: Text {
        guard let sender = conversation.lastMessageSenderName, !sender.isEmpty else { return Text("") }
        return Text("\(sender) : ")
            .font(MeeshyFont.relative(LentilleMetrics.Line2.size, weight: .semibold))
            .foregroundColor(accent)
    }

    // MARK: - Chip de type + memberCount (behaviour-matrix:L08) — sur la ligne
    // `originalName` a vécu ici jusqu'au 2026-08-22 : une chip purement
    // décorative (aucune action) au CENTRE du bord haut, la place la plus
    // premium de la carte, pour une information de second ordre. Retirée :
    // elle vit dans la feuille d'infos et à côté du champ Renommer.

    /// L'effectif est une INFORMATION, pas un contrôle (2026-08-22).
    ///
    /// C'était un bouton vers la feuille des participants — que l'avatar de la
    /// rangée SOUS la carte ouvre déjà, et qui reste touchable puisque la
    /// carte ne capte pas les touches. Un doublon de tap, au prix d'une
    /// capsule bordée d'accent de plus sur un bord déjà chargé. Ce qu'il
    /// apportait vraiment, c'est le NOMBRE, qui n'existe nulle part ailleurs
    /// dans la liste : il reste, en label nu et muet.
    private var typeBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: Self.typeBadgeIcon(for: conversation.type))
                .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
                .imageScale(.small)
            if conversation.memberCount > 1 {
                Text(conversation.memberCountDisplay)
                    .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
            }
        }
        .foregroundColor(textMuted)
        .accessibilityElement(children: .combine)
        .accessibilityValue(conversation.memberCountDisplay)
    }

    // `syncChip` a vécu ici jusqu'au 2026-08-22 : un BOUTON « synchroniser
    // maintenant » sur le bord bas. Retiré — `flushOutbox()` est DÉJÀ appelé
    // automatiquement à la reconnexion socket et au retour au premier plan,
    // et la rangée plate sous la carte peint déjà le même glyphe, sans
    // capsule. C'était un déclencheur manuel pour ce que l'app fait seule sur
    // deux fronts, au prix d'une 6e capsule bordée d'accent.

    private static func typeBadgeIcon(for type: MeeshyConversation.ConversationType) -> String {
        switch type {
        case .group: return "person.2.fill"
        case .community: return "person.3.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "sparkles"
        case .public, .global, .broadcast: return "globe"
        case .direct: return "person.fill"
        }
    }

    // MARK: - Encoche = Menu natif (premier des trois points d'entrée, LWS-8)

    private var notchText: String {
        LentilleModeLabels.notchText(decision: decision, preference: preference, suggestedMode: conversation.bridge?.suggestedMode)
    }

    /// `Menu` SYSTÈME (Liquid Glass sur iOS 26), jamais un `.popover` : sur
    /// iPhone un popover se présente en FEUILLE plein écran — c'est ce que
    /// l'utilisateur voyait en touchant « AUTO · … » (retour du 2026-08-21).
    /// Le catalogue est construit à l'OUVERTURE du menu, sur les MÊMES
    /// capacités que la décision affichée (Rivière grisée avec sa vraie raison).
    private var notch: some View {
        Menu {
            LentilleModeMenu(
                model: LentilleModeMenuModel.build(capabilities: capabilities, currentPreference: preference),
                onSelect: onSelectPreference
            )
        } label: {
            notchChip(notchText)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel(notchText)
    }

    /// Le chip d'encoche — partagé par le mode (haut-droite) et la catégorie
    /// (haut-gauche) : « exactement comme le mode ».
    private func notchChip(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
            .foregroundColor(accent)
            .lineLimit(1)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule(style: .continuous)
                    .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(accent.opacity(LentilleMetrics.Avatar.ringOpacity), lineWidth: 1)
            )
            .contentShape(Capsule(style: .continuous))
    }

    // MARK: - Encoche CATÉGORIE (haut-gauche, 2026-08-21)
    // `categoryNotch` a vécu ici jusqu'au 2026-08-22 : une 4e porte vers
    // « Déplacer vers… », en capsule permanente au coin haut-gauche — visible
    // même sans catégorie, où elle affichait le mot générique « CATÉGORIE »
    // bordé d'accent. Retirée : l'action a déjà TROIS domiciles (menu
    // contextuel de la rangée, panneau d'overlay, glisser-déposer sur les
    // chips de section).

    // MARK: - Étiquettes en chips sur le bord BAS (2026-08-21)

    /// Fond = couleur de l'étiquette ; CONTOUR = l'anneau de la carte (même
    /// accent, même épaisseur) : la chip suit le contour de la magnificence.
    private var tagChips: some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(conversation.tags.prefix(LentilleMetrics.Tags.maxCount)) { tag in
                tagChip(tag)
            }
            if conversation.tags.count > LentilleMetrics.Tags.maxCount {
                Text("+\(conversation.tags.count - LentilleMetrics.Tags.maxCount)")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.chipFontSize, weight: LentilleMetrics.ModeNotch.weight))
                    .foregroundColor(textMuted)
            }
        }
    }

    /// Toucher une étiquette : filtrer la liste sur elle (ou RETIRER le
    /// filtre si c'est elle qui filtre), ou la supprimer de la conversation.
    private func tagChip(_ tag: MeeshyConversationTag) -> some View {
        let isFiltering = activeTagFilter == tag.name
        return Menu {
            if isFiltering {
                Button {
                    onFilterByTag(nil)
                } label: {
                    Label(
                        String(localized: "conversations.focus.tag_clear", defaultValue: "Retirer le filtre", bundle: .main),
                        systemImage: "line.3.horizontal.decrease.circle"
                    )
                }
            } else {
                Button {
                    onFilterByTag(tag.name)
                } label: {
                    Label(
                        String(localized: "conversations.focus.tag_filter", defaultValue: "Conversations avec ce tag", bundle: .main),
                        systemImage: "line.3.horizontal.decrease.circle.fill"
                    )
                }
            }
            Button(role: .destructive) {
                onRemoveTag(tag)
            } label: {
                Label(
                    String(localized: "conversations.focus.tag_remove", defaultValue: "Supprimer ce tag", bundle: .main),
                    systemImage: "trash"
                )
            }
        } label: {
            Text(tag.name)
                .font(MeeshyFont.relative(LentilleMetrics.Tags.chipFontSize, weight: LentilleMetrics.ModeNotch.weight))
                .foregroundColor(.white)
                .lineLimit(1)
                .padding(.horizontal, LentilleMetrics.Tags.chipPaddingHorizontal)
                .padding(.vertical, LentilleMetrics.Tags.chipPaddingVertical)
                .background(Capsule(style: .continuous).fill(Color(hex: tag.color)))
                // L'élément le MOINS important portait le trait le plus fort
                // de la carte : contour d'accent PLEIN, doublé quand il
                // filtre. Le contour d'accent redevient l'exclusivité de
                // l'anneau de la carte et de l'encoche de mode ; le filtre
                // actif se dit par l'épaisseur d'un liseré BLANC, dans le
                // vocabulaire de la pastille elle-même.
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(
                            Color.white.opacity(isFiltering ? 0.95 : 0),
                            lineWidth: LentilleMetrics.FocusCard.ringSize
                        )
                )
                .contentShape(Capsule(style: .continuous))
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel(tag.name)
    }
}

// MARK: - Hôte — élection + préférence + SUIVI DU DÉFILEMENT

/// Pose la carte sur la rangée élue et la fait SUIVRE à chaque tick.
///
/// Abonné au MÊME relais que l'hôte d'élection (`ScrollOffsetRelay`, un seul
/// détecteur de défilement — contrat LWS-6) : à chaque tick il relit le `midY`
/// vivant de l'élu dans le registre inerte (`LentilleFocusCandidateRegistry`,
/// écrit par les rangées elles-mêmes) et repositionne la carte. Le contenu de
/// la carte est `Equatable` : seul `.position` change d'un tick à l'autre.
///
/// L'élu (un id) n'est résolu en `Conversation` qu'au CHANGEMENT d'élu, via
/// `conversationById` — jamais un `first { }` par tick, jamais un aplatissement
/// de la liste par passe de body (H15).
struct LentilleFocusCardHost: View {

    /// Le magasin de l'élu — GELÉ, I-070. Publié au changement d'élu seulement.
    @ObservedObject var election: LentilleFocusElection
    /// Le relais EXISTANT : un tick = une reposition. C'est tout ce que le
    /// défilement re-rend ici (une `.position`).
    @ObservedObject var relay: ScrollOffsetRelay
    /// Le registre de positions — GELÉ, I-069/I-070. Boîte inerte, jamais
    /// observée : lue au tick, jamais cause d'un tick.
    let registry: LentilleFocusCandidateRegistry
    /// Résolution de l'élu en données d'affichage — appelée au changement
    /// d'élu, jamais par tick.
    let conversationById: (String) -> Conversation?
    let isAnonymous: Bool
    let preferredContentLanguages: [String]
    var preferenceStore: ReadingModePreferenceStoring = LentilleReadingModePreferenceCenter.shared
    /// Catégories + filtre d'étiquette + actions (2026-08-21) — passés par
    /// la liste, qui possède le VM ; la carte reste une vue pure.
    var categories: [ConversationSection] = []
    var activeTagFilter: String? = nil
    var onMoveToSection: (_ conversationId: String, _ sectionId: String) -> Void = { _, _ in }
    var onFilterByTag: (String?) -> Void = { _ in }
    var onRemoveTag: (_ conversation: Conversation, _ tag: MeeshyConversationTag) -> Void = { _, _ in }
    /// Présence de l'élu, relue à chaque tick (lecture de dictionnaire).
    var presenceFor: (Conversation) -> PresenceState? = { _ in nil }
    /// Appui sur l'icône de synchronisation de la carte.
    var onForceSync: (Conversation) -> Void = { _ in }
    /// Appui sur l'effectif de la carte ⇒ participants.
    var onShowParticipants: (Conversation) -> Void = { _ in }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    /// Niveau de scène : la carte n'existe que pendant le défilement et
    /// `restDelay` après (directive user 2026-08-21) — son opacité EST le
    /// niveau, animé par `LentilleSceneActivity`.
    @EnvironmentObject private var scene: LentilleSceneActivity
    @State private var preference: ReadingModeOrchestrator.ReadingModePreference = .auto
    @State private var unsubscribe: (() -> Void)?
    @State private var elected: Conversation?

    private var isDark: Bool { colorScheme == .dark }

    /// Ordonnée LOCALE de la carte : le `midY` global vivant de l'élu, ramené
    /// dans le repère de l'hôte. `nil` quand la rangée n'est plus montée
    /// (sortie d'écran) — la carte disparaît au lieu de flotter dans le vide.
    nonisolated static func localY(rowMidY: CGFloat?, hostMinY: CGFloat) -> CGFloat? {
        rowMidY.map { $0 - hostMinY }
    }

    var body: some View {
        GeometryReader { geo in
            // `relay.offset` est lu pour que ce body soit réévalué au tick ;
            // la position elle-même vient du registre (le `midY` vivant).
            let _ = relay.offset
            if let conversation = elected,
               let y = Self.localY(rowMidY: registry.midYById[conversation.id], hostMinY: geo.frame(in: .global).minY) {
                LentilleFocusCard(
                    conversation: conversation,
                    preference: preference,
                    decision: LentilleReadingModeContext.decision(
                        for: conversation,
                        preference: preference,
                        isAnonymous: isAnonymous,
                        // Monté UNIQUEMENT derrière `LentilleFeatureFlag
                        // .isLentilleListEnabled` : le drapeau est déjà VRAI ici.
                        isLentilleFlagEnabled: true
                    ),
                    capabilities: LentilleReadingModeContext.capabilities(
                        for: conversation, isAnonymous: isAnonymous, isLentilleFlagEnabled: true
                    ),
                    preferredContentLanguages: preferredContentLanguages,
                    isDark: isDark,
                    reduceMotion: reduceMotion,
                    onSelectPreference: { selected in
                        LentilleModeMenuActions.select(selected, conversationId: conversation.id, store: preferenceStore)
                    },
                    categories: categories,
                    activeTagFilter: activeTagFilter,
                    onMoveToSection: { sectionId in onMoveToSection(conversation.id, sectionId) },
                    onFilterByTag: onFilterByTag,
                    onRemoveTag: { tag in onRemoveTag(conversation, tag) },
                    onForceSync: { onForceSync(conversation) },
                    onShowParticipants: { onShowParticipants(conversation) },
                    presenceState: presenceFor(conversation)
                )
                .equatable()
                .frame(
                    width: geo.size.width - 2 * LentilleMetrics.Row.marginHorizontal,
                    height: LentilleMetrics.FocusCard.height
                )
                .position(x: geo.size.width / 2, y: y)
                .opacity(scene.level)
                .allowsHitTesting(scene.level > 0)
            }
        }
        .adaptiveOnChange(of: election.electedId, initial: true) { _, newId in
            elected = newId.flatMap(conversationById)
            resubscribe(to: newId)
        }
        .onDisappear { unsubscribe?() }
    }

    // MARK: - Abonnement à la préférence (M-048) — la SEULE lecture/écriture

    /// Recharge la préférence de l'élu courant et s'abonne à ses
    /// changements : le sous-menu et l'aperçu (I-072) écrivent dans le MÊME
    /// magasin (`LentilleReadingModePreferenceCenter.shared`), et l'encoche
    /// doit refléter un changement fait ailleurs sans attendre une nouvelle
    /// élection.
    private func resubscribe(to conversationId: String?) {
        unsubscribe?()
        unsubscribe = nil
        guard let conversationId else { return }
        Task { @MainActor in
            preference = await preferenceStore.get(conversationId: conversationId)
        }
        unsubscribe = preferenceStore.onChange { changedId, value in
            guard changedId == conversationId else { return }
            Task { @MainActor in preference = value }
        }
    }
}
