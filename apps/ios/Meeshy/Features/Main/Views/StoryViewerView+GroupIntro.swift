import SwiftUI
import MeeshySDK
import MeeshyUI

extension StoryViewerView {
    /// Interstitiel d'identité inter-groupes — au-dessus du canvas ET des
    /// contrôles (identité pleine pendant ~500 ms, tap droite/double-tap =
    /// skip, tap gauche = retour au groupe précédent).
    @ViewBuilder
    var groupIntroLayer: some View {
        if showGroupIntro, let intro = groupIntro.intro {
            StoryGroupIntroOverlay(
                intro: intro,
                avatarURL: currentGroup?.avatarURL,
                avatarColor: currentGroup?.avatarColor ?? "6366F1",
                // Présence résolue AU switch (directive 2026-07-10) :
                // entrée realtime du PresenceManager si elle existe (socket,
                // la plus fraîche), sinon le snapshot serveur embarqué par
                // le payload stories (`StoryGroup.authorPresence`) — plus
                // de « Hors ligne » par défaut faute de donnée pour un
                // auteur hors contacts.
                presence: PresenceManager.shared.servedPresence(for: intro.userId, fallback: currentGroup?.authorPresence),
                // Détail « en ligne » réservé aux amis (directive user
                // 2026-07-13) : lookup O(1) synchrone, primitive Bool
                // descendue à la leaf view (règle "Zero Unnecessary
                // Re-render" — pas d'@ObservedObject sur le singleton
                // dans StoryGroupIntroOverlay).
                isFriend: FriendshipCache.shared.isFriend(intro.userId),
                onSkip: { skipGroupIntro() },
                onBack: { goBackToPreviousGroupFromIntro() },
                // Même jeton que l'overlay gestuel du canvas : il purge le
                // mouchard de déplacement de l'interlude sur les chemins où
                // SwiftUI n'a pas délivré la fin du geste.
                gestureResetToken: gestureResetToken
            )
            .transition(.opacity)
            .zIndex(30)
        }
    }
}

// MARK: - Group intro (interstitiel d'identité inter-groupes)

extension StoryViewerView {
    /// Présente l'interstitiel d'identité au CHANGEMENT de groupe (jamais à
    /// l'ouverture du viewer — directive 2026-08-20) : placeholder immédiat
    /// (username/avatar du groupe, déjà en main — cache-first), enrichi async
    /// (nom complet, bannière, mood) par `resolveGroupIntro` PENDANT
    /// l'affichage. Dismiss auto au bout de `groupIntroDuration` (500 ms
    /// nominales — le retrait, et l'apparition du slide qui l'accompagne,
    /// s'amorcent 200 ms plus tôt) ; le tap skippe. Le mode preview n'a pas
    /// d'interstitiel. Le gel de lecture passe par `shouldPauseTimer ||
    /// showGroupIntro` (timer + canvas + audio gelés en phase, reprise sans
    /// saut).
    func presentGroupIntroIfNeeded() {
        // AVANT la garde : l'interlude du groupe QUITTÉ n'a plus lieu d'être, que
        // le groupe atteint en mérite un ou non. Annulée seulement après le
        // `shouldPresent`, la Task précédente survivait à un switch vers un
        // groupe non qualifiant (mode preview, groupe sans story affichable) —
        // le voile de l'auteur précédent restait posé sur la story du nouvel
        // auteur, puis son `dismissGroupIntro()` marquait comme vue une story
        // qui n'est pas la sienne.
        groupIntro.cancelPending()
        guard let group = currentGroup,
              StoryGroupIntroPolicy.shouldPresent(
                  isPreviewMode: isPreviewMode,
                  // Groupe sans story affichable (tout vu+expiré) → aucun
                  // interstitiel d'identité à montrer.
                  hasEntryStory: Self.entryStory(of: group) != nil
              ) else {
            // Sa Task venant d'être annulée, plus personne ne retirerait le voile
            // resté affiché : on le retire ici. `revealing: false` — la story du
            // nouveau groupe est déjà à l'écran (aucune grammaire d'entrée à
            // rejouer) et c'est l'appelant qui la marquera vue (`markCurrentViewed`
            // juste après ce chemin), jamais celle de l'auteur qu'on a quitté.
            if showGroupIntro { dismissGroupIntro(revealing: false) }
            return
        }
        // Identité COMPLÈTE dès la première frame quand le groupe a été
        // pré-résolu (`prefetchNeighborGroupIntros`) ; sinon placeholder
        // immédiat (username/avatar du payload) enrichi pendant l'affichage.
        // Présentation INSTANTANÉE (pas de fade-in) : l'interstitiel OPAQUE
        // prend l'écran dans la MÊME transaction que le swap de groupe — le
        // slide du nouveau groupe n'est JAMAIS visible sous/derrière l'intro
        // (directive user 2026-07-10, IMG_0976). Seule la sortie est animée :
        // c'est elle qui révèle le slide, et elle vit dans `dismissGroupIntro`.
        groupIntro.present(
            StoryViewModel.StoryGroupIntro(userId: group.id, username: group.username),
            hold: StoryGroupIntroPolicy.holdDuration(total: Self.groupIntroDuration),
            resolve: { await viewModel.resolveGroupIntro(for: group) },
            elapsed: { dismissGroupIntro() })
        prefetchNeighborGroupIntros()
    }

