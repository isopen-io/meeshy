# Intégration système iOS — icône CallKit, Now Playing en appel, PiP au background

**Date** : 2026-07-31
**Statut** : design validé, prêt pour plan d'implémentation
**Périmètre** : `apps/ios/Meeshy` uniquement (aucun changement gateway, SDK ou schéma)

## Problème

Trois écarts d'intégration avec les surfaces système iOS, remontés depuis un appareil réel :

1. **Carte d'appel CallKit sans identité Meeshy** — l'écran d'appel entrant affiche un badge vide/plein
   à la place du glyphe Meeshy (capture : carré noir arrondi sur l'avatar).
2. **Now Playing collé pendant un appel** — le Control Center continue d'afficher la carte du dernier
   vocal joué pendant toute la durée d'un appel Meeshy, avec des transports inopérants.
3. **Pas de PiP quand on quitte l'app en appel** — un appel vidéo réduit en pilule in-app ne bascule pas
   en fenêtre PiP système au passage en arrière-plan.

## Lot A — Icône Meeshy dans la carte CallKit

### Cause racine

`CallManager.swift:653` :

```swift
if let icon = UIImage(named: "CallKitIcon") {
    config.iconTemplateImageData = icon.pngData()
}
```

`Assets.xcassets` ne contient que `AccentColor`, `AppIcon`, `AppIconFooter`, `MeeshyLogo` — **`CallKitIcon`
n'a jamais existé**. La branche `if let` ne s'exécute donc jamais et `iconTemplateImageData` reste `nil`.
Le commentaire au-dessus décrit un asset à bundler qui ne l'a jamais été ; l'échec est avalé en silence
depuis l'introduction du code.

### Conception

**A1 — Créer l'asset.** `Meeshy/Assets.xcassets/CallKitIcon.imageset`, 40×40 pt (40/80/120 px pour
1x/2x/3x), dérivé de `apps/ios/logo_master.svg`.

Contrainte CallKit décisive : `iconTemplateImageData` est un **template**. iOS ignore les canaux couleur et
ne lit que le **canal alpha** pour teinter le glyphe lui-même. Donc :

- glyphe Meeshy (stacked dashes) **opaque**, fond **totalement transparent** ;
- un PNG opaque — y compris un export du logo sur son fond indigo — produit un rectangle plein, ce qui est
  très probablement ce que montre déjà la capture d'un build antérieur.

**A2 — Faire échouer bruyamment.** Le `if let` silencieux devient un chemin qui se signale : `Logger.calls.error`
en release, `assertionFailure` en debug. Une suppression ou un renommage d'asset ne doit plus pouvoir
dégrader l'écran d'appel sans laisser de trace.

**A3 — Test `CallProviderIconTests`.** Trois assertions :

- l'asset se charge (`UIImage(named:) != nil`) ;
- ses dimensions valent 40×40 pt ;
- **son canal alpha est non trivial** — au moins un pixel transparent ET au moins un pixel opaque.

La troisième est celle qui compte. Un test qui se contenterait de `iconTemplateImageData != nil` passerait
au vert sur une image entièrement opaque, c'est-à-dire sur le bug exact qu'on corrige.

## Lot B — Now Playing suspendu pendant un appel

### Cause racine

Le garde-fou `CallManager.isCallActiveForAudioGuard` existe et couvre déjà tous les points d'**entrée** de
lecture (`ConversationAudioCoordinator.swift:115, 128, 143, 160, 219`). Il empêche de *démarrer* un vocal
pendant un appel.

Il ne couvre pas la lecture **déjà en cours** au moment où l'appel arrive. `activeContext` reste non-nil, et
le bridge `+NowPlaying.swift` continue de pousser vers `MPNowPlayingInfoCenter`. La carte du vocal survit
donc à l'appel entier, avec des boutons play/pause qui retournent silencieusement via les gardes.

### Conception

Le coordinateur s'abonne à `CallManager.shared.$callState` (déjà `@Published private(set)`,
`CallManager.swift:131`) — pas de nouveau couplage, c'est le même canal que celui qu'utilisent déjà les gardes.

**Définition d'« appel actif »** : strictement celle de `isCallActiveForAudioGuard`
(`CallManager.swift:277-280`) — `ringing`, `offering`, `connecting`, `connected`, `reconnecting`. La suspension
démarre donc dès la sonnerie, pas à la connexion : un appel entrant qui sonne doit déjà chasser la carte du
Control Center.

