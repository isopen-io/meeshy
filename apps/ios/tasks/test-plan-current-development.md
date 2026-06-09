# Plan de validation — développement en cours (exécution macOS + simulateur iOS)

> **But** : valider, sur un Mac avec Xcode + simulateur iOS, l'ensemble du développement en cours
> (appels — dégradation gracieuse audio-only ; leviers bande passante) **et** corriger/valider les
> 4 anomalies de messagerie remontées. À exécuter par un agent disposant du skill de pilotage du
> **simulateur iOS** (sinon manuellement).
>
> **Contexte d'écriture** : ce plan a été rédigé dans un conteneur Linux **sans Xcode** — aucun code
> iOS n'a pu être compilé/exécuté côté auteur. Toute exécution (`build`, `test`, `run`) se fait **sur
> macOS**. Branche : `claude/calls-graceful-degradation`.

---

## 0. Prérequis & mise en route

```bash
# Toujours via le wrapper (jamais xcodebuild direct)
./apps/ios/meeshy.sh build      # build seul (non bloquant)
./apps/ios/meeshy.sh test       # tests unitaires/intégration (DOIT passer avant tout)
./apps/ios/meeshy.sh run        # build + install + launch + logs (BLOQUE)
./apps/ios/meeshy.sh logs       # stream des logs simulateur
```

