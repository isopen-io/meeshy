import SwiftUI
import MeeshySDK

// MARK: - Les lois pures de la conversation (mesure du composeur, chrome au défilement, mode de lecture)
//
// Extraites de `ConversationView.swift` (cohésion) : chaque règle ne lit que
// ses entrées, donc elle se vérifie sans instancier la vue ni une fenêtre
// (doctrine `StoryViewerView.entryStory(of:now:)`). `ConversationView` et ses
// témoins les appellent ici, sans façade : une loi a UNE adresse.

enum ConversationViewRules {

    /// Hauteur cible du composer, ou `nil` quand il ne faut PAS toucher à
    /// `composerHeight`.
    ///
    /// La safe area n'est ajoutée que si le clavier est absent : quand le clavier
    /// est visible la safe area bottom passe à 0 et le `GeometryReader` fire à
    /// chaque frame d'animation, ce qui bouclerait la hauteur sur elle-même.
    ///
    /// `static` + inset injecté : la règle est vérifiable sans instancier la View
    /// ni une fenêtre (doctrine `StoryViewerView.entryStory(of:now:)`).
    static func resolvedComposerHeight(
        contentHeight: CGFloat,
        keyboardHeight: CGFloat,
        safeAreaBottom: CGFloat
    ) -> CGFloat? {
        guard keyboardHeight == 0 else { return nil }
        return contentHeight + safeAreaBottom
    }

    /// Ancrage vertical du bouton « redescendre en bas ».
    ///
    /// Le bouton était posé sur `composerHeight`, qui grandit d'une ligne à
    /// chaque retour à la ligne du champ de saisie : écrire un message faisait
    /// donc REMONTER le bouton sous le doigt, et ce déplacement se lisait comme
    /// un retour au bas de la conversation alors que l'utilisateur était en
    /// train de relire son historique.
    ///
    /// Pendant la rédaction, l'ancrage reste donc celui d'avant la première
    /// frappe. Il se réaligne dès que le champ redevient vide — à l'envoi, ou
    /// quand l'utilisateur efface — c'est-à-dire aux seuls moments où plus
    /// aucune position de lecture n'est en jeu. Les autres causes de
    /// redimensionnement du composer (ouverture des options, barre de réponse)
    /// continuent de le déplacer : elles ne sont pas « écrire ».
    static func resolvedScrollButtonAnchor(
        current: CGFloat,
        composerHeight: CGFloat,
        isComposing: Bool
    ) -> CGFloat {
        isComposing ? current : composerHeight
    }

    /// Loi commune (`ScrollMotion`) : une vue en mouvement ne montre pas ses
    /// boutons d'action. Pendant le défilement de la liste, les boutons
    /// d'appel et de recherche s'effacent ; le header lui-même — retour,
    /// avatar, titre — reste lisible, et la pill de jour vit dans sa propre
    /// bande sous lui (`MessageDayStickyPlacement.topOffset`).
    ///
    /// Une recherche ouverte échappe à la règle : sa barre est un champ de
    /// SAISIE, pas un bouton, et doit rester joignable pendant qu'on fait
    /// défiler les résultats.
    static func hidesHeaderActions(isScrollingList: Bool, isSearchOpen: Bool) -> Bool {
        isScrollingList && !isSearchOpen
    }

    /// **En rangée plate (Script), c'est le header ENTIER qui s'efface** —
    /// retour, avatar, titre, recherche, appel et bascule de vue compris —
    /// là où le mode bulles n'efface que sa grappe de boutons d'action.
    ///
    /// La raison est le mode lui-même : la lecture plate met le fil au
    /// centre ; garder au-dessus une barre d'outils concurrente pendant
    /// qu'on lit contredit l'intention.
    ///
    /// **Toujours une porte de sortie** : le header revient dès l'ARRÊT du
    /// défilement (ce n'est pas un masquage permanent), et le geste de retour
    /// natif iOS reste actif en toutes circonstances. Une recherche ouverte
    /// échappe à la règle, comme pour les boutons d'action — sa barre est un
    /// champ de saisie qui doit rester joignable pendant qu'on fait défiler
    /// les résultats.
    static func hidesEntireHeader(
        usesFlatRow: Bool,
        isScrollingList: Bool,
        isSearchOpen: Bool
    ) -> Bool {
        usesFlatRow && hidesHeaderActions(isScrollingList: isScrollingList, isSearchOpen: isSearchOpen)
    }

