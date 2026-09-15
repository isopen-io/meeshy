import SwiftUI
import MeeshySDK
import MeeshyUI

/// Découple la présentation d'appel (cover plein écran + pastille flottante +
/// bulle + bannière call-waiting) du corps de `RootView` / `iPadRootView`.
///
/// EXTRAIT de `RootView.swift` le 2026-09-14 (#6579). `RootView.swift` dépassait
/// le plafond dur de 1200 lignes : y ajouter le montage de la bande du haut était
/// interdit. L'extraction est donc la CONDITION du correctif, pas un à-côté — et
/// elle place ce conteneur là où on le cherche, à côté des deux couches de racine
/// qui le montent.
///
/// AVANT : ces 4 modifiers lisaient `CallManager.shared` directement dans
/// `RootView.body`, donc chaque `objectWillChange` de CallManager — tick
/// `callDuration` 1 Hz **plus** chaque stat qualité WebRTC / ajustement bitrate —
/// invalidait TOUT le body, y compris en arrière-plan pendant un appel. Résultat :
/// tempête de re-layout CoreText → watchdog scene-update `0x8BADF00D`
/// (`ProcessVisibility: Background`, budget 10 s dépassé). Prouvé par la sonde
/// `🩺RENDER` (`RootView: _callManager changed` en rafale, `phase=BG`) + MetricKit.
///
/// APRÈS : l'unique `@ObservedObject callManager` vit ici. SwiftUI ne ré-évalue
/// que `body(content:)` (les overlays d'appel, légers) et ne reconstruit JAMAIS
/// le `content` sous-jacent (liste de conversations, NavigationStack, tabs) —
/// celui-ci est un placeholder opaque que le framework diffe sans re-layout.
struct CallPresentationLayer: ViewModifier {
    @ObservedObject private var callManager = CallManager.shared

    // Mini-lecteur audio hoisté ICI (même point de montage que la bannière
    // d'appel — demande produit 2026-08-13 : « le mini lecteur doit être
    // intégré au même endroit que le composant de call »). Injecté en
    // closures, pas en défaut `= { nil }`/`.shared`, car `CallPresentationLayer`
    // n'a lui-même aucun accès au `router` (iPhone) / `activeConversation`
    // (iPad) — seuls `RootView`/`iPadRootView`, qui possèdent ces états, le
    // peuvent. Mêmes raisons que l'injection explicite de `callManager`
    // ci-dessus (pas d'`@EnvironmentObject`, cf. commentaire sur
    // `FloatingCallPillView`).
    let miniPlayerOnTapBody: () -> Void
    let miniPlayerCurrentConversationId: () -> String?

    /// `nil` en production ⇒ `MiniAudioPlayerBar` prend `.shared`.
    ///
    /// Existe pour que le TÉMOIN DE RENDU puisse monter cet écran — celui que le
    /// porteur a photographié — avec une écoute en cours, et LIRE LES PIXELS de
    /// la bande. Sans cette couture, le seul moyen d'exercer le chemin complet
    /// (barre → `onDisplayedContextChange` → `audioBarContext` → bande) serait de
    /// muter le singleton du processus, ce qui fuit d'un témoin à l'autre.
    var miniPlayerCoordinator: ConversationAudioCoordinator? = nil

    /// Ce que le mini-lecteur AFFICHE — pas ce que le coordinateur joue (#6579).
    ///
    /// La bande du haut doit se peindre exactement quand une barre occupe le
    /// sommet, jamais « quand un audio est en cours » : le mini-lecteur se MASQUE
    /// à l'intérieur de la conversation qui joue, et se maintient 5 s de grâce
    /// après la fin de la file. Seule la barre connaît ces deux règles — elle les
    /// REMONTE donc, au lieu de les voir réécrites ici.
    ///
    /// Remontée par callback et non par `@ObservedObject` sur
    /// `ConversationAudioCoordinator` : celui-ci publie `progress` / `currentTime`
    /// à ~20 Hz, et ce conteneur existe précisément pour tenir ce genre de churn
    /// hors du corps de la racine. Le callback ne tire qu'aux changements de la
    /// valeur AFFICHÉE — quelques fois par lecture.
    @State private var audioBarContext: ActiveAudioContext?

