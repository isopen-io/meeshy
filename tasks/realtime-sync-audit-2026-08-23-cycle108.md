# Cycle 108 — le contrat citait un test qui prouvait l'inverse

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-lmraqx`
**PR** : #3381
**Prédécesseur** : cycle 107 (PR #3376, #3378) — le suivi porté trois cycles était faux

---

## Le point de départ

Le cycle 107 laissait un suivi hérité : « `_seq` déclaré sur le seul
`NotificationEventData` ». Instruit ici. La question posée n'était pas
« pourquoi un seul contrat ? » — la réponse est écrite dans `emitWithSeq.ts` et
elle est bonne — mais **« qui lit ce champ ? »**, parce que c'est la seule chose
dont dépend la validité du dispositif.

---

## Ce que le contrat affirmait

`packages/shared/types/socketio-events.ts`, sur `_seq` :

> C'est le signal de détection de TROU du SyncEngine (…). **Les trois clients le
> lisent** — web (`observeSyncSeq(this.syncSeq, data?._seq)`,
> `notification-socketio.singleton.ts`), iOS (`case seq = "_seq"`,
> `MeeshySDK/Sockets/MessageSocketManager.swift`), Android
> (`MessageSocketManagerNotificationTest`).

---

## Ce que la mesure dit

| affirmation | mesure |
|---|---|
| web lit `_seq` | **VRAI** — `observeSyncSeq` avant livraison, curseur préservé au reconnect, remis à zéro au `disconnect()` |
| iOS lit `_seq` | **VRAI** — `SyncSeqTracker.shared.observe(event.seq)`, `reset()` au logout dans `AuthManager` |
| Android lit `_seq` | **FAUX** — `MessageSocketManager.kt` le documentait lui-même comme un « toast-only field que `Json.ignoreUnknownKeys` **silently drops** » |
| `SyncSeq*` existe sur Android | **FAUX** — `grep -rln "SyncSeq\|syncSeq\|detectGap\|lastSeq" apps/android --include=*.kt` ⇒ **zéro fichier** |
| le test cité le prouve | **FAUX, et à l'envers** — il contient `"_seq":42` en fixture et n'asserte que `id`, `type`, `state.isRead` |

Et le second document qui gouverne le même champ, `emitWithSeq.ts`, disait la
vérité pendant tout ce temps :

> (…) sur les **DEUX** clients qui la portent : iOS (`SyncSeqTracker.observe`)
> et web (`observeSyncSeq`).

**Deux documents, un champ, deux comptes différents.** Celui qui comptait trois
était le contrat — celui qu'on lit en premier.

---

## La leçon : une CITATION n'est pas une MESURE

Le cycle 107 a établi qu'un suivi hérité est une affirmation, qui se mesure
avant d'être recopié. Ce cycle-ci trouve la variante la plus coûteuse de la même
erreur : **l'affirmation accompagnée d'une preuve qui n'en est pas une.**

`MessageSocketManagerNotificationTest` existe. Son nom est juste. Il touche bien
`notification:new`. Sa fixture contient bien `_seq`. Tout ce qui est vérifiable
d'un coup d'œil est exact — et il prouve la proposition **opposée** à celle qu'on
lui fait porter : que le décodage **survit** au champ, pas qu'il le lit. La
citation a la forme d'une preuve, donc personne (moi) n'a ouvert le fichier.

Un suivi non mesuré s'attrape en le mesurant. Une citation fausse résiste plus
longtemps, parce qu'elle a déjà l'air d'avoir été mesurée.

**Règle** : citer un test comme preuve d'une LECTURE exige de vérifier qu'il
**asserte** cette lecture. Une fixture qui contient le champ prouve la tolérance
au champ, jamais sa lecture. Les deux se ressemblent dans le fichier ; elles
sont opposées dans le contrat.

---

## La conséquence, qui n'est pas documentaire

Android n'avait **aucune détection de trou exacte**. Il ne disposait que du gap
recovery temporel (watermarks `updatedSince`/`after`), qui rate les events à
timestamp identique et sur-fetch — précisément le défaut que `_seq` existe pour
corriger.

Pire pour la suite : la règle LOCKSTEP de `emitWithSeq.ts` dit qu'étendre la
liste des appelants oblige à étendre l'observation **dans le même train de
release**, faute de quoi un client voit un trou à chaque event estampillé qu'il
n'observe pas. Sur la foi du contrat, cette extension aurait été jugée sûre pour
trois clients quand deux seulement observaient — et le troisième aurait vu un
faux trou à **chaque** event de la nouvelle famille.

---

## Ce que le lot fait

Fermer le trou, pas la phrase.

| fichier | rôle |
|---|---|
| `sdk-core/.../sync/SyncSeqState.kt` (nouveau) | valeur pure, **3ᵉ miroir** de la règle + `SyncSeqTracker` thread-safe non-suspendant |
| `sdk-core/.../socket/MessageSocketManager.kt` | lit `_seq` sur la charge **BRUTE** avant décodage (seul endroit où il existe encore) |
| `feature/notifications/.../NotificationsViewModel.kt` | trou ⇒ `refresh()` idempotent (décision **app-side**, miroir du coordinateur iOS) |
| `sdk-core/.../auth/AuthRepository.kt` | `reset()` au logout — `_seq` est alloué PAR USER |
| shared / gateway / web / iOS | les docs disent ce qui est mesuré, et gardent trace de ce qu'elles affirmaient à tort |

### Trois décisions qui méritent d'être écrites

1. **`observe` AVANT `decode`** — on suit le web, pas iOS (qui observe après
   décodage). Le curseur suit le flux **SERVEUR** : un décodage raté est notre
   bug, pas un trou d'émission. Et le curseur avance même si aucun écran
   n'écoute, parce qu'il décrit le transport, pas l'UI.
2. **`reset()` dans `AuthRepository`, pas dans `SessionTeardown`** — le contrat
   de `SessionTeardown` porte sur les stores **persistés** ; le curseur est en
   mémoire. iOS fait le même choix (`AuthManager`, pas `CacheCoordinator`). Sans
   ce reset, le compte suivant ne verrait pas un faux trou (bénin) mais
   **manquerait** tous les siens tant qu'il n'aurait pas dépassé le curseur
   hérité — l'échec silencieux, pas l'échec bruyant.
3. **Pas de débounce, contrairement à iOS** — un trou **avance** le curseur, donc
   une rafale d'events n'en produit qu'UN. Le débounce iOS coalesce surtout son
   second déclencheur (`reconnect`), qu'Android n'a pas. À rajouter le jour où
   Android en gagne un.

---

## Ce qui a été écarté

- **Ne corriger que la phrase** (« les deux clients ») : exact, et suffisant pour
  rendre les deux documents cohérents. Écarté : un contrat qui documente
  proprement un manque n'est pas un contrat rempli, et le manque était le sujet.
- **Un cliquet interdisant à `emitWithSeq` d'estampiller un event non observé
  par les trois clients** : écarté sur la leçon du cycle 107 — un cliquet écrit
  sur une mesure fragile ment plus longtemps qu'un journal. La liste des
  appelants tient en deux lignes, et la règle est écrite à l'endroit exact où on
  l'enfreindrait.

---

## Gates

- **Android** : non exécutable dans le conteneur de la routine — `dl.google.com`
  refusé par la politique d'egress, `sdkmanager` ne s'amorce pas, aucune tâche
  Gradle ne tourne. C'est la raison d'être documentée de
  `.github/workflows/android.yml` (son en-tête le dit) : **le workflow CI est le
  gate de ce lot** (`assembleDebug` + `testDebugUnitTest`).
- **TypeScript / Swift** : les modifications de ce lot y sont **exclusivement des
  commentaires** — aucune ligne exécutable touchée.

Dit sans habillage : ce cycle est le premier depuis longtemps dont le gate
principal est distant. Le journal le note plutôt que de laisser croire à une
vérification locale.

---

## Suivis

- [ ] L'estampillage reste limité à `notification:new`. L'étendre (fan-out
      per-user pour `message:new`, A2.2) exige d'étendre l'observation sur les
      TROIS clients dans le même train de release.
- [ ] Android consomme le trou dans `NotificationsViewModel`, donc à la portée de
      l'écran, là où iOS le câble au boot. C'est la limitation **déjà existante**
      de la consommation temps réel Android (`observeRealtime` y vit aussi), pas
      une nouvelle — notée plutôt qu'inventée, et à sa taille.
- [ ] Hérités du cycle 107 : `senderId` sous deux espaces d'ids ;
      `ReactionUpdateEvent` / `ReactionUpdateEventData` en double ; les autres
      contrats à signature d'index (`LinkMessagePayload`, `SocketIOMessage`) ;
      2 familles sur 12 qui valident à la main.
