import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Magnification EN PLACE : le contexte + ses trois affordances
//
// Directive produit 2026-08-23 (second message) :
// - « mettre à jour la rangée cible avec des données et un style adéquats afin
//   qu'elle hérite des features du mode normal » ⇒ la magnification n'est plus
//   une VUE CONCURRENTE de la rangée : c'est `LentilleConversationRow`
//   elle-même, à qui l'on passe ce contexte. Anneau story, badge mood,
//   pastille de présence, saisie en cours, brouillon, appel en cours,
//   glyphe d'outbox, ❤️ favori, sourdine, épingle, barre de sélection iPad :
//   tout ce que la rangée sait faire, la magnification le sait, par
//   construction et non par recopie.
// - « le pill de mode de lecture se met exactement où il est actuellement,
//   avec la chip du nombre d'utilisateurs qui doit être ACTIONNABLE (ouvrir la
//   liste des participants) » ⇒ `LentilleModePill` + `LentilleMemberCountChip`,
//   sur la ligne basse.
// - « la catégorie ACTIONNABLE (pour changer de catégorie) est au-dessus du
//   titre à gauche, avant le listing ; à la suite, les tags si disponibles »
//   ⇒ `LentilleMagnifiedTopLine`, montée AU-DESSUS de la ligne de titre.
//
// Ces vues vivent dans `Lentille/Mode/` et non dans `Lentille/Row/` : elles
// lisent le magasin de préférence de mode (`LentilleReadingModePreferenceCenter`)
// et portent des menus d'action. `Lentille/Row/` reste une peau sans magasin.

/// Ce que la rangée doit savoir EN PLUS pour se rendre magnifiée. `nil` sur
/// une rangée au repos : aucune de ces vues n'est alors instanciée.
///
/// Les fermetures ne participent pas au `==` de la rangée (elles changent
/// d'identité à chaque passe de body de la liste) ; les DONNÉES qui décident
/// du rendu — `activeTagFilter`, les catégories, l'anonymat — y participent.
struct LentilleMagnification {
    var isAnonymous: Bool = true
    var categories: [ConversationSection] = []
    var activeTagFilter: String? = nil
    var onMoveToSection: (String) -> Void = { _ in }
    var onFilterByTag: (String?) -> Void = { _ in }
    var onRemoveTag: (MeeshyConversationTag) -> Void = { _ in }
    var onShowParticipants: () -> Void = {}
    /// Horloge de la date complète (injectée par les tests).
    var now: Date = Date()

    /// Ce qui décide du RENDU — comparé par le portillon `.equatable()` de la
    /// rangée. Les fermetures en sont exclues à dessein : comparées, elles
    /// feraient rater le portillon à chaque passe.
    static func rendersIdentically(_ lhs: LentilleMagnification?, _ rhs: LentilleMagnification?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil): return true
        case let (l?, r?):
            return l.isAnonymous == r.isAnonymous
                && l.activeTagFilter == r.activeTagFilter
                && l.categories == r.categories
        default: return false
        }
    }
}

// MARK: - Ligne du HAUT — catégorie puis étiquettes

/// Au-dessus du titre, à gauche : la catégorie d'abord (actionnable — elle
/// ouvre la liste des catégories pour DÉPLACER la conversation), puis les
/// étiquettes nommées.
///
/// Au repos, la rangée ne dit ni l'une ni l'autre : la catégorie n'est portée
/// que par l'en-tête de section, et les étiquettes ne sont que des points
/// colorés de 6 px. La magnification les NOMME — c'est du surplus
/// d'information au sens strict.
struct LentilleMagnifiedTopLine: View {

    let conversation: Conversation
    let magnification: LentilleMagnification
    let isDark: Bool

    private var accent: Color { Color(hex: conversation.accentColor) }

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            LentilleCategoryPill(
                conversation: conversation,
                categories: magnification.categories,
                accent: accent,
                onMoveToSection: magnification.onMoveToSection
            )

