import SwiftUI
import MeeshySDK

// MARK: - Modèle — pur, testable sans vue (contrat LWS-8/I-072)

/// Le catalogue de modes tel qu'affiché au menu : Auto 🪄 / Focal / Script /
/// Résumé / Rivière — dans cet ORDRE, toujours les cinq entrées (Rivière
/// TOUJOURS présente, contrairement aux quatre autres qui suivent
/// `capabilities.availableModes`, la borne réelle de l'orchestrateur).
///
/// Pur, `nonisolated`, dérivé de `ReadingModeOrchestrator.resolveCapabilities`
/// (miroir GELÉ) — jamais une seconde loi d'éligibilité écrite ici.
///
/// @see tasks/lentille-implementation-contract.md LWS-8
/// @see tasks/lentille-workshop-execution.md I-072
nonisolated struct LentilleModeMenuModel: Equatable {

    /// Icône d'une entrée — Auto porte l'emoji 🪄 du contrat (« Auto 🪄 »),
    /// les quatre autres un symbole SF (aucune des deux formes n'est
    /// prescrite par le contrat au-delà d'Auto ; choix de composition local
    /// à cette vue, pas une cote normative).
    nonisolated enum Icon: Equatable {
        case system(String)
        case emoji(String)
    }

    nonisolated struct Entry: Equatable, Identifiable {
        let id: ReadingModeOrchestrator.ReadingModePreference
        let title: String
        let icon: Icon
        let isSelected: Bool
        let isDisabled: Bool
        /// Non-`nil` UNIQUEMENT pour Rivière : sa raison réelle, composée
        /// depuis les seuils VIVANTS de `resolveCapabilities`, jamais un
        /// texte statique (contrat LWS-8, critère « jamais un placeholder »).
        let disabledReason: String?
    }

    let entries: [Entry]

    /// `.auto` → `nil` : Auto n'est pas un mode figé, c'est ce qui RÉSOUT
    /// vers un mode (`decision.mode`) — il n'a donc pas de place dans
    /// `capabilities.availableModes`, qui ne catalogue que les modes RENDUS.
    private static func renderedMode(
        for preference: ReadingModeOrchestrator.ReadingModePreference
    ) -> ReadingModeOrchestrator.ConversationReadingMode? {
        switch preference {
        case .auto: return nil
        case .focal: return .focal
        case .script: return .script
        case .resume: return .summary
        case .riviere: return .river
        }
    }

    private static func icon(for preference: ReadingModeOrchestrator.ReadingModePreference) -> Icon {
        switch preference {
        case .auto: return .emoji("🪄")
        case .focal: return .system("viewfinder")
        case .script: return .system("text.alignleft")
        case .resume: return .system("sparkles")
        case .riviere: return .system("water.waves")
        }
    }

    /// Construit le catalogue affiché — même entrée pour l'encoche, le
    /// sous-menu natif et l'aperçu (I-072, « trois points d'entrée, une
    /// préférence »).
    static func build(
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        currentPreference: ReadingModeOrchestrator.ReadingModePreference
    ) -> LentilleModeMenuModel {
        let order: [ReadingModeOrchestrator.ReadingModePreference] = [.auto, .focal, .script, .resume, .riviere]
        let entries = order.map { preference -> Entry in
            let isRiviere = preference == .riviere
            let isDisabled: Bool
            if isRiviere {
                // Rivière : TOUJOURS grisée en V3 — le drapeau `riviere_mode`
                // n'existe pas encore (amendement R, R-133 hors périmètre).
                // Ne PAS dériver ce booléen de `capabilities.availableModes` :
                // même si ce catalogue venait un jour à contenir `.river`
                // (LWS-8 seul ne le pose jamais, `isRiverFlagEnabled` valant
                // toujours `false` dans `LentilleReadingModeContext`), cette
                // entrée reste grisée par contrat jusqu'à R-133.
                isDisabled = true
            } else if let mode = renderedMode(for: preference) {
                isDisabled = !capabilities.availableModes.contains(mode)
            } else {
                // `.auto` : toujours sélectionnable — l'orchestrateur a
                // toujours un repli (`.focal`, jamais clampé lui-même).
                isDisabled = false
            }

            return Entry(
                id: preference,
                title: LentilleModeLabels.menuTitle(for: preference),
                icon: icon(for: preference),
                isSelected: currentPreference == preference,
                isDisabled: isDisabled,
                disabledReason: isRiviere ? LentilleModeLabels.riverReason(capabilities.riverEligibilityReason) : nil
            )
        }
        return LentilleModeMenuModel(entries: entries)
    }
}

// MARK: - Écriture — store M-048, optimiste (canal serveur : V5)

/// Point d'écriture UNIQUE des trois entrées (encoche, sous-menu, aperçu) —
/// toutes passent par ici pour finir dans le MÊME magasin
/// (`LentilleReadingModePreferenceCenter.shared`). Revenir sur `.auto`
/// réengage l'orchestrateur : aucun traitement spécial n'est nécessaire, la
/// loi (`resolveOrchestratorDecision`) traite déjà `.auto` comme « rendre la
/// main aux branches numériques ».
nonisolated enum LentilleModeMenuActions {
    static func select(
        _ preference: ReadingModeOrchestrator.ReadingModePreference,
        conversationId: String,
        store: ReadingModePreferenceStoring = LentilleReadingModePreferenceCenter.shared
    ) {
        Task {
            await store.set(conversationId: conversationId, value: preference, optimistic: true)
        }
    }
}