    /// Pré-résout l'identité (nom, bannière, mood) des groupes ADJACENTS
    /// pendant la lecture du groupe courant — même philosophie que le
    /// prefetch média inter-groupes : au switch, l'interstitiel est complet
    /// dès la première frame, présence comprise (payload feed + realtime).
    func prefetchNeighborGroupIntros() {
        guard !isPreviewMode else { return }
        let myId = AuthManager.shared.currentUser?.id
        let neighbors = [-1, 1].map { currentGroupIndex + $0 }
            .filter { groups.indices.contains($0) }
            .map { groups[$0] }
            .filter { $0.id != myId }
        groupIntro.prefetch(neighbors) { await viewModel.resolveGroupIntro(for: $0) }
    }

    func skipGroupIntro() {
        groupIntro.cancelPending()
        dismissGroupIntro()
    }

    /// Tap zone gauche sur l'interstitiel d'identité — annule ce switch de
    /// groupe et revient au groupe précédent (directive user 2026-07-14).
    /// `currentGroupIndex` a déjà été incrémenté au moment où l'intro
    /// s'affiche (elle masque visuellement le nouveau groupe pendant
    /// `groupIntroDuration`), donc "revenir en arrière" ici signifie
    /// toujours "annule ce switch de groupe" — jamais "story précédente dans
    /// le nouveau groupe" (contrairement à `goToPrevious()`, sensible à
    /// `currentStoryIndex`). Sans groupe précédent, dismiss simplement.
    func goBackToPreviousGroupFromIntro() {
        groupIntro.cancelPending()
        dismissGroupIntro(revealing: false)
        guard currentGroupIndex > 0 else { return }
        groupTransition(forward: false) { landOnPreviousGroup() }
    }

    /// - Parameter revealing: `true` quand le retrait de l'interlude DÉVOILE la
    ///   story courante (fin du délai, tap skip) — c'est à cet instant qu'elle
    ///   devient réellement vue. `false` quand l'interlude se retire parce que
    ///   le switch de groupe est ANNULÉ (tap gauche) : la story quittée n'a
    ///   jamais été montrée, la compter gonflerait les vues de son auteur.
    private func dismissGroupIntro(revealing: Bool = true) {
        let opening = currentStory?.storyEffects?.opening
        // La sortie épouse l'ouverture configurée par l'auteur sur le slide qui
        // apparaît : l'interlude et le slide forment un seul geste visuel.
        //
        // Jusqu'au 2026-07-26 ce chemin ne faisait QUE retirer le voile : la
        // story entrante était déjà posée dessous, sans zoom, sans slide, sans
        // révélation. On arme donc ici sa grammaire d'apparition — la MÊME table
        // que `crossFadeStory` — avant de la ramener au repos dans la
        // transaction animée juste en dessous. Armement et animation dans le
        // même appel, sans le moindre `await` entre les deux : c'est ce qui rend
        // l'opération sûre à l'annulation (impossible de rester bloqué avec
        // `contentOpacity = 0`, donc un slide noir permanent).
        //
        // Uniquement quand on RÉVÈLE : si le switch de groupe est annulé (tap
        // gauche), il n'y a rien à faire apparaître — on n'arme rien du tout,
        // sinon le slide qu'on est en train de quitter jouerait son entrée juste
        // avant d'être remplacé.
        if revealing {
            let entrance = StoryOpeningEntrance.armed(for: opening)
            contentOpacity = entrance.contentOpacity
            openingScale = entrance.openingScale
            openingSlideFraction = entrance.openingSlideFraction
            textSlideOffset = entrance.textSlideOffset
            isRevealActive = entrance.isRevealActive
        }
        withAnimation(StoryGroupIntroPolicy.dismissAnimation(for: opening)) {
            groupIntro.isShown = false
            if revealing {
                contentOpacity = 1
                openingScale = 1.0
                openingSlideFraction = 0
                textSlideOffset = 0
                // `.reveal` est la seule grammaire dont l'état de repos est
                // « actif » : le cercle doit finir PLEIN écran. Pour les autres,
                // `false` est déjà l'état neutre côté `RevealCircleShape`.
                isRevealActive = (opening == .reveal)
            }
        }
        // `isIntroVisible: false` explicite : le flip ci-dessus est enveloppé
        // dans `withAnimation`, on ne dépend donc pas de l'instant où la
        // lecture de `showGroupIntro` se stabilise.
        if revealing { markCurrentViewed(isIntroVisible: false) }
    }
}
