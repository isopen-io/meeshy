import Foundation
import MeeshySDK

/// Le classement de la liste — groupement par section et ordre total des
/// rangées — extrait de `ConversationListViewModel.swift` (hors budget) pour
/// que #10347 puisse y poser World Wide en tête sans grossir l'hôte.
extension ConversationListViewModel {

    /// Groupe les conversations par section et les trie
    /// - Peut s'exécuter sur n'importe quel thread (pas d'accès à self)
    ///
    /// Greffe LWS-5 (contrat `tasks/lentille-implementation-contract.md` §LWS-5,
    /// E6) : drapeau OFF ⇒ branche legacy INCHANGÉE (`legacyGroupConversations`,
    /// vérifiée bit-à-bit par `LentilleGroupingGraftTests`). Drapeau ON ⇒ le
    /// classement/tri passe par le miroir `LentilleSectionResolver`
    /// (`Lentille/Core/LentilleSectionResolver.swift`, GELÉ S1). Signature,
    /// `nonisolated`, staticité : inchangées — c'est le seul point de greffe
    /// (§4.4 du contrat). Le drapeau entre en paramètre (lu par défaut) pour que
    /// les deux branches s'éprouvent sans écrire dans `UserDefaults.standard`.
    ///
    /// World Wide se pose AU-DESSUS des deux branches (#10347) : elle sort du
    /// corpus avant le groupement et le précède, sans qu'aucune des deux peaux
    /// n'ait à la connaître.
    nonisolated static func groupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection],
        draftSummaries: [String: DraftSummary],
        lentilleEnabled: Bool = LentilleFeatureFlag.isLentilleListEnabled
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        let (head, rest) = ConversationListWorldHead.split(filtered)
        let sections = lentilleEnabled
            ? lentilleGroupConversations(rest, categories: categories)
            : legacyGroupConversations(rest, categories: categories, draftSummaries: draftSummaries)
        return ConversationListWorldHead.prepending(head, to: sections)
    }

    /// Comportement D'AUJOURD'HUI, verbatim — seul appelant sous drapeau OFF.
    /// Ne JAMAIS modifier cette fonction pour faire passer un test Lentille :
    /// c'est la ligne de base que la greffe promet de ne pas bouger.
    nonisolated private static func legacyGroupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection],
        draftSummaries: [String: DraftSummary]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        // No categories → flat list, no section headers needed
        let hasPinned = filtered.contains { $0.userState.isPinned && $0.userState.sectionId == nil }
        if categories.isEmpty && !hasPinned {
            let sorted = filtered.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }
            return sorted.isEmpty ? [] : [(ConversationSection.other, sorted)]
        }

        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        // O(1) lookup sets
        let categoryIds = Set(categories.map(\.id))

        // Groupement O(n) unique — remplace les k passes filter O(n×k)
        let bySection = Dictionary(grouping: filtered) { conv -> String in
            if conv.userState.isPinned && conv.userState.sectionId == nil { return "__pinned__" }
            return conv.userState.sectionId ?? "__other__"
        }

        // Pinned section
        if let pinned = bySection["__pinned__"], !pinned.isEmpty {
            result.append((ConversationSection.pinned, pinned.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }))
        }

        // User categories (order preserved)
        for category in categories {
            if let sectionConvs = bySection[category.id], !sectionConvs.isEmpty {
                let sorted = sectionConvs.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }
                result.append((category, sorted))
            }
        }

        // Orphaned (catégorie supprimée) + non-catégorisées → section "other"
        let otherConvs = (bySection["__other__"] ?? []) + filtered.filter { conv in
            guard let sid = conv.userState.sectionId else { return false }
            return !categoryIds.contains(sid)
        }
        if !otherConvs.isEmpty {
            result.append((ConversationSection.other, otherConvs.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }))
        }

        return result
    }

    /// Drapeau ON — classement/tri délégués au miroir `LentilleSectionResolver`
    /// (loi E5/E6 : pinned → live → catégories utilisateur → temporel).
    ///
    /// Un écart assumé et documenté, pas un oubli : `liveCall` est TOUJOURS
    /// `nil` — aucune plateforme (contrat §0, E13) ne porte encore de modèle
    /// d'appel en direct sur `Conversation`, la section `.live` du résolveur
    /// est donc structurellement vide ici. Elle est néanmoins TRADUITE (et non
    /// ignorée) : le jour où le modèle d'appel arrive, cette fonction n'a rien
    /// à apprendre.
    ///
    /// **Levée de l'écart I-060** (décision LWS-6/I-062, propriétaire du
    /// conteneur) : les buckets `.live` et `.temporal` repliaient
    /// provisoirement sur `.other` faute d'identité `MeeshyConversationSection`
    /// (SDK gelé S1). Ils ont désormais la leur —
    /// `LentilleSectionIdentity.live` / `.section(for:)`, construite depuis
    /// l'initialiseur public du type SDK, sans toucher au paquet gelé — et
    /// chaque section du résolveur est rendue TELLE QUELLE, dans son ordre
    /// (`pinned` → `live` → catégories → today → yesterday → thisWeek →
    /// older). Le repli disparaît : plus aucune conversation temporelle ne se
    /// déguise en « Mes conversations ». La partition reste un recouvrement
    /// exact de `filtered` (garanti par `LentilleSectionResolver`, vérifié par
    /// `SectionResolverVectorTests`).
    nonisolated private static func lentilleGroupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        var byId: [String: Conversation] = [:]
        byId.reserveCapacity(filtered.count)

        let sectionable: [LentilleSectionResolver.SectionableConversation] = filtered.map { conversation in
            byId[conversation.id] = conversation
            return LentilleSectionResolver.SectionableConversation(
                id: conversation.id,
                isPinned: conversation.userState.isPinned && conversation.userState.sectionId == nil,
                categoryId: conversation.userState.sectionId,
                orderInCategory: conversation.userState.orderInCategory.map { Double($0) },
                lastMessageAt: conversation.listActivityAt,
                updatedAt: conversation.updatedAt,
                liveCall: nil
            )
        }
        let sectionableCategories = categories.map { LentilleSectionResolver.SectionableCategory(id: $0.id) }

        let resolved = LentilleSectionResolver.resolveSections(
            conversations: sectionable,
            categories: sectionableCategories,
            now: Date(),
            timeZone: .current
        )

        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        for section in resolved {
            switch section {
            case .pinned(let conversations):
                result.append((ConversationSection.pinned, conversations.compactMap { byId[$0.id] }))
            case .category(let categoryId, let conversations):
                guard let category = categories.first(where: { $0.id == categoryId }) else { continue }
                result.append((category, conversations.compactMap { byId[$0.id] }))
            case .live(let conversations):
                result.append((LentilleSectionIdentity.live, conversations.compactMap { byId[$0.id] }))
            case .temporal(let kind, let conversations):
                result.append((LentilleSectionIdentity.section(for: kind), conversations.compactMap { byId[$0.id] }))
            }
        }

        return result
    }

    /// Ordre total de la liste de conversations. Épinglées d'abord ; parmi les
    /// non-épinglées, les conversations avec un brouillon actif flottent en
    /// tête (brouillon le plus récemment édité d'abord) ; le reste retombe sur
    /// `listActivityAt` décroissant (une réaction à MON message compte, #7548).
    /// Les épinglées aussi — la priorité brouillon ne s'applique qu'aux
    /// non-épinglées.
    nonisolated static func conversationsAreInOrder(
        _ a: Conversation,
        _ b: Conversation,
        draftSummaries: [String: DraftSummary]
    ) -> Bool {
        if a.userState.isPinned != b.userState.isPinned { return a.userState.isPinned }
        if a.userState.isPinned && b.userState.isPinned { return a.listActivityAt > b.listActivityAt }
        let aHasDraft = draftSummaries[a.id] != nil
        let bHasDraft = draftSummaries[b.id] != nil
        if aHasDraft != bHasDraft { return aHasDraft }
        if let aDraft = draftSummaries[a.id], let bDraft = draftSummaries[b.id] {
            return aDraft.updatedAt > bDraft.updatedAt
        }
        return a.listActivityAt > b.listActivityAt
    }
}