- **Simulateur** : iPhone 16 Pro (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`), bundle `me.meeshy.app`.
- **Backend** : pointer l'app sur un gateway joignable (Debug → `localhost:3000`, ou staging). Deux
  comptes de test (deux simulateurs / device) pour valider l'aller-retour expéditeur ⇄ destinataire.
- **Identifiants de test** : `apps/ios/fastlane/.env` (gitignored) — `DEMO_USER` / `DEMO_PASSWORD`.
- **Capture** : pour chaque scénario, capturer **screenshot** + extrait **logs** (`meeshy.sh logs`) et
  renseigner la matrice §6.

### Pré-conditions backend pour les leviers bande passante (flags)
| Levier | Variable | Valeur de test | Défaut prod |
|---|---|---|---|
| Audio Opus | `AUDIO_PIPELINE_TTS_FORMAT` | `opus` | `opus` (⚠ valider lecture client) |
| Filtre langue WS | `SOCKET_LANG_FILTER` | `true` (staging) | `false` |
| Transcodage vidéo | `VIDEO_TRANSCODE` | `true` (staging) | `false` |
| TTS on-demand | `TTS_GENERATION_MODE` | `all` | `all` |

---

## 1. Phase 0 — Tests automatisés (bloquant)

Lancer `./apps/ios/meeshy.sh test` et exiger **vert** sur (au minimum) :

| Suite | Couvre |
|---|---|
| `VideoSurvivalControllerTests` | policy temporelle survie + controller (suspend/resume/revert/reset/**timeout**) |
| `VideoSurvivalPolicyTests` | hystérésis, interval-agnostique, stabilité 100h/72k échantillons |
| `MessageSendFlowTests` | envoi optimiste → ACK / échec → `.queued` |
| `MessageStoreTests` | observation GRDB, **tri par `createdAt`**, merge protectif |
| `ConversationViewModelOfflineQueueTests` | réconciliation file d'attente |
| `MeeshySDKTests` (`swift test`) | décodage `MeeshyImageVariant` / `imageVariants` (#3 srcset) |

> Si une suite échoue à la compilation : corriger d'abord (l'intégration `CallManager`/`CallView` a
> été écrite sans compilateur — voir §4).

---

## 2. Phase 1 — Anomalies de messagerie (les 4 — PRIORITAIRE)

> Chaque item = **Repro** (pas-à-pas simulateur) → **Attendu** → **Critère PASS/FAIL** → **Cause
> probable / correctif** (à appliquer puis re-valider).

### 🔴 BUG 1 — Un message « en attente » (⏱) fait disparaître les autres messages envoyés
**Repro**
1. Ouvrir une conversation avec plusieurs messages déjà **envoyés** (✓).
2. Provoquer un envoi qui reste en `pending`/`clock` (couper le réseau du simulateur : Réglages →
   mode Avion, ou throttling ; ou envoyer une pièce jointe lourde).
3. Observer la liste pendant que le message reste ⏱.

**Attendu** : **TOUS** les messages restent affichés, triés par **date d'envoi** (`createdAt`),
texte **et** pièces jointes. Le message bloqué reste visible en ⏱ ; aucun autre ne disparaît.

**Critère PASS** : 0 message perdu ; ordre chronologique stable ; après reconnexion le ⏱ passe à ✓
sans réordonner ni dupliquer.

**Cause probable / pistes** (à confirmer en debug) :
- `MessageStore.publish(records:mergeInMemory:)` (`Stores/MessageStore.swift` ~L277–290) : le merge
  protectif `messages.filter { !snapshotIds.contains($0.localId) }` puis `sorted { $0.createdAt < … }`
  ne préserve les messages en mémoire **que** si `localId` est stable et `createdAt` correctement posé
  à l'insert optimiste. Vérifier :
  - L'insert optimiste (`ConversationViewModel.sendMessage` ~L1917–1985) pose bien `createdAt` = date
    d'envoi locale **immédiate** (pas `nil`/epoch), et un `localId` stable réutilisé à l'ACK.
  - À l'ACK serveur (~L2042–2056), la réconciliation **met à jour** la ligne optimiste (par
    `clientMessageId`) au lieu d'en insérer une seconde / de remplacer tout le tableau.
  - `windowMode == .latest` lors des publications temps réel (sinon `mergeInMemory=false` ⇒
    `messages = records` **écrase** les optimistes → perte apparente).
- **Test à ajouter** : `MessageStoreTests` — un optimiste `.sending` + arrivée d'un snapshot GRDB qui
  ne le contient pas ⇒ l'optimiste **reste** et l'ordre par `createdAt` est respecté.

---

### 🟠 BUG 2 — Chaque pièce jointe doit être un message unique du bon type
**Repro**
1. Envoyer **3 images** en un geste → observer côté expéditeur **et** destinataire.
2. Envoyer **1 image + 1 vidéo + 1 audio + du texte** en un geste.

**État actuel constaté dans le code** (`Services/MultiAttachmentSendPlanner.swift` L37–73) :
les pièces jointes sont **groupées par bucket de type** : tous les *audio* → 1 message ; tous les
*visuels* (image|vidéo|fichier) → 1 message ; le texte → 1 message (en dernier). Donc **3 images = 1
seul message** (type `.image`, dérivé de la **1ʳᵉ** pièce jointe — `ConversationViewModel` ~L1932–1941).

**Décision attendue (à confirmer produit)** : l'utilisateur demande **1 pièce jointe = 1 message
unique avec son bon type**. Si c'est la cible :
- **Critère PASS** : N pièces jointes ⇒ **N messages**, chacun typé selon **sa propre** pièce jointe
  (`image`/`video`/`audio`/`file`), ordonnés par date, + éventuel message texte distinct.
- **Correctif** : faire de `MultiAttachmentSendPlanner.plan` un planificateur **1-attachment-par-message**
  (au lieu du bucket par type), et dériver `messageType` **par message** (déjà fait par-message, mais
  sur une pièce jointe unique ça devient trivialement correct). Conserver l'ordre d'envoi.
- ⚠ Vérifier l'impact gateway (REST `POST /messages` + socket `message:send-with-attachments`) : un
  message par pièce jointe = N appels — surveiller le rate-limit messages (20/min/user).

> Si le produit veut **garder** le groupage par type, alors BUG 2 = simple validation que le **type**
> est correct par message ; documenter la décision.

---

### 🟠 BUG 3 — Bouton « renvoyer » : ouvre le statut au lieu de renvoyer ; le déplacer en bande orange à gauche
**Repro**
1. Provoquer un **échec** d'envoi (réseau coupé jusqu'à passage en `.failed` ✗).
2. Toucher l'actuel bouton « renvoyer » (flèche `arrow.clockwise`, `Bubble/BubbleFooter.swift`
   L181–192).

**Constat actuel** : le tap appelle `onRetry()` → `performManualRetry()`
(`Bubble/BubbleStandardLayout.swift` L909–914) → `OfflineQueue.shared.retryByClientMessageId(cmid)`.
L'utilisateur rapporte qu'au tap **le statut d'envoi s'ouvre** (probable conflit de geste avec
`onShowReadStatus` / le long-press du conteneur), au lieu de renvoyer.

**Attendu (demande explicite)** : un **bandeau vertical orange** sur le **bord gauche** de la bulle
(attaché à la bulle, sur toute sa hauteur) pour les messages `.failed` ; **tap dessus = relance
immédiate de l'envoi** (`OfflineQueue.retryByClientMessageId`). Plus de bouton flèche ambigu dans le
footer.

**Critère PASS** : tap sur la bande orange ⇒ message repasse `.sending` (⏱) puis ✓ ; **aucune**
ouverture du sheet de statut ; la bande disparaît une fois envoyé.

**Correctif (à implémenter puis valider)** :
- Nouvelle sous-vue `BubbleFailedRetryBar` (Equatable, inputs primitifs) sous `Views/Bubble/`,
  branchée dans `BubbleStandardLayout` via `if content.isFailed { … }` (respecter la règle « pas de
  logique inline » du CLAUDE.md bubble).
- Bande : `RoundedRectangle` ambre (`MeeshyColors.warning`/orange), largeur ~4–6pt, hauteur =
  hauteur bulle, alignée à gauche, `contentShape(Rectangle())` élargie (zone de tap ≥ 44pt),
  `onTapGesture { performManualRetry() }` + `HapticFeedback.light()`.
- **Isoler le geste** : empêcher la propagation au long-press/overlay et à `onShowReadStatus`
  (`.highPriorityGesture`/`.simultaneousGesture(false)` selon le conteneur) — c'est la cause du
  « ça ouvre le statut ».
- Retirer le bouton flèche du footer (ou le laisser inactif). `accessibilityLabel("Renvoyer le message")`.

---

### 🟠 BUG 4 — Long-press : double menu (contextuel « Copier » + overlay) ; overlay plus rapide
**Repro**
1. Long-press sur une bulle texte.
2. Observer : un **menu système « Copier »** (sélection de texte / `contextMenu`) **et** l'overlay
   custom apparaissent.

**Constat** : côté UIKit, `UIContextMenuInteraction` est retiré
(`Views/MessageListViewController.swift` L441–449), mais un menu « Copier » système subsiste —
typiquement dû à du **texte sélectionnable** (`.textSelection(.enabled)`) ou un `.contextMenu { }`
SwiftUI résiduel sur la bulle, déclenché par le même long-press.

**Attendu** : **un seul** affordance au long-press = l'**overlay custom**. Pas de menu contextuel
système. Overlay **plus rapide et plus fluide**.

**Critère PASS** : long-press ⇒ overlay uniquement (0 menu « Copier » système) ; apparition perçue
« instantanée » et fluide (pas de flash/gap) ; « Copier » disponible **dans** l'overlay.

**Correctif (à implémenter puis valider)** :
- Supprimer tout `.contextMenu { … }` et désactiver `.textSelection(.enabled)` sur le texte de bulle
  (`ThemedMessageBubble`/`BubbleStandardLayout`) — garder « Copier » comme action de l'overlay.
- Fluidifier l'ouverture (`Views/ConversationView+ContextOverlay.swift` L79–91 +
  `MessageContextOverlay.swift`) : réduire le gap `.opening → .open` (rendre le menu visible dès
  `.opening`), accélérer `BubbleAnimations.overlaySpring` (response ↓, ex. 0.28–0.32), pré-rendre la
  bulle élevée. Cible : < 1 frame de latence perçue, 60 fps.
- Vérifier que `LongPressGesture(minimumDuration: 0.35, maximumDistance: 6)` (`MessageListView.swift`
  L98–104) ne coexiste pas avec un autre reconnaisseur déclenchant le menu système.

---

## 3. Phase 2 — Dégradation gracieuse des appels (survie audio-only)

> Nécessite **deux** participants (2 simulateurs / 1 sim + 1 device). Conditionner le réseau via
> **Network Link Conditioner** (macOS) ou les profils réseau du simulateur.

| # | Scénario | Étapes | Attendu (PASS) |
|---|---|---|---|
| 3.1 | Bascule audio-only sous lien dégradé | Appel vidéo établi → dégrader le lien (perte/latence élevée) **≥ ~6–10 s** | Après dégradation soutenue : vidéo sortante **coupée** (audio maintenu) ; pair voit l'avatar ; **tuile « Vidéo en pause » par-dessus l'avatar local** + bouton caméra **ambre « En pause »** |
| 3.2 | Reprise auto | Rétablir un bon lien **≥ ~10 s** | Vidéo **réactivée automatiquement** ; tuile/pastille disparaissent ; bouton caméra redevient normal |
| 3.3 | Intention utilisateur souveraine | Pendant la suspension, l'utilisateur coupe **manuellement** la caméra | Pas de réactivation auto contre l'intention ; état de survie remis à zéro |
| 3.4 | Pas de flapping | Lien qui oscille brièvement (dips de 1–2 s) | **Aucune** suspension/reprise parasite (hystérésis temporelle) |
| 3.5 | Robustesse longue durée | Appel maintenu ≥ 1–2 h avec variations | Pas de gel, pas de fuite mémoire ; **timeout de transition** : si une renégociation se bloque, le contrôleur ne reste pas figé (re-tente plus tard) |
| 3.6 | Horloge | (Si possible) changer l'heure système pendant l'appel | Aucune suspension/reprise parasite (horloge **monotone**) |

**Capture** : pour 3.1/3.2, screenshots de la tuile suspendue + du bouton, et logs `[CALL] survival
A/V switch offer sent`.

---

## 4. Phase 3 — Intégration `CallManager` / `CallView` (écrite sans compilateur — à valider en premier)

> Ces fichiers ont été modifiés **à l'aveugle**. Avant tout test fonctionnel d'appel :

1. `./apps/ios/meeshy.sh build` → **0 erreur**. Points de vigilance :
   - `CallManager.swift` : propriété `videoSurvivalController` + `@Published isVideoSuspended`, init
     (`attach(actuator: self)` après init complet), sink Combine, conformance
     `VideoSurvivalActuating` (extension **même fichier**, accès `private(set)`), appel dans
     `didCollectStats`, `reset()` dans `toggleVideo`/teardown.
   - `CallView.swift` : `videoAutoPaused`, `localVideoSuspendedTile` (avatar utilisateur courant +
     overlay), état ambre du bouton caméra, clés i18n `call.video.suspended*` /
     `call.control.video.paused*`.
   - `VideoSurvivalController.swift` : `withTaskGroup` du timeout (capture `actuator`, isolation
     `@MainActor`).
2. Corriger toute erreur de compilation (concurrence Swift 6, isolation, optionnels) puis relancer
   Phase 0.

---

## 5. Phase 4 — Leviers bande passante observables côté iOS

| # | Levier | Validation iOS | PASS |
|---|---|---|---|
| 5.1 | **Audio Opus** (`AUDIO_PIPELINE_TTS_FORMAT=opus`) | Recevoir un message audio traduit (TTS) ; le **lire** | Lecture **OK** (AVFoundation décode `audio/opus`) **ET** poids réduit (~−65 %). ⚠ **Si la lecture échoue → bloquant** : repasser `=mp3` et remonter |
| 5.2 | **Image variants / srcset** (`imageVariants`) | Recevoir une image ; vérifier que le client peut exploiter `imageVariants` (décodage SDK) ; mesurer le poids chargé pour une preview inline | Variante légère utilisée si dispo ; pas de régression d'affichage |
| 5.3 | **Filtre langue WS** (`SOCKET_LANG_FILTER=true`, staging) | Sur un device dont la langue préférée = 1 seule : recevoir un message multi-traduit | Payload `message:new` **réduit** aux langues du device + original ; affichage Prisme inchangé ; **multi-device** OK |
| 5.4 | **Transcodage vidéo** (`VIDEO_TRANSCODE=true`, staging) | Envoyer une grosse vidéo ; la recevoir/lire | Vidéo plus légère (H.264 `+faststart`), lecture progressive OK, **aucune corruption** ; sur échec serveur l'original est conservé |

---

## 6. Matrice de résultats (à remplir)

| ID | Scénario | Résultat | Preuve (screenshot/log) | Notes / défaut |
|---|---|---|---|---|
| 0 | `meeshy.sh test` vert | ☐ PASS / ☐ FAIL | | |
| 1 | BUG 1 — aucun message perdu | ☐ | | |
| 2 | BUG 2 — 1 PJ = 1 message typé | ☐ | | |
| 3 | BUG 3 — bande orange relance l'envoi | ☐ | | |
| 4 | BUG 4 — overlay seul + fluide | ☐ | | |
| 3.1–3.6 | Survie appel | ☐ | | |
| 4 | Build `CallManager`/`CallView` | ☐ | | |
| 5.1 | Opus lisible | ☐ | | |
| 5.2 | imageVariants | ☐ | | |
| 5.3 | Filtre langue WS | ☐ | | |
| 5.4 | Transcodage vidéo | ☐ | | |

---

## 7. Critères de sortie (merge)

1. Phase 0 verte (`meeshy.sh test`).
2. Build iOS sans erreur (Phase 3).
3. **BUG 1 corrigé et prouvé** (aucune perte de message) — bloquant.
4. BUG 3 & BUG 4 corrigés et validés visuellement.
5. BUG 2 : décision produit tranchée + comportement conforme.
6. Survie appel 3.1/3.2/3.4 PASS.
7. **5.1 Opus lisible** sur iOS (sinon repli `mp3` documenté) — bloquant.
8. Rapport §6 complété (screenshots + logs).

> Les correctifs des 4 bugs (BUG 1–4) ne sont **pas** encore implémentés : ce plan les cadre
> (repro + cause + correctif). Implémentation possible ensuite, puis validation via ce même plan.