            ForEach(conversation.tags.prefix(LentilleMetrics.Tags.maxCount)) { tag in
                LentilleTagChip(
                    tag: tag,
                    isFiltering: magnification.activeTagFilter == tag.name,
                    onFilterByTag: magnification.onFilterByTag,
                    onRemoveTag: magnification.onRemoveTag
                )
            }

            if conversation.tags.count > LentilleMetrics.Tags.maxCount {
                Text("+\(conversation.tags.count - LentilleMetrics.Tags.maxCount)")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.chipFontSize, weight: LentilleMetrics.ModeNotch.weight))
                    .foregroundColor(MeeshyColors.textMuted(isDark: isDark))
                    .allowsHitTesting(false)
            }

            Spacer(minLength: 0)
        }
    }
}

// MARK: - Catégorie (actionnable)

/// « Déplacer vers… » — la QUATRIÈME porte de cette action (menu contextuel de
/// la rangée, panneau d'overlay, glisser-déposer sur les chips de section
/// étant les trois autres). Elle a vécu au coin haut-gauche de l'ancienne
/// carte jusqu'au 2026-08-22, où elle a été retirée comme « capsule
/// permanente de plus » ; la directive du 2026-08-23 la rappelle explicitement
/// et lui donne sa place définitive : au-dessus du titre, à gauche.
///
/// Sans catégorie, la pastille dit « Classer » plutôt que le mot générique
/// « CATÉGORIE » qui avait motivé son retrait — elle nomme l'action, pas un
/// vide.
struct LentilleCategoryPill: View {

    let conversation: Conversation
    let categories: [ConversationSection]
    let accent: Color
    var onMoveToSection: (String) -> Void = { _ in }

    private var currentSection: ConversationSection? {
        guard let id = conversation.userState.sectionId else { return nil }
        return categories.first { $0.id == id }
    }

    private var label: String {
        currentSection?.name
            ?? String(localized: "lentille.magnified.category.none", defaultValue: "Classer", bundle: .main)
    }

    private var tint: Color {
        currentSection.map { Color(hex: $0.color) } ?? accent
    }

    var body: some View {
        Menu {
            ForEach(categories) { section in
                Button {
                    onMoveToSection(section.id)
                } label: {
                    Label(section.name, systemImage: section.icon)
                }
            }
            if conversation.userState.sectionId != nil {
                Divider()
                Button(role: .destructive) {
                    onMoveToSection("")
                } label: {
                    Label(
                        String(localized: "lentille.magnified.category.clear", defaultValue: "Retirer de la catégorie", bundle: .main),
                        systemImage: "folder.badge.minus"
                    )
                }
            }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: currentSection?.icon ?? "folder.badge.plus")
                    .imageScale(.small)
                Text(label)
                    .lineLimit(1)
            }
            .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
            .foregroundColor(tint)
            .padding(.horizontal, LentilleMetrics.Tags.chipPaddingHorizontal)
            .padding(.vertical, LentilleMetrics.Tags.chipPaddingVertical)
            .background(Capsule(style: .continuous).fill(tint.opacity(LentilleMetrics.Tags.bubbleFillOpacity)))
            .contentShape(Capsule(style: .continuous))
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Étiquette nommée (actionnable)

/// Toucher une étiquette : filtrer la liste sur elle (ou RETIRER le filtre si
/// c'est elle qui filtre), ou la supprimer de la conversation. Ce menu est le
/// SEUL écrivain de `ConversationListViewModel.activeTagFilter` dans toute
/// l'app — le retirer ne serait pas alléger, ce serait supprimer la fonction.
struct LentilleTagChip: View {

    let tag: MeeshyConversationTag
    let isFiltering: Bool
    var onFilterByTag: (String?) -> Void = { _ in }
    var onRemoveTag: (MeeshyConversationTag) -> Void = { _ in }