    func body(content: Content) -> some View {
        // Compression de frame, PAS augmentation de safe area : la bannière
        // d'appel est le premier élément d'un VStack au-dessus du contenu,
        // donc TOUTE l'app (NavigationStack comprise) voit sa frame commencer
        // sous la bannière — comportement WhatsApp. L'ancien montage
        // `.safeAreaInset(edge: .top)` ne traversait pas la frontière UIKit
        // de la NavigationStack : les headers des navigationDestination
        // (ConversationView, ConversationListView) restaient épinglés au
        // sommet physique, cachés et inaccessibles derrière la bannière.
        // Réduire la frame préserve aussi toutes les géométries internes des
        // écrans (clearances, gradients, overlays) — seul le viewport bouge.
        //
        // Le mini-lecteur audio partage ce même mécanisme, juste SOUS la
        // bannière d'appel : quand un appel est actif, `FloatingCallPillView`
        // occupe le haut et le mini-lecteur (s'il joue quelque chose) se pose
        // juste en dessous — l'appel prime toujours visuellement sur la
        // lecture audio, jamais l'inverse. Les deux ont un corps vide
        // (`EmptyView`) quand ils n'ont rien à montrer, donc aucune empreinte
        // fantôme dans le VStack (même garantie que `FloatingCallPillView`
        // seule avant ce changement).
        VStack(spacing: 0) {
            FloatingCallPillView(callManager: callManager)
            MiniAudioPlayerBar(
                coordinatorForTesting: miniPlayerCoordinator,
                onTapBody: miniPlayerOnTapBody,
                currentConversationId: miniPlayerCurrentConversationId,
                onDisplayedContextChange: { audioBarContext = $0 }
            )
            content
        }
            // La BANDE DU HAUT (#6579) — le site UNIQUE qui peint la zone
            // status-bar au-dessus de la barre active. Montée ICI parce que ce
            // conteneur est le seul endroit que les DEUX racines partagent
            // (`RootViewLayers` iPhone, `iPadRootViewLayers` iPad) : posée dans
            // l'une, elle aurait manqué l'autre. Les deux barres ne peignent plus
            // leur propre débord — une peinture portée par chaque barre est
            // présente chez l'une et absente chez l'autre, ce qui ÉTAIT le défaut.
            //
            // `callIsActive` vient du prédicat de la pilule elle-même, jamais de
            // `callState.isActive` : la pilule se masque aussi en plein écran et
            // pendant le PiP système, et une bande sans sa barre serait un ruban
            // indigo posé sur rien.
            .modifier(TopChromeBand(
                callIsActive: FloatingCallPillView.isShowingPill(
                    displayMode: callManager.displayMode,
                    callState: callManager.callState,
                    isSystemPiPActive: callManager.isSystemPiPActive
                ),
                audio: audioBarContext
            ))
            // Le `set: false` est un "minimize" (→ PiP), PAS un "end call" :
            // swiper le cover vers le bas ne raccroche pas. Le bouton hangup de
            // chaque UI passe explicitement par `callManager.endCall()`.
            .fullScreenCover(isPresented: Binding(
                get: {
                    CallState.shouldPresentFullScreenCover(
                        callState: callManager.callState,
                        displayMode: callManager.displayMode
                    )
                },
                set: { if !$0 { callManager.displayMode = .pip } }
            )) {
                CallView(callManager: callManager)
            }
            // C1 — ancre du PiP système pour les modes RÉDUITS. L'unique ancre
            // vivait dans `CallView`, donc dans le `fullScreenCover` : réduire
            // l'appel démonte le cover, `pipConfiguredSource` est `weak` et passe
            // à nil, et plus rien ne reconfigure. Un appel réduit ne pouvait donc
            // PLUS ouvrir de PiP — alors que le réduire est exactement le geste
            // qui devrait le préparer.
            //
            // Deux gardes, chacune pour une raison distincte :
            // • `displayMode != .fullScreen` — pendant que le cover est présenté
            //   (`UIModalPresentationFullScreen`), UIKit détache la hiérarchie
            //   présentante : une ancre montée ici y serait hors fenêtre, et le
            //   bouton PiP manuel de `CallView` resterait visible mais inerte.
            // • PAS de garde sur `isSystemPiPActive` — contrairement à la pilule
            //   et à la bulle, qui se masquent pendant le PiP. L'ancre doit
            //   SURVIVRE à la fenêtre flottante : c'est la vue d'où AVKit fait
            //   émerger puis retourner l'animation.
            .overlay(alignment: .top) {
                if callManager.callState.isActive && callManager.displayMode != .fullScreen {
                    PiPSourceAnchor()
                        .frame(height: 64)
                        .padding(.top, MeeshySpacing.sm)
                        .allowsHitTesting(false)
                }
            }
            .overlay {
                CallBubbleView(callManager: callManager)
            }
            // §7.6 — call-waiting : un 2e appel entrant pendant un appel actif.
            // Reject termine le nouvel appel ; "end & answer" raccroche l'appel
            // courant et accepte le nouveau. L'`.id(pending.callId)` force un
            // remount (fresh onAppear/timer 15 s) à chaque supersession — sinon
            // un 3e appelant réutilise l'identité du 2e et se fait auto-rejeter
            // 5-10 s trop tôt (Audit Vague 27).
            .overlay(alignment: .top) {
                if callManager.showCallWaitingBanner {
                    CallWaitingBannerView(
                        callerName: callManager.pendingIncomingCall?.fromUsername
                            ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main),
                        isVisible: $callManager.showCallWaitingBanner,
                        onReject: { callManager.rejectPendingCall() },
                        onEndAndAnswer: { callManager.endCurrentAndAnswerPending() }
                    )
                    .id(callManager.pendingIncomingCall?.callId)
                    .padding(.top, MeeshySpacing.sm)
                }
            }
    }
}