// MARK: - Vue — le contenu du menu, réutilisable dans un `Menu{}` natif OU un popover

/// La LISTE de boutons du menu de mode — PAS un `Menu` elle-même : elle se
/// compose aussi bien dans un `Menu { LentilleModeMenu(...) } label: { … }`
/// natif (sous-menu contextuel, `+Overlays.swift`) que dans un popover/sheet
/// (encoche de la carte, aperçu) — les trois points d'entrée du contrat.
///
/// `Button(.plain)` — jamais `.onTapGesture` (règle dure du workshop, et
/// SEULE forme qu'un `Menu`/`.contextMenu` natif accepte comme item
/// actionnable de toute façon).
struct LentilleModeMenu: View {
    let model: LentilleModeMenuModel
    let onSelect: (ReadingModeOrchestrator.ReadingModePreference) -> Void

    var body: some View {
        ForEach(model.entries) { entry in
            Button {
                onSelect(entry.id)
            } label: {
                entryLabel(entry)
            }
            .buttonStyle(.plain)
            .disabled(entry.isDisabled)
            .accessibilityLabel(accessibilityLabel(for: entry))
        }
    }

    @ViewBuilder
    private func entryLabel(_ entry: LentilleModeMenuModel.Entry) -> some View {
        // La raison Rivière (seuils vivants) doit rester LISIBLE même là où
        // un `Menu` natif ne rend pas de sous-titre distinct : elle voyage
        // donc DANS le titre de l'item grisé plutôt que dans un second
        // `Text`, qui ne s'afficherait pas de façon fiable dans les deux
        // contextes de montage (menu natif vs popover custom).
        //
        // Coche de sélection EMBARQUÉE dans le texte (même patron que
        // « Déplacer vers » dans `conversationContextMenu(for:)`,
        // `+Overlays.swift` : `Label("\(category.name) \u{2713}", …)`) plutôt
        // qu'une seconde `Image` sœur — un `Menu`/`.contextMenu` natif ne
        // garantit pas la mise en page d'un item à deux images.
        var title = entry.disabledReason.map { "\(entry.title) — \($0)" } ?? entry.title
        if entry.isSelected { title += " \u{2713}" }
        switch entry.icon {
        case .system(let name):
            Label(title, systemImage: name)
        case .emoji(let emoji):
            Label {
                Text(title)
            } icon: {
                Text(emoji)
            }
        }
    }

    private func accessibilityLabel(for entry: LentilleModeMenuModel.Entry) -> String {
        var parts = [entry.title]
        if let reason = entry.disabledReason { parts.append(reason) }
        if entry.isSelected {
            parts.append(String(localized: "lentille.mode.menu.selected", defaultValue: "sélectionné", bundle: .main))
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Sous-menu contextuel — deuxième point d'entrée (I-072)

/// Sous-menu « Mode de lecture », prêt à être déposé dans un `.contextMenu`
/// natif : montage UNIQUE, `conversationContextMenu(for:)`
/// (`ConversationListView+Overlays.swift`), APRÈS « Marquer lu » (contrat
/// LWS-8). N'existe QUE sur le chemin natif iOS 26+ (`nativeContextMenuView`)
/// — le fallback < iOS 26 (`ConversationContextMenuView`, overlay custom)
/// n'est pas un fichier possédé par LWS-8 (§1.4) ; le troisième point
/// d'entrée y est l'aperçu, `LentillePeekView`, pas ce sous-menu.
///
/// Charge la préférence mémorisée (M-048) à l'ouverture — `UserDefaults`
/// est synchrone en pratique (aucune latence perceptible) ; `.auto` reste
/// un défaut SÛR tant qu'elle n'est pas chargée, puisque c'est aussi le
/// défaut du store lui-même quand rien n'est mémorisé pour cette
/// conversation.
struct LentilleReadingModeSubmenu: View {
    let conversation: Conversation
    var isAnonymous: Bool = false
    var preferenceStore: ReadingModePreferenceStoring = LentilleReadingModePreferenceCenter.shared

    @State private var preference: ReadingModeOrchestrator.ReadingModePreference = .auto

    private var model: LentilleModeMenuModel {
        let capabilities = LentilleReadingModeContext.capabilities(
            for: conversation, isAnonymous: isAnonymous, isLentilleFlagEnabled: true
        )
        return LentilleModeMenuModel.build(capabilities: capabilities, currentPreference: preference)
    }

    var body: some View {
        Menu {
            LentilleModeMenu(model: model) { selected in
                LentilleModeMenuActions.select(selected, conversationId: conversation.id, store: preferenceStore)
            }
        } label: {
            Label(
                String(localized: "lentille.mode.menu.title", defaultValue: "Mode de lecture", bundle: .main),
                systemImage: "eye"
            )
        }
        .task(id: conversation.id) {
            preference = await preferenceStore.get(conversationId: conversation.id)
        }
    }
}
