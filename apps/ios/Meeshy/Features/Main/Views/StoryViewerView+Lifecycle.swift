import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - Cycle de vie du lecteur
//
// L'entrée et la sortie du lecteur — ce qui s'arme à l'apparition, ce qui se
// relâche à la disparition — et le saut des slides illisibles. Le fichier
// principal garde le MONTAGE (`.onAppear { viewerDidAppear() }`) ; les
// changements d'index, eux, restent à côté de leurs gestionnaires.

extension StoryViewerView {

    /// Arme le lecteur à l'apparition : fenêtre de préchargement, horloge,
    /// première vue comptée, interlude voisin, réaction d'entrée de notification.
    func viewerDidAppear() {
        if initialStoryIndex > 0, currentGroupIndex < groups.count {
            currentStoryIndex = min(initialStoryIndex, groups[currentGroupIndex].stories.count - 1)
        } else if startAtFirstUnviewed, currentGroupIndex < groups.count,
                  let firstUnviewed = groups[currentGroupIndex].stories.firstIndex(where: { !$0.isViewed }) {
            // Toucher le profil → afficher directement la première story non vue.
            currentStoryIndex = firstUnviewed
        }
        // A5 — skip past stories whose 24h visibility window has elapsed.
        // Cache TTL > 24h is intentional (avoid redownloading avatars)
        // but the *content* must not be rendered once expired. If no
        // non-expired story remains in the current group, dismiss.
        skipUnplayableStoriesIfNeeded()
        StoryMediaCoordinator.shared.activate {
            // No-op : ne PAS forcer `isGlobalMuted = true` ici. Cette
            // closure est invoquée par `PlaybackCoordinator` chaque fois
            // qu'un autre `StoppablePlayer` claim le canal audio — y
            // compris l'`audioMixer` interne à la story elle-même
            // (cf. `StoryCanvasUIView.startAudioPlayback` →
            // `willStartPlaying(external: audioMixer)` qui sweep tous
            // les externals sauf lui-même → arrête `StoryMediaCoordinator`
            // → invoque ce closure). Le résultat était que le viewer
            // s'ouvrait toujours en muted parce que le canvas lui-même
            // déclenchait le stop handler dès le premier `startAudioPlayback`.
            //
            // L'état `isGlobalMuted` doit rester un choix utilisateur. Si
            // une vraie interruption externe arrive (appel iOS, autre app
            // qui prend le canal), `AVAudioSession` s'occupera de
            // l'interruption au niveau système, et le canvas réagira via
            // `observeAudioSessionEvents` (interruption began/ended). Pas
            // besoin de basculer la UI mute pour ça.
        }
        installPrefetchPipelineIfNeeded()
        startTimer()
        prefetchCurrentGroup()
        // PAS d'interlude à l'ouverture du viewer (directive user
        // 2026-08-20 : « l'interlude s'affiche UNIQUEMENT lorsqu'on lit
        // les groupes à la suite, non à la première ouverture ») — la
        // story demandée s'affiche immédiatement, l'interstitiel ne vit
        // que dans `adaptiveOnChange(of: currentGroupIndex)`. Sans
        // interlude, `markCurrentViewed` marque tout de suite (sa garde
        // `showGroupIntro` ne bloque que les switches de groupe).
        markCurrentViewed()
        // Pré-résolution des identités voisines dès l'ouverture : le
        // premier switch de groupe présente un interstitiel déjà complet.
        prefetchNeighborGroupIntros()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
            appear = StoryViewerAppearance(scale: 1.0, cornerRadius: 0)
        }
        triggerInitialActionIfNeeded()
        engagement.holdPostRoom(of: currentStory)
        if let story = currentStory {
            EngagementTracker.shared.begin(postId: story.id, contentType: .story, surface: .storyViewer)
        }
    }

    /// Relâche tout ce que l'apparition a armé : horloge, geste en cours,
    /// préchargement, lecteurs, salle de publication, session d'engagement.
    func viewerWillDisappear() {
        // `invalidate()` (et non `reset()`) : coupe le CADisplayLink 60 Hz
        // et libère les callbacks qui capturent l'état du viewer. Le
        // pipeline est ré-installé au prochain onAppear
        // (`hasInstalledPrefetchPipeline = false` ci-dessous).
        slideTimer.invalidate()
        // Purge l'état gestuel transient : le lecteur peut être quitté au
        // beau milieu d'un drag (dismiss, background, navigation externe) et
        // le `onEnded` du recognizer ne viendra jamais. Sans ça, `gestureAxis`
        // survivait à la vue et la réouverture démarrait avec un axe déjà
        // décidé, court-circuitant tap et long-press.
        resetGestureTracking()
        groupIntroTask?.cancel()
        delays.cancelAll()
        groupIntroTask = nil
        prefetchTasks.forEach { $0.cancel() }
        prefetchTasks.removeAll()
        prefetcher.detach()
        hasInstalledPrefetchPipeline = false
        StoryMediaCoordinator.shared.deactivate()
        // RC4.5 — cut the reader audio engine on exit. `ReaderAudioMixer`
        // is a registered external player, so `stopAll()` reaches it
        // without the viewer needing a direct reference.
        PlaybackCoordinator.shared.stopAll()
        engagement.holdPostRoom(of: nil)
        if let story = currentStory {
            // Relâche la déclaration de contenu actif — conditionnelle à
            // l'identité pour rester correcte si un autre écran a déjà
            // déclaré le sien entre-temps.
            NotificationToastManager.shared.onPostClosed(story.id)
        }
        Task { await EngagementTracker.shared.end(surface: .storyViewer) }
    }

    /// Avance la lecture au-delà des slides qu'on ne peut pas donner à voir.
    ///
    /// Deux cas, arbitrés par `StoryPlaybackSkipResolver` :
    /// - **expirée** — le TTL du cache dépasse volontairement la fenêtre de
    ///   24 h (pour ne pas re-télécharger avatars et métadonnées à froid), donc
    ///   le lecteur reçoit des stories que le GC serveur a déjà supprimées. On
    ///   filtre ICI et non au niveau du tray : l'anneau de l'auteur doit rester
    ///   visible pour la continuité, mais afficher une story expirée renverrait
    ///   404 sur les réactions ;
    /// - **vide** — sans média, sans texte, sans audio : un écran noir pendant
    ///   toute la durée de slide (cf. `StoryContentPresence`).
    ///
    /// Le saut est FORWARD only, et un groupe entièrement illisible fait passer
    /// au groupe suivant qui a du contenu — la fermeture du lecteur n'arrive
    /// qu'une fois la liste épuisée. L'auteur, lui, garde l'accès à ses propres
    /// stories pour y lire réactions et commentaires.
    func skipUnplayableStoriesIfNeeded() {
        let outcome = StoryPlaybackSkipResolver.resolve(
            groups: groups,
            groupIndex: currentGroupIndex,
            storyIndex: currentStoryIndex,
            currentUserId: AuthManager.shared.currentUser?.id,
            now: Date()
        )
        switch outcome {
        case .stay:
            return
        case .advanceStory(let index):
            currentStoryIndex = index
        case .advanceGroup(let groupIndex, let storyIndex):
            // Saut correctif, pas une navigation utilisateur : on pose les
            // index directement plutôt que de passer par `groupTransition`.
            // L'`adaptiveOnChange(of: currentGroupIndex)` qui suit rejoue
            // `skipUnplayableStoriesIfNeeded` — le résolveur ne renvoie que des
            // groupes ayant du contenu, donc il répondra `.stay` et la
            // récursion s'arrête au premier tour. L'interlude d'identité du
            // nouvel auteur s'affiche normalement via ce même onChange.
            currentGroupIndex = groupIndex
            currentStoryIndex = storyIndex
        case .close:
            isPresented = false
        }
    }
}
