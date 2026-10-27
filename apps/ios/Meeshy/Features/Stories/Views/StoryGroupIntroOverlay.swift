import SwiftUI
import MeeshySDK
import MeeshyUI

/// Interstitiel plein écran de l'interlude inter-groupes. Le RENDU d'identité
/// (bannière, voile, avatar/nom/présence/mood) est délégué à
/// `StoryAuthorIdentityCard` — vue partagée avec `NeighborGroupCubeFace`, la
/// face entrante du cube qui révèle ce même interlude AU DOIGT pendant le swipe
/// (directive user 2026-07-25). Cet overlay ne possède plus que ce qui lui est
/// propre : la base opaque, les gestes (double-tap = skip, tap gauche = retour
/// au groupe précédent) et le résumé VoiceOver.
struct StoryGroupIntroOverlay: View {
    let intro: StoryViewModel.StoryGroupIntro
    let avatarURL: String?
    let avatarColor: String
    let presence: UserPresence?
    /// `true` quand l'auteur du groupe est un ami — gate le détail de
    /// présence (« En ligne » / « Actif·ve récemment » / « Absent·e ») dans
    /// `presenceBadge`. Directive user 2026-07-13 : le statut « en ligne »
    /// est une information réservée aux amis, pas affichée pour un auteur
    /// hors contacts.
    let isFriend: Bool
    /// Tap zone droite / double-tap n'importe où — passe directement au
    /// premier slide du nouveau groupe (dismiss immédiat, révèle le slide
    /// déjà courant).
    let onSkip: () -> Void
    /// Tap zone gauche — annule ce switch de groupe, retourne au groupe
    /// précédent (directive user 2026-07-14).
    let onBack: () -> Void
    /// Jeton de purge partagé avec `StoryGestureOverlayView` — bumpé par le
    /// viewer sur les chemins gestuels non nominaux. Sert ici de FILET au
    /// mouchard `didMoveDuringTouch`, qui est collant par construction.
    let gestureResetToken: Int

    /// `true` dès que le doigt a franchi `tapSlopPixels` pendant le toucher en
    /// cours. Le drag du lecteur (`unifiedDragGesture`) couvre désormais cet
    /// interlude — swipes actifs pendant l'écran d'identité — et il est monté en
    /// `simultaneousGesture` sur un ancêtre, donc nos `SpatialTapGesture`, qui se
    /// valident au touch-up QUEL QUE SOIT le déplacement, tireraient AUSSI sur un
    /// swipe : l'utilisateur changerait de groupe et sauterait l'interlude d'un
    /// seul geste. Ce drapeau réserve les taps aux touchers immobiles.
    ///
    /// COLLANT pour toute la durée du toucher, comme le `didExceedSlop` du
    /// lecteur : franchi une fois = franchi pour tout le toucher. Un swipe avorté
    /// (le doigt part à 100 pt puis revient à son origine avant de lever) ne doit
    /// pas se requalifier en tap et sauter l'interlude au moment précis où
    /// l'utilisateur annulait son geste. Il n'est remis à `false` QU'À
    /// L'OUVERTURE d'un nouveau toucher (cf. `trackedTouchOrigin`) ou par les
    /// filets de purge ci-dessous — jamais au relâchement, sous peine de
    /// rouvrir le double-déclenchement (le drag peut conclure AVANT les
    /// `SpatialTapGesture`, qui trouveraient alors le drapeau déjà nettoyé).
    @State private var didMoveDuringTouch: Bool = false

    /// Origine (`startLocation`) du toucher auquel `didMoveDuringTouch` se
    /// rapporte. Elle est FIXE pour toute la durée d'un toucher et distincte
    /// d'un toucher à l'autre : c'est le seul marqueur d'identité de toucher
    /// disponible dans un `DragGesture`.
    ///
    /// POURQUOI : la remise à zéro reposait sur le premier tick à translation
    /// STRICTEMENT nulle. Ce tick n'est pas garanti (événements coalescés d'un
    /// flick très rapide, recognizer reconstruit) ; sans lui, le drapeau restait
    /// collé à `true` et le toucher SUIVANT était avalé — tap de skip ou de
    /// retour-groupe silencieusement inerte pendant tout l'interlude. Comparer
    /// l'origine détecte le nouveau toucher même quand son premier tick porte
    /// déjà du déplacement.
    @State private var trackedTouchOrigin: CGPoint? = nil