**Entrée en appel** (transition d'un état non actif vers un état actif) :

- mettre la lecture en pause via l'engine ;
- mémoriser si elle était **effectivement en cours** (distinct d'une pause utilisateur antérieure) ;
- `clearNowPlaying()` ;
- `isEnabled = false` sur les `MPRemoteCommand` (play, pause, next, previous, seek).

**Sortie d'appel** (retour à `.idle`) :

- réarmer les `MPRemoteCommand` ;
- re-pousser le Now Playing si `activeContext != nil` ;
- **reprendre la lecture** — mais uniquement si elle était en cours au moment de l'interruption. Un vocal
  que l'utilisateur avait lui-même mis en pause avant l'appel ne doit pas se réveiller à la fin de celui-ci.

`activeContext`, la file et la position de lecture sont **conservés** pendant tout l'appel. C'est ce qui rend
la reprise possible ; seule la publication vers les surfaces système est suspendue.

**Gate de suspension.** Un flag interne (`_isSuspendedBySystemCall`) court-circuite `pushNowPlayingInfo()`.
Sans lui, le sink `$currentTime` ou `$activeContext` re-publierait la carte dès le premier tick pendant l'appel,
annulant le `clearNowPlaying()`.

### Tests

- appel pendant une lecture active → `nowPlayingInfo` vidé, commandes désarmées, contexte préservé ;
- fin d'appel après interruption d'une lecture active → carte re-publiée **et** lecture reprise ;
- fin d'appel après interruption d'une lecture **déjà en pause** → carte re-publiée, lecture **non** reprise ;
- tick de progression pendant l'appel → aucune re-publication (couvre le gate de suspension).

## Lot C — PiP à la sortie de l'application

### C1 · Appel vidéo — cause racine

`PiPSourceAnchor` est déclarée et montée dans `CallView` (`CallView.swift:80`, `1535-1545`). Elle appelle
`CallManager.attachSystemPiP(sourceView:)`, qui configure `AVPictureInPictureController` avec
`autoStart: true` (`CallManager.swift:2168-2169`) — c'est-à-dire `canStartPictureInPictureAutomaticallyFromInline`.

Mais `RootView.swift:73-83` présente `CallView` dans un `fullScreenCover` conditionné par `displayMode`.
Réduire l'appel en pilule met `displayMode = .pip` (`RootView.swift:80`), le cover est démonté, et la
`sourceView` du PiP disparaît avec lui. `AVPictureInPictureController` n'a alors plus d'ancre inline et
l'auto-start au passage en arrière-plan ne peut pas se déclencher.

C'est précisément le parcours décrit : on réduit l'appel, on navigue dans l'app, on la quitte.

**Conception.** Remonter l'ancre PiP dans `RootView`, montée pendant toute la durée d'un appel actif et
indépendante de `displayMode` — au même niveau que `FloatingCallPillView` et `CallBubbleView`, qui ont déjà
exactement ce cycle de vie. `CallView` cesse de posséder l'ancre. `attachSystemPiP` est déjà idempotent et
auto-gaté (`CallManager.swift:2158-2167`), donc l'appel depuis un site plus stable ne change rien à sa
sémantique.

Une **garde de source** ancre l'invariant sur le comportement : l'ancre PiP ne doit pas vivre sous une vue
dont le montage dépend de `displayMode`.

**Vérification adjacente.** `startBackgroundMonitoring` (`CallManager.swift:3067-3073`) coupe la caméra
**locale** au passage en arrière-plan et en notifie le pair. C'est la vidéo sortante — la réception du flux
distant, seule source du rendu PiP, n'est pas affectée. À confirmer au test manuel plutôt qu'à supposer.

### C2 · Appel audio — vérification, pas construction

iOS n'expose aucune fenêtre PiP flottante sans flux vidéo : `AVPictureInPictureController` exige une source
vidéo. La seule surface native pour un appel audio quitté est l'indicateur d'appel CallKit (pilule verte /
Dynamic Island), qui est aussi ce qu'utilisent FaceTime et WhatsApp.

CallKit est déjà solidement câblé côté Meeshy (`reportNewIncomingCall` / `reportOutgoingCall`, promotion au
background en `CallManager.swift:3063`). Ce lot est donc une **validation de la chaîne réelle**, pas un
développement :

- appel audio actif → quitter l'app → indicateur vert Meeshy visible, chronomètre qui tourne ;
- tap sur l'indicateur → retour dans l'app **sur `CallView` en plein écran**.

Si le retour restaure l'appel en mode pilule au lieu du plein écran, le correctif est un ajustement du
routage `displayMode` au retour en avant-plan — périmètre inclus dans ce lot. Aucun autre travail n'est
engagé sur le PiP audio : la limite est celle de la plateforme.

## Hors périmètre

- Escalade vidéo artificielle (piste factice) pour rendre un appel audio éligible au PiP système — coût
  bande passante et batterie, risque App Review, écarté explicitement.
- Retrait du bridge Now Playing pour les vocaux : la carte Control Center hors appel est un comportement
  voulu et reste inchangée.
- Toute modification gateway, SDK ou schéma de données.

## Fichiers touchés

| Fichier | Lot | Nature |
|---|---|---|
| `Meeshy/Assets.xcassets/CallKitIcon.imageset/` | A | création |
| `Features/Main/Services/CallManager.swift` | A, C2 | garde bruyante sur l'asset ; routage `displayMode` au retour en avant-plan **si** C2 révèle un écart |
| `Features/Main/Services/ConversationAudioCoordinator.swift` | B | abonnement `$callState`, suspend/reprise |
| `Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift` | B | gate de suspension, armement des commandes |
| `Features/Main/Views/CallView.swift` | C1 | retrait de `PiPSourceAnchor` |
| `Features/Main/Views/RootView.swift` | C1 | montage de l'ancre PiP |
| `MeeshyTests/Unit/Services/CallProviderIconTests.swift` | A | création |
| `MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` | B | extension |
| `MeeshyTests/Unit/Views/CallViewLayoutGuardTests.swift` | C1 | garde de source sur l'ancre |

## Critères d'acceptation

1. Un appel entrant affiche le glyphe Meeshy — pas un rectangle plein — dans la carte CallKit.
2. Le Control Center n'affiche aucune carte audio pendant un appel Meeshy.
3. Un vocal en cours interrompu par un appel reprend à la fin de celui-ci ; un vocal déjà en pause ne reprend pas.
4. Un appel vidéo réduit en pilule bascule en fenêtre PiP système quand on quitte l'application.
5. Un appel audio quitté reste visible via l'indicateur CallKit, et le tap ramène sur `CallView` plein écran.
6. `./apps/ios/meeshy.sh test` vert.
