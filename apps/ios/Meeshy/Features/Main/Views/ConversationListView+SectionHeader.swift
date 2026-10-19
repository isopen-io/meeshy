import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - En-tête de section

/// Le header de section — UNE seule vue logique, quelle que soit la peau :
/// le registre de frames et le `.onDrop` sont posés ICI, autour du mux, et
/// jamais dans l'une des deux branches. C'est la garde du contrat
/// (« le `.onDrop` doit rester sur la MÊME vue logique, sinon la cible de
/// drop se décale d'une section ») : un seul site de câblage, donc aucun
/// décalage possible entre la vue qui affiche la section *n* et celle qui
/// reçoit son drop.
struct ConversationListSectionHeader: View {
    let section: ConversationSection
    let conversations: [Conversation]
    let isSingleUngroupedSection: Bool
    let expandedSections: Set<String>
    let dragOriginSectionId: String?
    @Binding var dropTargetSection: String?
    let sectionFrameRegistry: SectionFrameRegistry
    let sectionPositionRegistry: LentilleSectionPositionRegistry
    let onToggleSection: (String) -> Void
    let onDropConversation: (String, [NSItemProvider]) -> Bool

    @ViewBuilder
    var body: some View {
        // Hide section header when there are no user categories (flat list)
        if ConversationListView.showsSectionHeader(sectionId: section.id, isSingleUngroupedSection: isSingleUngroupedSection) {
            headerLabel
                // Frame globale du header → registre inerte : cible de drop de la
                // chip du morph drag (l'overlay hit-teste le doigt au relâchement).
                .background(
                    GeometryReader { geo in
                        Color.clear
                            .onAppear { registerSectionFrame(section.id, geo.frame(in: .global)) }
                            .adaptiveOnChange(of: geo.frame(in: .global)) { _, frame in
                                registerSectionFrame(section.id, frame)
                            }
                    }
                )
                .onDrop(of: [.text], delegate: SectionDropDelegate(
                    sectionId: section.id,
                    acceptsDrop: ConversationListView.acceptsSectionDrop(sectionId: section.id),
                    dropTargetSection: $dropTargetSection,
                    onDrop: { onDropConversation(section.id, $0) }
                ))
                // Posé APRÈS le registre et le dépôt (contrat LWS-6) : la catégorie d'ORIGINE d'une conversation glissée, en couleur primaire.
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color(hex: MeeshyColors.brandPrimaryHex)
                            .opacity(dragOriginSectionId == section.id ? 0.22 : 0))
                        .animation(.easeOut(duration: 0.2), value: dragOriginSectionId)
                )
        }
    }

    /// Mux de peau du header — et RIEN d'autre : ni drop, ni mesure (posés par
    /// `body`). Sous drapeau OFF, `SectionHeaderView` et ses deux paddings,
    /// dans le même ordre qu'avant LWS-6.
    @ViewBuilder
    private var headerLabel: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            // Pleine largeur, sans marge latérale — et la RAISON n'est pas
            // celle qui était écrite ici. L'ancien motif (« sinon les rangs
            // réapparaissent dans les gouttières ») ne peut pas se produire :
            // la perspective ne fait que RÉTRÉCIR (`listScaleDecay = 0.04`,
            // `scale = 1 − 0.04f ≤ 1`, ancrée), et la carte de focus est bornée
            // à la même laisse (`geo.size.width - 2 * Row.marginHorizontal`) ;
            // rien n'occupe jamais ces 8 pt. Le vrai motif est la PARITÉ avec la
            // peau web, qui fait le même choix indépendamment —
            // `LentilleSticker.tsx` est `sticky top-0` pleine largeur du
            // conteneur pendant que `LentilleRow.tsx` porte
            // `marginLeft/Right: var(--lentille-list-row-margin-horizontal)`.
            // Deux implémentations concordantes = délibération, pas oubli.
            // Les cotes (10.5/800/.1em, padding 4/13) vivent dans
            // `LentilleMetrics.Sticker`, jamais ici (garde R15).
            LentilleSticker(
                title: section.name,
                isExpanded: isContentVisible,
                foldedUnread: foldedUnread,
                onToggle: sectionToggle
            )
            // D7 — DIAGNOSTIQUÉ, NON CORRIGÉ ICI : le correctif demande un
            // arbitrage produit. La respiration (`LentilleFocusBreathing`)
            // écarte les voisines de la rangée élue de ±18 pt, mais elle est
            // posée sur les RANGS SEULS (`sectionConversations`) et jamais sur
            // ce sticker : la marge de 8 pt est donc mangée et le header mord
            // la rangée précédente. Mesuré à deux frontières, deux relevés
            // indépendants : 9,6 / 8,9 puis 9,2 / 9,1 pt, et l'arithmétique
            // boucle — 18 − 8 − (88 − h)/2 = 9,6 pour h = 87,3. Ce n'est PAS
            // l'échelle : elle rétrécit autour du midY, donc elle éloigne les
            // bords de leurs voisins et ne peut mécaniquement pas mordre un
            // header.
            //
            // Poser la même loi ICI a été essayé et REJETÉ par la mesure : sur
            // un sticker ÉPINGLÉ, l'`.offset` étend le cadre d'accessibilité de
            // façon durable (h 21,3 → 39,3 pendant toute la scène, encore à
            // 3 s), ce qui rend la géométrie de l'épinglage inintelligible.
            // Les deux issues restantes amoindrissent ou déplacent un réglage
            // produit — écrêter la respiration à la marge (18 → 8, effet
            // réduit) ou porter le gap de section à 18 (densité réduite) —
            // d'où l'arbitrage.
            // Position vivante du sticker → registre inerte de la pilule (la
            // section épinglée = le sticker le plus haut). `onGeometryChange`
            // ne monte aucune vue de plus, contrairement à un `GeometryReader`.
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.frame(in: .global).minY
            } action: { minY in
                sectionPositionRegistry.register(id: section.id, minY: minY)
            }
            .onDisappear { sectionPositionRegistry.unregister(id: section.id) }
        } else {
            SectionHeaderView(
                section: section,
                count: conversations.count,
                isExpanded: expandedSections.contains(section.id),
                // "pinned" est désormais une cible de drop LIVE (drop =
                // épingler) — la surbrillance suit dropTargetSection, que le
                // chemin chip ne renseigne pour Épingles que si l'action est
                // réelle (conversation pas déjà épinglée).
                isDropTarget: dropTargetSection == section.id,
                foldedUnread: foldedUnread
            ) {
                onToggleSection(section.id)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
        }
    }

    private var isContentVisible: Bool {
        ConversationListView.isSectionContentVisible(
            sectionId: section.id,
            expandedSections: expandedSections,
            isSingleUngroupedSection: isSingleUngroupedSection
        )
    }

    /// #8694 — repliée, une section porte le compte de non-lus que ses rangs
    /// cachent ; dépliée, zéro (les rangs le portent). Même source que les
    /// pastilles des rangs, donc à jour en temps réel sans déplier.
    private var foldedUnread: Int {
        SectionFoldedUnread.count(
            unreadCounts: conversations.map(\.userState.unreadCount),
            isExpanded: isContentVisible
        )
    }

    /// `nil` ⇒ sticker non interactif (section calculée). Sinon le MÊME
    /// `toggleSection` qu'avant LWS-6 — `expandedSections`, `toggleSection` et
    /// `persistCategoryExpansion` sont consommés inchangés, un seul appelant,
    /// donc `persistCategoryExpansion` reste appelé UNE fois par pliage.
    private var sectionToggle: (() -> Void)? {
        guard ConversationListView.isSectionCollapsible(sectionId: section.id) else { return nil }
        return { onToggleSection(section.id) }
    }

    /// Le registre sert le hit-test du drop de la chip (`handleChipDrop`,
    /// +Overlays, possédé par LWS-8) : une section qui refuse le drop ne doit
    /// pas y figurer, sinon la chip la « toucherait » quand même et
    /// `ChipDropResolver` en ferait un `moveToSection` vers une catégorie
    /// fantôme. Le refus est ainsi porté par la Lentille, sans rien apprendre
    /// au résolveur de drop. Drapeau OFF : toutes les sections acceptent ⇒
    /// registre identique à celui d'aujourd'hui.
    private func registerSectionFrame(_ sectionId: String, _ frame: CGRect) {
        guard ConversationListView.acceptsSectionDrop(sectionId: sectionId) else { return }
        sectionFrameRegistry.frames[sectionId] = frame
    }
}
