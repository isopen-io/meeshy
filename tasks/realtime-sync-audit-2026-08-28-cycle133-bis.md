# Cycle 133 bis — un déclencheur PÉRENNE seul ne converge pas, et un abonné mort fait croire que le canal est branché

Date : 2026-08-28 · Issue : #4201 · Branche : `claude/keen-hamilton-t861y6`

Leçon : `tasks/lessons.md` § **Leçon 312**. Base : cycle 132 (#4197, PR #4198),
dont c'est le suivi MESURÉ — « iOS et web n'ont pas été mesurés sur cette
question ». Ce cycle a mesuré **iOS** ; une session parallèle a mesuré le **web**
en même temps (#4207, PR #4208, journal `…-cycle133.md`, leçon 311) — d'où le
`bis`, et d'où la correction du tableau ci-dessous.

## Le balayage demandé

La question du cycle 132 : **un magasin local dont l'unique source est une
diffusion**. Posée aux deux autres clients, elle rend un verdict par client.

| client | déclencheur VIF (diffusion) | déclencheur PÉRENNE (cycle de vie) | verdict |
|---|---|---|---|
| Android (cycle 132) | `PreferencesSocketManager` | **manquait** → livré au cycle 132 | complet |
| web | `use-socket-cache-sync` invalide `queryKeys.preferences.category(…)` | React Query : `refetchOnReconnect: 'always'` + `refetchOnWindowFocus: 'always'` | **complet sur l'exemplaire React Query — et AVEUGLE sur son jumeau Zustand**, voir ci-dessous |
| **iOS** | **manquant** | `observeAuth` + `observeForeground` | **incomplet — l'inverse exact d'Android** |

Le défaut cherché était « une synchronisation qui n'a que le vif ». iOS porte sa
**symétrique** : une synchronisation qui n'a que le pérenne. Elle ne se voit pas
avec la même question — il faut poser les deux.

> **La ligne « web » de ce tableau était fausse quand elle a été écrite, et c'est
> une leçon à part entière.** Elle certifiait la CLÉ, pas la SURFACE : le web tient
> deux exemplaires des préférences user-level, et les trois routes d'annonce
> visaient toutes le cache React Query — que seul un écran de réglages MONTÉ
> observe — pendant que la messagerie rend le store Zustand, alimenté par un seul
> `initialize()` au montage. La session parallèle l'a mesuré et livré (#4207).
> Compter les DÉCLENCHEURS d'un exemplaire ne dit rien tant qu'on n'a pas compté
> les EXEMPLAIRES : c'est la leçon 311, et elle borde celle-ci.

## Le défaut

`UserPreferencesManager` (SDK) n'avait que deux déclencheurs, tous deux de cycle
de vie :

| déclencheur | site | limite |
|---|---|---|
| ouverture de session | `observeAuth()` → `fetchFromBackend()` | une fois par login |
| retour au premier plan | `observeForeground()` | **étranglé à 5 min** (`minSyncInterval`) |

Conséquence : un réglage changé sur le web ou sur Android n'atteignait pas
l'iPhone tant qu'il restait au premier plan — et un aller-retour vers l'app dans
les cinq minutes suivant la dernière synchro était **sauté par l'étranglement**,
donc ne rattrapait rien non plus. Le bloc `notification` étant miroité dans l'App
Group que lit `NSEPreferencesGate`, « périmé » veut dire ici, littéralement : le
téléphone continue de sonner selon une règle que l'utilisateur vient de changer
ailleurs.

L'étranglement mérite d'être nommé pour lui-même : **il est correct pour le
déclencheur qu'il garde et faux comme unique politique de fraîcheur.** Rouvrir
l'app n'est la preuve de rien ; une diffusion est la preuve que quelque chose a
bougé. Les traiter pareil, c'est appliquer à une PREUVE la retenue qu'on réserve
à un SOUPÇON.

## Ce qui rendait le trou invisible

La diffusion **arrive** pourtant sur iOS : le gateway l'émet
(`preferences-broadcast.ts`), `MessageSocketManager` la décode et la publie sur
`userPreferencesUpdated` (scope catégorie, `{ userId, category }`).

Elle avait même un abonné — un seul, dans `ConversationListViewModel` — et cet
abonné ne pouvait **jamais** s'exécuter :

```swift
guard let self, let convId = event.conversationId else { return }
```

Depuis que l'union a été scindée en deux publishers (`3114acbe3`), le site de
décodage route toute charge portant un `conversationId` vers
`userPreferencesConversationUpdated` ; le publisher plat ne porte donc, par
construction, que `conversationId == nil`. Le `guard` sortait à chaque
événement.

Le publisher avait ainsi **zéro abonné effectif** : le scope qu'il porte n'avait
pas de lecteur, et le scope que son unique abonné attendait ne lui était plus
livré. Le SDK le disait déjà en toutes lettres, douze lignes plus haut —
« Routed separately from `userPreferencesUpdated` (category scope) ». C'est le
`guard` qui n'a pas suivi la scission, pas la documentation qui manquait.

Le chemin conversation, lui, ne perdait rien : il arrive par
`ConversationStoreSocketBridge` → `ConversationStore.applyRemote` →
`observeStore()` → `mergeUserStateFromStore`. Le sink était donc mort **et**
redondant — ce qui explique que personne ne l'ait remarqué, et ce qui rendait
son coût réel invisible : il faisait paraître le canal BRANCHÉ.

### Trois témoins verts gardaient le chemin mort

`ConversationListViewModelTests` poussait
`UserPreferencesUpdatedEvent(category: "conversation", conversationId: "conv1")`
— une forme que le décodeur de production **ne peut pas produire sur ce
publisher**. Trois assertions vertes, sur un sink que le fil ne pouvait plus
atteindre.

C'est la même faille de méthode que la note web sur `bridge: undefined` (« un
payload construit à la main porte la clé ; sur le fil la question ne se pose
pas ») : **un témoin qui fabrique sa charge utile peut prouver un chemin que le
fil ne peut pas emprunter.**

## Ce qui change

| site | ce qui change |
|---|---|
| `UserPreferencesManager` | troisième déclencheur : `observeRemotePreferenceBroadcast()`, câblé dans `init()` à côté des deux autres ; `namesUserLevelCategory` (décision pure) ; `remoteRefreshCoalescingWindow` |
| `ConversationListViewModel` | le sink mort est retiré, remplacé par la note qui dit pourquoi il ne pouvait plus s'exécuter et où va désormais ce scope |
| `UserPreferencesManagerTests` | +8 témoins (scope, câblage, regroupement, veto d'écho, garde d'authentification) |
| `ConversationListViewModelTests` | les trois témoins du chemin mort remplacés par UN témoin des deux moitiés du contrat réel |

### Pourquoi une RELECTURE, et non une application de charge utile

L'événement ne porte aucune valeur : le gateway émet `{ userId, category }`.
C'est une INVALIDATION, exactement comme côté web
(`queryClient.invalidateQueries`). Le geste est donc `fetchFromBackend()`,
réutilisé **tel quel** — il porte déjà les trois politiques que ce chemin doit
respecter : la garde d'authentification, le veto `pendingCategories` (via
`applyRemote`) et « un échec réseau ne remet rien à zéro ».

