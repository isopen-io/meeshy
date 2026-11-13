import SwiftUI
import MeeshySDK

// MARK: - Story Action Rail Plan
//
// Extrait de `StoryViewerView+Sidebar.swift` (seuil de découpe de 1000 lignes) :
// le plan est une règle pure, la vue du rail le consomme.

/// Plan du rail d'actions — CALCULÉ D'UN BLOC À L'ENTRÉE DU SLIDE puis FIGÉ
/// pendant toute sa lecture (même contenant toutes
/// les informations de compteur — pas des apparitions en second temps »).
///
/// Toutes les entrées proviennent du payload feed déjà en main (compteurs
/// inclus) : aucune résolution réseau n'est nécessaire pour décider du set.
/// Les VALEURS de compteurs affichées sur les boutons restent vivantes
/// (realtime), mais l'APPARTENANCE d'un bouton au rail ne change jamais en
/// cours de slide — un compteur réconcilié après coup ne fait plus surgir
/// un bouton au milieu de la lecture.
///
/// `nonisolated` : rule engine pur sans état partagé (parité
/// StoryCanvasFraming / BandStateMachine) — le target app compile en
/// defaultIsolation MainActor, sans ce modificateur le bundle de tests
/// (nonisolated) ne peut ni appeler `resolve` ni lire les propriétés
/// (exit 65 = échec de COMPILE).
nonisolated struct StoryActionRailPlan: Equatable {
    let showsReact: Bool
    let showsReply: Bool
    let showsForward: Bool
    let showsRepost: Bool
    let showsViews: Bool
    let showsExport: Bool
    let showsSound: Bool
    let showsComments: Bool
    let showsTranslations: Bool
    /// « Composer » au rail sur la story d'une AUTRE personne (#9953) — le même
    /// geste que l'entrée « Composer » du menu « … », qui reste. Sur sa propre
    /// story, le rail ne change pas.
    let showsCompose: Bool
    /// « Imager » au rail (#16332) : la baguette fait de la story une carte
    /// image, pour tout lecteur — comme l'entrée « Imager » du menu « … ».
    /// Une story encore dans la file n'a rien à rendre.
    var showsImager: Bool = false

    static func resolve(
        isOwnStory: Bool,
        canReply: Bool,
        isPublicStory: Bool,
        hasAudibleSound: Bool,
        commentCount: Int,
        hasTranslatableContent: Bool,
        canCompose: Bool = false,
        isRepublishable: Bool = true,
        isPending: Bool = false
    ) -> StoryActionRailPlan {
        guard !isPending else { return StoryActionRailPlan(showsReact: false, showsReply: false, showsForward: false, showsRepost: false,
            showsViews: false, showsExport: false, showsSound: hasAudibleSound, showsComments: false, showsTranslations: false, showsCompose: false) }
        return StoryActionRailPlan(
            showsReact: !isOwnStory,
            showsReply: !isOwnStory && canReply,
            showsForward: true,
            // D1 (arbitrage user 2026-08-19) : la republication n'est plus
            // réservée aux stories PUBLIQUES. Une story FRIENDS se republie en
            // FRIENDS ou PRIVATE, une PRIVATE en PRIVATE — c'est la LOI
            // D'AUDIENCE (`StoryRepostAudience`, miroir du serveur) qui borne
            // le choix, plus l'appartenance au rail. Gater ici sur
            // `isPublicStory` rendait la règle inatteignable : le bouton
            // n'existait pas pour les seules stories qu'elle concerne.
            showsRepost: !isOwnStory && isRepublishable,
            showsViews: isOwnStory,
            showsExport: isOwnStory,
            showsSound: hasAudibleSound,
            showsComments: commentCount > 0,
            // Les traductions ne sont PAS réservées aux lecteurs: l'auteur explore les langues de sa propre story
            // comme il choisit déjà sa langue d'export. Le Prisme est un outil
            // de lecture, pas une permission.
            showsTranslations: hasTranslatableContent,
            showsCompose: !isOwnStory && canCompose,
            showsImager: true
        )
    }

    static func isRepublishable(visibility: String?) -> Bool {
        !StoryRepostAudience.allowed(fromRawValue: visibility).isEmpty
    }
}
