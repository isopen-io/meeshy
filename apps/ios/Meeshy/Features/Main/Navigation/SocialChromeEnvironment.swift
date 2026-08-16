import SwiftUI
import MeeshyUI

// MARK: - Social Chrome Environment
//
// L'humeur d'un auteur, son anneau de story et le handler de tap-humeur étaient
// lus au fond de la feuille de commentaires via `@EnvironmentObject`
// (`StatusViewModel`, `StoryViewModel`). Une feuille N'HÉRITE PAS des
// EnvironmentObject de la vue qui la présente — elle hérite des EnvironmentValues
// (même piège que `meeshyPanelDismiss`, cf. `PanelBackAction.swift`, et que les
// crashes `SharePickerView` / `UserProfileSheet` déjà documentés). Sous macOS,
// où la feuille est hébergée hors de la hiérarchie du présentateur, la lecture
// de l'objet absent faisait trapper `EnvironmentObject.wrappedValue` (SIGTRAP).
//
// L'accès étant PARESSEUX — il vit dans le `ForEach` des commentaires — le crash
// ne survenait pas à l'ouverture d'une feuille vide, mais à l'insertion de la
// première ligne : c'est-à-dire à l'ENVOI d'un commentaire.
//
// Ces résolveurs transitent donc par `EnvironmentValues`. Ils sont hérités par
// toutes les feuilles sur toutes les plateformes, et valent `nil` par défaut :
// l'absence DÉGRADE (pas d'humeur, pas d'anneau), elle ne trappe jamais.

private struct MeeshyMoodEmojiResolverKey: EnvironmentKey {
    static let defaultValue: ((String) -> String?)? = nil
}

private struct MeeshyStoryRingResolverKey: EnvironmentKey {
    static let defaultValue: ((String) -> StoryRingState)? = nil
}

private struct MeeshyMoodTapResolverKey: EnvironmentKey {
    static let defaultValue: ((String) -> ((CGPoint) -> Void)?)? = nil
}

private struct MeeshyStoryViewerPresentKey: EnvironmentKey {
    static let defaultValue: ((StoryViewerRequest) -> Void)? = nil
}

extension EnvironmentValues {
    /// Emoji d'humeur d'un utilisateur, ou `nil` s'il n'en a pas / si le
    /// résolveur n'est pas posé (hors hiérarchie applicative, previews, tests).
    var meeshyMoodEmojiResolver: ((String) -> String?)? {
        get { self[MeeshyMoodEmojiResolverKey.self] }
        set { self[MeeshyMoodEmojiResolverKey.self] = newValue }
    }

    /// État de l'anneau de story d'un utilisateur. `nil` ⇒ pas d'anneau.
    var meeshyStoryRingResolver: ((String) -> StoryRingState)? {
        get { self[MeeshyStoryRingResolverKey.self] }
        set { self[MeeshyStoryRingResolverKey.self] = newValue }
    }

    /// Handler de tap sur la pastille d'humeur d'un utilisateur. `nil` ⇒ la
    /// pastille n'est pas interactive.
    var meeshyMoodTapResolver: ((String) -> ((CGPoint) -> Void)?)? {
        get { self[MeeshyMoodTapResolverKey.self] }
        set { self[MeeshyMoodTapResolverKey.self] = newValue }
    }

    /// Ouvre le lecteur de stories. `nil` ⇒ l'action est indisponible (l'avatar
    /// ne route pas vers la story) — jamais un crash.
    var meeshyStoryViewerPresent: ((StoryViewerRequest) -> Void)? {
        get { self[MeeshyStoryViewerPresentKey.self] }
        set { self[MeeshyStoryViewerPresentKey.self] = newValue }
    }
}

extension View {
    /// Pose les résolveurs de chrome social en une passe. À appeler UNE fois par
    /// racine (`RootView`, `iPadRootView`), à côté des `.environmentObject(...)`
    /// — pas dans les feuilles, qui en héritent.
    func meeshySocialChrome(
        status: StatusViewModel,
        story: StoryViewModel,
        storyViewer: StoryViewerCoordinator
    ) -> some View {
        self
            .environment(\.meeshyMoodEmojiResolver, { status.statusForUser(userId: $0)?.moodEmoji })
            .environment(\.meeshyStoryRingResolver, { story.storyRingState(forUserId: $0) })
            .environment(\.meeshyMoodTapResolver, { status.moodTapHandler(for: $0) })
            .environment(\.meeshyStoryViewerPresent, { storyViewer.present($0) })
    }
}