    /// **En rangée plate (Script), le défilement escamote TOUT le chrome** —
    /// composeur et bouton de retour au bas compris, en plus du header
    /// (`hidesEntireHeader`) et de la pilule de jour (côté hôte,
    /// `MessageDayStickyState.isSuppressed`). Le fil occupe l'écran entier le
    /// temps du mouvement ; tout revient dès la pose.
    ///
    /// Une saisie ACTIVE échappe à la règle : panneau emoji ouvert ou
    /// suggestions de mention affichées, le composeur est l'outil en main —
    /// on ne retire pas l'outil en main. Pur `opacity` : aucun inset ne
    /// bouge, donc aucune re-mise à l'échelle du fil.
    static func hidesComposerChrome(
        usesFlatRow: Bool,
        isScrollingList: Bool,
        isSearchOpen: Bool,
        isEmojiPanelOpen: Bool,
        hasMentionSuggestions: Bool
    ) -> Bool {
        hidesEntireHeader(
            usesFlatRow: usesFlatRow,
            isScrollingList: isScrollingList,
            isSearchOpen: isSearchOpen
        )
            && !isEmojiPanelOpen
            && !hasMentionSuggestions
    }

    /// Type SDK → type que la loi de lecture distingue (`direct`, `group`,
    /// `public`, `global`, `broadcast`). `community`, `channel` et `bot` sont
    /// des conversations multi-parties comme `.group` — jamais `.direct`, la
    /// seule distinction qui compte pour `resolveCapabilities` (éligibilité
    /// Rivière : « jamais en direct »).
    /// `nil` (aucune conversation) ⇒ `.group`, cohérent avec `isDirect`
    /// (calculée plus haut), qui traite déjà un `conversation` nil comme
    /// « pas direct ».
    /// `internal` (pas `private`) : lu directement par
    /// `ConversationViewReadingModeInitTests` (`@testable import Meeshy`).
    static func readingModeConversationType(
        for sdkType: MeeshyConversation.ConversationType?
    ) -> ReadingModeOrchestrator.ConversationType {
        switch sdkType {
        case .direct: return .direct
        case .group, .community, .channel, .bot, nil: return .group
        case .public: return .public
        case .global: return .global
        case .broadcast: return .broadcast
        }
    }

    /// Language priority (Prisme Linguistique): the user's primary configured
    /// content language is the source of truth and wins the compose default.
    /// The active keyboard layout is only a FALLBACK — used for anonymous users
    /// or unsupported content languages. It must NEVER override the in-app
    /// preference, the same way `deviceLocale` ranks last in language
    /// resolution.
    ///
    /// Locale.current is likewise NOT consulted: it reflects the device's UI
    /// language, decoupled from the chosen content language. A French-speaker
    /// on an English keyboard / English iPhone composes in French; live
    /// detection corrects in-flight if they actually type another language.
    static func defaultComposeLanguage(
        preferredContentLanguage: String?,
        keyboardPrimaryLanguage: String?,
        supportedCodes: Set<String>
    ) -> String? {
        if let preferredContentLanguage, supportedCodes.contains(preferredContentLanguage) {
            return preferredContentLanguage
        }
        guard let keyboardPrimaryLanguage else { return nil }
        let code = String(keyboardPrimaryLanguage.prefix(2))
        return supportedCodes.contains(code) ? code : nil
    }

    /// Les sections de conversation par identifiant. `ConversationSection.allSections`
    /// est un tableau : on en tient un dictionnaire, construit UNE fois.
    static func section(withId id: String) -> ConversationSection? { sectionLookup[id] }

    private static let sectionLookup: [String: ConversationSection] =
        Dictionary(uniqueKeysWithValues: ConversationSection.allSections.map { ($0.id, $0) })
}