    var body: some View {
        Menu {
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
                // Le filtre actif se dit par un liseré BLANC, dans le
                // vocabulaire de la pastille elle-même — jamais un contour
                // d'accent, qui ferait de l'élément le moins important le
                // trait le plus fort de la rangée.
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

// MARK: - Pastille de MODE DE LECTURE (actionnable) — première des deux portes

/// « AUTO · Focal », « Script »… — même texte que le menu et l'aperçu
/// (`LentilleModeLabels`, source unique), même magasin de préférence que le
/// fil ouvert (`LentilleReadingModePreferenceCenter`, M-048).
///
/// Elle porte son propre `@State` de préférence, chargé à l'apparition et
/// tenu à jour par l'abonnement du magasin : UNE seule rangée est magnifiée à
/// la fois, donc au plus une lecture de `UserDefaults` par élection — jamais
/// une par rangée de la liste.
///
/// `Menu` SYSTÈME (Liquid Glass sur iOS 26), jamais un `.popover` : sur iPhone
/// un popover se présente en FEUILLE plein écran (retour du 2026-08-21).
struct LentilleModePill: View {

    let conversation: Conversation
    let isAnonymous: Bool
    let isDark: Bool
    var preferenceStore: ReadingModePreferenceStoring = LentilleReadingModePreferenceCenter.shared

    @State private var preference: ReadingModeOrchestrator.ReadingModePreference = .auto
    @State private var unsubscribe: (() -> Void)?

    private var accent: Color { Color(hex: conversation.accentColor) }

    private var capabilities: ReadingModeOrchestrator.ReadingModeCapabilities {
        LentilleReadingModeContext.capabilities(
            for: conversation, isAnonymous: isAnonymous, isLentilleFlagEnabled: true
        )
    }

    private var decision: ReadingModeOrchestrator.OrchestratorDecision {
        LentilleReadingModeContext.decision(
            for: conversation,
            preference: preference,
            isAnonymous: isAnonymous,
            // Monté UNIQUEMENT derrière `LentilleFeatureFlag.isLentilleListEnabled` :
            // le drapeau est déjà VRAI ici.
            isLentilleFlagEnabled: true
        )
    }

    private var label: String {
        LentilleModeLabels.notchText(
            decision: decision,
            preference: preference,
            suggestedMode: conversation.bridge?.suggestedMode
        )
    }

    var body: some View {
        Menu {
            LentilleModeMenu(
                model: LentilleModeMenuModel.build(capabilities: capabilities, currentPreference: preference),
                onSelect: { selected in
                    LentilleModeMenuActions.select(selected, conversationId: conversation.id, store: preferenceStore)
                }
            )
        } label: {
            Text(label)
                .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
                .foregroundColor(accent)
                .lineLimit(1)
                .padding(.horizontal, LentilleMetrics.Tags.chipPaddingHorizontal)
                .padding(.vertical, LentilleMetrics.Tags.chipPaddingVertical)
                .background(Capsule(style: .continuous).fill(accent.opacity(LentilleMetrics.Tags.bubbleFillOpacity)))
                .contentShape(Capsule(style: .continuous))
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .task(id: conversation.id) {
            preference = await preferenceStore.get(conversationId: conversation.id)
        }
        .onAppear { resubscribe() }
        .onDisappear {
            unsubscribe?()
            unsubscribe = nil
        }
    }

    /// Le sous-menu « Mode de lecture » de l'appui long écrit dans le MÊME
    /// magasin : la pastille doit refléter un choix fait ailleurs sans
    /// attendre une nouvelle élection.
    private func resubscribe() {
        unsubscribe?()
        let conversationId = conversation.id
        unsubscribe = preferenceStore.onChange { changedId, value in
            guard changedId == conversationId else { return }
            Task { @MainActor in preference = value }
        }
    }
}

// MARK: - Effectif (actionnable) — ouvre la liste des participants

/// L'effectif n'existe NULLE PART ailleurs dans la liste : la rangée au repos
/// ne le porte pas (« enlever l'effectif sur les rows non magnifiées »,
/// 2026-08-22). C'est donc du surplus au sens strict — et, depuis la directive
/// du 2026-08-23, un CONTRÔLE : il ouvre la feuille des participants.
///
/// `Button` en style `.plain` (jamais `.onTapGesture`, qui se ferait avaler
/// par l'appui long du conteneur — régression #3010 WS-4).
struct LentilleMemberCountChip: View {

    let conversation: Conversation
    var onShowParticipants: () -> Void = {}

    private var accent: Color { Color(hex: conversation.accentColor) }

    private static func icon(for type: MeeshyConversation.ConversationType) -> String {
        switch type {
        case .group: return "person.2.fill"
        case .community: return "person.3.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "sparkles"
        case .public, .global, .broadcast: return "globe"
        case .direct: return "person.fill"
        }
    }

    var body: some View {
        Button(action: onShowParticipants) {
            HStack(spacing: 3) {
                Image(systemName: Self.icon(for: conversation.type))
                    .imageScale(.small)
                if conversation.memberCount > 1 {
                    Text(conversation.memberCountDisplay)
                }
            }
            .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
            .foregroundColor(accent)
            .padding(.horizontal, LentilleMetrics.Tags.chipPaddingHorizontal)
            .padding(.vertical, LentilleMetrics.Tags.chipPaddingVertical)
            .background(Capsule(style: .continuous).fill(accent.opacity(LentilleMetrics.Tags.bubbleFillOpacity)))
            .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(
            localized: "lentille.magnified.participants",
            defaultValue: "Participants",
            bundle: .main
        ))
        .accessibilityValue(conversation.memberCountDisplay)
    }
}

// MARK: - Le portillon d'élection — QUI est magnifié, et quand

/// Enveloppe MINUSCULE autour de la rangée : elle seule s'abonne à l'élection
/// et à la scène, et décide si CETTE rangée est la rangée élue.
///
/// C'est le point de conception qui rend la magnification en place tenable
/// (§H15 du contrat, « jamais un aplatissement de la liste par passe de
/// body ») :
///
/// - `LentilleFocusElection.electedId` n'est publié qu'au CHANGEMENT d'élu,
///   jamais par tick de défilement.
/// - `LentilleSceneActivity.level` n'est publié que DEUX fois par session de
///   défilement (entrée, aplatissement) — l'animation qui les relie est
///   interpolée par SwiftUI, sans nouvelle publication.
///
/// Une publication ré-évalue donc le `body` de cette enveloppe pour chaque
/// rangée montée — un `==` de chaînes, rien de plus — et le portillon
/// `.equatable()` de `LentilleConversationRow` ne laisse re-construire que les
/// DEUX rangées dont la magnification a réellement changé : l'ancienne élue et
/// la nouvelle.
///
/// La fabrique est typée `(LentilleMagnification?) -> LentilleConversationRow`
/// — un type CONCRET, jamais un paramètre générique ni un `AnyView` : la
/// famille de crashs « type-metadata » de cette liste (voir l'en-tête de
/// `ConversationListView+Rows.swift`) vient précisément des types de rangée
/// regonflés par des génériques.
struct LentilleMagnifiableRow: View {

    @ObservedObject var election: LentilleFocusElection
    @ObservedObject var scene: LentilleSceneActivity
    let conversationId: String
    let magnification: LentilleMagnification
    let row: (LentilleMagnification?) -> LentilleConversationRow

    /// La magnification n'existe que PENDANT la scène — « le cadre apparaît
    /// quand on scrolle, au repos il disparaît » (directive 2026-08-21, tenue
    /// telle quelle). Au repos, la rangée élue redevient une rangée comme les
    /// autres.
    private var isMagnified: Bool {
        scene.level > 0 && election.electedId == conversationId
    }

    var body: some View {
        row(isMagnified ? magnification : nil)
            .equatable()
            .animation(.easeInOut(duration: FocalMetrics.Scene.enterDuration), value: isMagnified)
    }
}
