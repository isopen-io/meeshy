import Foundation

/// Libellés des modes de lecture — source UNIQUE pour les trois surfaces qui
/// les affichent (contrat LWS-8) : l'encoche/chip de la focus card (I-071),
/// le sous-menu « Mode de lecture » et l'aperçu (I-072). Les trois DOIVENT
/// nommer un même mode de la même façon, sinon « AUTO · Focal » sur la carte
/// et « Focale » dans le menu raconteraient deux histoires différentes de la
/// même décision.
///
/// Pur, `nonisolated`, testable sans vue. Toute chaîne passe par
/// `String(localized:defaultValue:bundle:)` — même convention que le reste de
/// `Lentille/**` (`LentilleBridgeLine`, `LentilleSectionIdentity`) : Xcode
/// extrait la clé au build, la valeur par défaut s'affiche immédiatement dans
/// toute langue non encore traduite.
///
/// i18n — ré-preuve faite (mission I-072, §0) : AUCUNE clé de mode de lecture
/// n'existe côté iOS (`apps/ios/Meeshy/Localizable.xcstrings`, recherche
/// `reading.?mode|lentille\.mode|context\.mode` — zéro résultat). Les clés
/// S-005 du contrat vivent côté WEB (`apps/web/locales/*/conversations.json`)
/// et ne sont pas réutilisables ici (catalogues iOS/web disjoints). Ce
/// fichier introduit donc les clés `lentille.mode.*`, dans la continuité
/// directe des `lentille.bridge.*` / `lentille.section.*` déjà posées par
/// I-065/I-066 sur ce même modèle — PAS une invention isolée, la poursuite
/// d'un précédent déjà posé trois fois dans ce dossier.
///
/// @see tasks/lentille-implementation-contract.md LWS-8
/// @see tasks/lentille-workshop-execution.md I-071, I-072
nonisolated enum LentilleModeLabels {

    // MARK: - Nom du mode — préférence (menu, chip forcé)

    /// Titre affiché dans le menu et sur le chip forcé (encoche quand
    /// `preference != .auto`). `.auto` porte son propre libellé ("Auto"),
    /// distinct du nom de mode qu'il RÉSOUT (cf. `decisionModeTitle`).
    static func menuTitle(for preference: ReadingModeOrchestrator.ReadingModePreference) -> String {
        switch preference {
        case .auto:
            return String(localized: "lentille.mode.name.auto", defaultValue: "Auto", bundle: .main)
        case .focal:
            return String(localized: "lentille.mode.name.focal", defaultValue: "Focal", bundle: .main)
        case .script:
            return String(localized: "lentille.mode.name.script", defaultValue: "Script", bundle: .main)
        case .resume:
            return String(localized: "lentille.mode.name.resume", defaultValue: "Résumé", bundle: .main)
        case .riviere:
            return String(localized: "lentille.mode.name.riviere", defaultValue: "Rivière", bundle: .main)
        // AMENDEMENT S1 (REV-4bis/B2) — jamais affiché sur iOS : `.bulles` est
        // hors de l'ordre du menu (`LentilleModeMenu.build`, cinq entrées).
        // RÉUTILISE la clé du mode RENDU `.bubbles` (cf. `decisionModeTitle`
        // ci-dessous) plutôt que d'en créer une sixième : c'est le même mot
        // pour le lecteur, et une clé i18n neuve pour un libellé jamais rendu
        // serait une dette gratuite dans les 12 catalogues de localisation.
        case .bulles:
            return String(localized: "lentille.mode.name.bubbles", defaultValue: "Bulles", bundle: .main)
        }
    }

    // MARK: - Nom du mode — décision RENDUE (encoche « AUTO · <décision> »)

    /// Titre du mode que l'orchestrateur a RÉELLEMENT rendu
    /// (`OrchestratorDecision.mode`) — utilisé uniquement dans « AUTO · … ».
    /// `.bubbles` (drapeau désactivé) n'apparaît jamais dans la carte (elle
    /// n'existe que drapeau actif) ; le libellé défensif évite un `switch`
    /// non-exhaustif plutôt qu'un cas qu'on prétendrait inatteignable.
    static func decisionModeTitle(for mode: ReadingModeOrchestrator.ConversationReadingMode) -> String {
        switch mode {
        case .focal:
            return String(localized: "lentille.mode.name.focal", defaultValue: "Focal", bundle: .main)
        case .script:
            return String(localized: "lentille.mode.name.script", defaultValue: "Script", bundle: .main)
        case .summary:
            return String(localized: "lentille.mode.name.resume", defaultValue: "Résumé", bundle: .main)
        case .river:
            return String(localized: "lentille.mode.name.riviere", defaultValue: "Rivière", bundle: .main)
        case .bubbles:
            return String(localized: "lentille.mode.name.bubbles", defaultValue: "Bulles", bundle: .main)
        }
    }

    // MARK: - Texte de l'encoche

    /// « AUTO · <décision> » quand la préférence est `.auto` (l'utilisateur
    /// voit ce qui VA se passer, contrat LWS-8) ; le nom du mode forcé SEUL
    /// quand un mode est mémorisé (M-048) — c'est alors un CHIP, pas une
    /// prévision.
    static func notchText(
        decision: ReadingModeOrchestrator.OrchestratorDecision,
        preference: ReadingModeOrchestrator.ReadingModePreference
    ) -> String {
        guard preference == .auto else {
            return menuTitle(for: preference)
        }
        let format = String(localized: "lentille.mode.notch.auto", defaultValue: "AUTO · %@", bundle: .main)
        return String(format: format, decisionModeTitle(for: decision.mode))
    }

    // MARK: - Raison Rivière — seuils VIVANTS, jamais un texte fixe

    /// Trois formes, jamais une seule formule (AMENDEMENT S1, REV-3/B3) —
    /// composées depuis `RiverEligibilityReason` (miroir gelé), jamais une
    /// chaîne statique : `threshold`, `current` et `riverReason` viennent de
    /// `resolveCapabilities`, appelée avec les données RÉELLES de la
    /// conversation à chaque rendu.
    ///
    /// 1. `.neverEligible` (conversation `direct`) ⇒ « jamais en conversation
    ///    directe ». L'ancienne formule unique promettait « s'ouvrira à 5
    ///    personnes actives — N aujourd'hui » à un duo qui n'atteindra JAMAIS
    ///    5 : une porte annoncée qui n'existe pas.
    /// 2. Compte INCONNU (`current == nil`) ⇒ le seuil SEUL, « s'ouvrira à 5
    ///    personnes actives ». Aucun « 0 aujourd'hui » fabriqué : le compte
    ///    d'actifs par conversation n'est pas encore une donnée client (G-123).
    /// 3. Compte connu ⇒ la formule à deux nombres, INCHANGÉE.
    ///
    /// `.eligible` retombe sur la même branche numérique que
    /// `.belowThreshold` : en V3 l'entrée Rivière reste grisée même jugée
    /// éligible (drapeau `riviere_mode` absent, R-133), et sa raison affichée
    /// est alors la même formule vivante qu'avant l'amendement.
    static func riverReason(_ reason: ReadingModeOrchestrator.RiverEligibilityReason) -> String {
        if reason.riverReason == .neverEligible {
            return String(
                localized: "lentille.mode.river.never",
                defaultValue: "jamais en conversation directe",
                bundle: .main
            )
        }

        guard let current = reason.current else {
            let thresholdOnly = String(
                localized: "lentille.mode.river.threshold_only",
                defaultValue: "s'ouvrira à %d personnes actives",
                bundle: .main
            )
            return String(format: thresholdOnly, reason.threshold)
        }

        let format = String(
            localized: "lentille.mode.river.reason",
            defaultValue: "s'ouvrira à %d personnes actives — %d aujourd'hui",
            bundle: .main
        )
        return String(format: format, reason.threshold, current)
    }
}