### Pourquoi le veto n'a pas eu à être écrit

Le cycle 132 a dû inventer son veto (`hasDeliverable`) parce qu'Android n'en
avait pas. iOS en avait déjà un, pour la même raison et sous une autre forme :
`pendingCategories` + `shouldApplyRemote`, posés pour empêcher un
`fetchFromBackend()` de foreground d'écraser une édition locale en attente.

L'écho — le gateway renvoie au compte ÉMETTEUR la diffusion déclenchée par son
propre PATCH — est **exactement** la course que ce veto garde, arrivée par une
porte de plus. Un témoin dédié le tient sur ce chemin-là aussi
(`test_remoteBroadcast_echoOfOwnPendingEdit_doesNotUndoTheGesture`) : c'est la
règle du cycle 132 (« une relecture qui gagne la course contre l'écriture locale
qu'elle double ANNULE un geste de l'utilisateur ») vérifiée, pas re-implémentée.

### Pourquoi un regroupement de 300 ms

`DELETE /me/preferences` émet **une fois par catégorie effacée** — sept
événements pour un geste — et il n'existe pas de `GET` par catégorie
(`PreferenceServiceProviding` n'expose que `getAllPreferences()`). Sans fenêtre,
une remise à zéro globale coûtait sept lectures complètes. La fenêtre garantit
en prime que la lecture part APRÈS le dernier événement de la rafale.

### Pourquoi `namesUserLevelCategory` exige un nom CONNU

Le scope conversation est déjà routé ailleurs, donc `conversationId == nil` est
vrai en production sur ce publisher : la seconde condition (le `category` tombe
dans les sept `PreferenceCategory`) pourrait passer pour redondante. Elle ne
l'est pas. Un nom hors des sept gelés — charge fabriquée, gateway plus récent,
scope à venir — n'est pas une raison de relire sept blocs. **On exige que le nom
soit reconnu plutôt que de faire confiance à l'absence d'un champ voisin** : la
première formulation vieillit avec le contrat, la seconde avec le décodeur.

## Gates

| gate | résultat |
|---|---|
| `UserPreferencesManagerTests` (+8) | les sept noms du gateway déclenchent ; un scope conversation ne déclenche pas (même quand son `category` porte par hasard un nom user-level) ; un nom inconnu ne déclenche pas ; une diffusion relit ET applique ; sept événements ⇒ UNE lecture ; l'écho d'un geste en attente ne le défait pas ; non authentifié ⇒ aucune lecture |
| `ConversationListViewModelTests` (−3 morts, +1) | une diffusion de scope catégorie ne déplace aucune ligne, ET la même ligne suit bien le store — les deux moitiés dans un seul témoin, donc l'assertion négative ne peut pas passer pour une bonne raison |
| `sdk-tests.yml` / `ios.yml` | délégués à CI (macOS) — aucun toolchain Swift dans ce conteneur, mesuré à nouveau (`which swift swiftc xcodebuild` : rien). Les deux workflows sont déclenchés par ce lot (`packages/MeeshySDK/**` et `apps/ios/**`) |
| gateway / web / Android | **non modifiés** — aucun contrat de fil touché ; ce lot n'ajoute qu'un abonné à un événement qui existe déjà et voyage déjà |

## Suivi MESURÉ

- **La NSE lit un miroir que seul le processus de l'APP rafraîchit.** Ce lot
  raccourcit la fenêtre de péremption (une diffusion reçue app ouverte écrit
  désormais le miroir App Group), il ne la ferme pas : application tuée, aucun
  processus n'écoute, et `NSEPreferencesGate` sert la dernière valeur écrite. La
  garde qui compte dans ce cas est **serveur** — c'est elle qui décide de ne pas
  pousser. Mesurer que les deux gardes disent la même chose (et laquelle prime)
  est un lot à part, et il vaut pour les trois plateformes.
- **Les trois témoins de décodage de `UserPreferencesUpdatedEvent`**
  (`MessageSocketMiscEventTests`, `category: "pin" | "mute" | "reaction"`)
  décrivent une charge que le gateway n'émet pas : le scope conversation ne
  porte pas de `category` du tout, et le scope catégorie n'en porte que sept
  noms. Ils testent la TOLÉRANCE du décodeur, ce qui est légitime, mais leurs
  valeurs entretiennent le modèle mental faux qui a produit ce cycle. Les
  ré-ancrer sur des charges réelles est un lot de propreté, sans défaut de
  justesse.
- **`ConversationListViewModel` reste à 2505 lignes**, très au-delà du budget
  800–1100. Ce lot en RETIRE, il n'en ajoute pas ; le découpage par
  responsabilité reste à faire et n'appartient pas à un lot de synchronisation.