    /// Tolérance de tap, alignée sur le `dragSlopPixels` de
    /// `StoryGestureOverlayView` : un même geste doit basculer de « tap » à
    /// « swipe » au même endroit sur les deux surfaces du lecteur.
    private let tapSlopPixels: CGFloat = 14

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Base OPAQUE obligatoire (directive 2026-07-10) : pendant que la
                // bannière charge, CachedAsyncImage peut rendre un placeholder
                // translucide — sans cette base, le slide et son chrome restaient
                // visibles SOUS l'interstitiel (IMG_0976). L'intro est un ÉCRAN,
                // pas un voile.
                Color.black
                StoryAuthorIdentityCard(
                    intro: intro,
                    avatarURL: avatarURL,
                    avatarColor: avatarColor,
                    presence: presence,
                    isFriend: isFriend
                )
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .contentShape(Rectangle())
            // Double-tap (n'importe où) prioritaire sur le tap simple — sinon le
            // simple tirerait toujours en premier et le double-tap ne fire jamais
            // (pattern standard SwiftUI : `.exclusively(before:)` sur deux
            // `SpatialTapGesture` de count différent, résolu via l'énum `Either`).
            // Les deux branches sont gardées par `didMoveDuringTouch` : le sens
            // reste identique au pixel près (moitié gauche = onBack, moitié
            // droite = onSkip, double tap = onSkip), seul le toucher QUI A BOUGÉ
            // est rendu au drag parent au lieu d'être compté deux fois.
            //
            // ORDRE DES DEUX MODIFICATEURS — les taps d'ABORD, le mouchard
            // ENSUITE : le dernier appliqué est l'ANCÊTRE des précédents, et un
            // `.gesture()` d'ancêtre est de priorité INFÉRIEURE à tout geste de
            // son sous-arbre (constat qui a déjà tué les swipes du lecteur, cf.
            // StoryViewerView+Canvas). Dans l'ordre inverse, le mouchard —
            // `DragGesture(minimumDistance: 0)` qui reconnaît dès le touch-down —
            // subordonnait les taps : soit ils devenaient inertes (plus de skip
            // ni de retour au groupe précédent), soit c'est le mouchard qui était
            // privé d'événements et `didMoveDuringTouch` restait faux, laissant
            // un swipe commiter tap ET changement de groupe. On reproduit donc
            // l'arrangement retenu au niveau du lecteur : recognizer de taps dans
            // le sous-arbre, `simultaneousGesture` du drag sur l'ancêtre.
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { _ in
                        guard !didMoveDuringTouch else { return }
                        onSkip()
                    }
                    .exclusively(before: SpatialTapGesture(count: 1)
                        .onEnded { value in
                            guard !didMoveDuringTouch else { return }
                            if value.location.x < geo.size.width / 2 {
                                onBack()
                            } else {
                                onSkip()
                            }
                        })
            )
            // Mouchard de déplacement. `SpatialTapGesture.Value` n'expose que
            // `location` : impossible d'y lire la distance parcourue, il faut la
            // mesurer soi-même. Ce `DragGesture(minimumDistance: 0)` reconnaît
            // dès le touch-down : c'est à l'OUVERTURE d'un toucher, et nulle part
            // ailleurs, qu'on repart d'un état propre — surtout pas au
            // relâchement, qui peut précéder les `SpatialTapGesture` et rouvrirait
            // le double-déclenchement (swipe comptant AUSSI comme tap).
            //
            // L'ouverture est reconnue à l'ORIGINE du toucher (`startLocation`,
            // fixe pour un toucher donné) et plus seulement au tick à translation
            // nulle : ce tick-là peut manquer (événements coalescés, recognizer
            // reconstruit), et le drapeau restait alors collé d'un toucher au
            // suivant, avalant un tap de skip ou de retour-groupe.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { value in
                        if trackedTouchOrigin != value.startLocation {
                            trackedTouchOrigin = value.startLocation
                            didMoveDuringTouch = false
                        }
                        if value.translation == .zero { return }
                        let moved = max(abs(value.translation.width),
                                        abs(value.translation.height))
                        // COLLANT, comme le `didExceedSlop` du lecteur : un swipe
                        // avorté (le doigt part à 100 pt puis revient à l'origine
                        // avant de lever) ne doit PAS redevenir un tap — sinon
                        // l'utilisateur saute l'interlude ou annule son switch de
                        // groupe au moment même où il annulait son geste.
                        if moved > tapSlopPixels { didMoveDuringTouch = true }
                    }
            )
        }
        .ignoresSafeArea()
        // FILETS DE PURGE DU MOUCHARD — deux signaux extérieurs au geste, parce
        // que le drapeau est collant par conception et que sa remise à zéro ne
        // peut pas vivre dans un `.onEnded` du mouchard (le drag conclut parfois
        // AVANT les `SpatialTapGesture` : purger là annulerait la garde et
        // ferait recommiter tap + swipe sur un même geste).
        //
        // 1. Apparition de l'interlude : chaque `showGroupIntro` qui repasse à
        //    `true` remonte cette vue avec un mouchard neuf, y compris si un
        //    toucher inachevé traînait sur l'interlude précédent.
        .onAppear { didMoveDuringTouch = false }
        // 2. Jeton de purge du viewer, bumpé sur les chemins gestuels non
        //    nominaux (snap-back d'axe indécis, transition de groupe, sortie du
        //    lecteur) — exactement les cas où SwiftUI n'a délivré aucune fin de
        //    geste et où un drapeau collé survivrait au toucher.
        .adaptiveOnChange(of: gestureResetToken) { _, _ in
            didMoveDuringTouch = false
            trackedTouchOrigin = nil
        }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint(String(localized: "story.groupIntro.skipHint",
                                  defaultValue: "Touchez pour passer à la story"))
    }

    private var accessibilitySummary: String {
        var parts = [intro.displayName ?? intro.username]
        // Même règle que le badge visuel : le statut de présence n'est
        // annoncé à VoiceOver que pour un ami ET quand un indicateur est
        // affiché (online/away/idle) — offline reste muet.
        let state = presence?.state ?? .offline
        if isFriend, state.showsIndicator {
            parts.append(StoryAuthorIdentityCard.presenceLabel(state))
        }
        if let message = intro.moodMessage { parts.append(message) }
        return parts.joined(separator: ", ")
    }
}
