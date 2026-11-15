# Cycle 133 — l'annonce arrivait bien ; elle atterrissait sur le jumeau que personne ne lit

Date : 2026-08-28 · Issue : #4207 · Branche : `claude/keen-hamilton-d5piu9`

Leçon : `tasks/lessons.md` § **Leçon 311**. Base : cycle 132 (#4197), dont le
« Suivi MESURÉ » disait, mot pour mot : *« iOS et web n'ont pas été mesurés sur
cette question »*. Ce cycle a mesuré le web.

## La question reprise du cycle 132

Le cycle 132 cherchait, sur Android, **un magasin local dont l'unique source est
une diffusion**. Portée au web, la question rend une réponse plus embarrassante
que sur Android : la diffusion arrive, elle est décodée, elle est routée — et
elle atterrit sur un exemplaire que **personne ne lit**.

## Le défaut

Le web tient DEUX exemplaires des préférences user-level :

| exemplaire | qui l'écrit | qui le lit |
|---|---|---|
| cache React Query `queryKeys.preferences.category(c)` | `usePreferences(c)` — les écrans de réglages | l'écran de réglages **monté**, et lui seul |
| store Zustand `user-preferences-store` | `initialize()` au montage | **les bulles de messagerie** (`DeliveryIndicator`, `FocalRow`, `BubbleMessageNormalView`) et l'écran de chiffrement |

Les TROIS routes par lesquelles un changement de catégorie s'annonce visaient
toutes le premier :

| route | site | ce qu'elle faisait |
|---|---|---|
| un autre **appareil** | `use-socket-cache-sync.ts`, branche `'category' in data` | `invalidateQueries(preferences.category(c))` |
| un autre **onglet** | `lib/settings-sync.ts` → `handleSyncMessage` | la même invalidation |
| l'onglet **courant** | `usePreferences` → `onSuccess` | `setQueryData` sur la même clé |

Et le second exemplaire — celui que la messagerie REND — n'avait qu'une source :
`initialize()`, appelé une fois au montage de `StoreInitializer` (`useEffect` à
dépendances vides).

Couper « accusés de lecture » laissait donc les coches de livraison en place
**jusqu'à un rechargement complet de la page**. Depuis un autre appareil, depuis
un autre onglet — et depuis **l'écran de réglages du même onglet**, puisque
`PrivacySettings` écrit par React Query et que `DeliveryIndicator` lit le store
Zustand. Le geste le plus direct qu'un utilisateur puisse faire sur cette
préférence était le cas le plus visible du défaut.

Une invalidation ne relit que s'il existe un OBSERVATEUR de la clé. Hors de
l'écran de réglages de la catégorie, il n'y en a aucun : les trois routes
étaient donc, dans le cas nominal, des no-ops complètes.

## Ce qui change

| site | ce qui change |
|---|---|
| `lib/preferences/mirrored-preference-categories.ts` (NOUVEAU) | la règle du double : quelle catégorie est doublée, et comment elle se relit |
| `hooks/queries/use-socket-cache-sync.ts` | la branche catégorie délivre l'annonce au double, après avoir invalidé la clé |
| `lib/settings-sync.ts` | `handleSyncMessage` (autre onglet) **et** `broadcastPreferenceUpdate` (onglet courant) la délivrent aussi |

### Pourquoi la règle vit à un seul site, et les routes n'en savent rien

Les trois routes passent la catégorie **telle quelle** ; c'est
`refreshMirroredPreferenceCategory` qui décide. Écrire la liste des catégories
doublées dans le routeur socket l'aurait mise en trois exemplaires — la forme
exacte du défaut qu'on répare, un étage plus haut.

### Pourquoi `broadcastPreferenceUpdate`, et non un quatrième appel dans `usePreferences`

`BroadcastChannel` **ne délivre jamais à l'émetteur**. L'onglet qui fait le geste
est donc le seul que la route inter-onglets ne couvre pas — et c'est celui de
l'utilisateur. Faire porter la relecture par `broadcastPreferenceUpdate`, déjà
appelé par les deux mutations (`PATCH` et `PUT`) à chaque succès, couvre ce cas
sans ajouter un site d'appel. Témoin dédié : la relecture est due **canal ou
pas** — un navigateur sans `BroadcastChannel` doit voir son propre changement.

### Pourquoi `privacy` seule, et pourquoi elle en relit DEUX

Mesuré : `privacy` est la seule catégorie dont le bloc Zustand a un lecteur hors
des réglages. Le bloc `notifications` du store **n'a aucun consommateur en
production** (l'écran `/notifications/preferences` tient son propre état local,
et `useNotificationPreferences` n'est exporté que par le baril) ; les cinq
autres catégories sont lues à la demande par l'écran qui les affiche. Leur
donner une relecture ici serait une requête de plus pour zéro fraîcheur de plus
— même arbitrage qu'au cycle 132 pour les cinq catégories sans magasin.

`syncPrivacy` et `syncEncryption` sont en revanche deux projections de la MÊME
ligne (`GET /me/preferences/privacy`) : une annonce `privacy` périme les deux,
donc les deux se relisent.

### La course du cycle 132, mesurée ici aussi

Le cycle 132 a posé un veto parce qu'une relecture pouvait **annuler un geste**
resté dans l'outbox. Le web n'a pas d'outbox pour ces écritures : elles sont en
ligne d'abord, et chacune des trois annonces est POSTÉRIEURE à la persistance
(la diffusion est émise par la passerelle après écriture ; `broadcastPreferenceUpdate`
est appelé dans le `onSuccess` de la mutation). Une relecture rend donc toujours
au moins ce que l'écriture qui l'a déclenchée a posé. Aucun veto n'est requis —
et l'écrire quand même aurait été une garde sans sujet.

## Gates

| gate | résultat |
|---|---|
| `__tests__/lib/mirrored-preference-categories.test.ts` (nouveau, 5) | la catégorie `privacy` relit ses DEUX projections ; les six autres ne relisent rien ; un nom inconnu du client ne lève pas ; un échec de relecture ne produit aucun rejet non capturé |
| `__tests__/lib/settings-sync.test.ts` (nouveau, 5) | les deux routes locales — l'autre onglet et l'onglet courant ; `user-updated` ne relit rien ; la relecture est due sans `BroadcastChannel` et sans `initSettingsSync` |
| `hooks/queries/__tests__/use-socket-cache-sync.test.ts` (+3, 54 au total) | la branche catégorie délivre l'annonce, la passe TELLE QUELLE (la règle vit à un seul site), et les scopes conversation / communauté ne relisent aucun double |
| `npx jest __tests__/stores __tests__/lib hooks/queries/__tests__` | 83 suites, 1683 témoins verts |
| `tsc --noEmit` (apps/web) | aucune erreur sur les fichiers touchés (le bruit préexistant des `__tests__` est inchangé) |
| `eslint` | **non exécutable dans ce conteneur** : `eslint@10` + `eslint-plugin-react@7.37.5` lèvent `contextOrFilename.getFilename is not a function` sur N'IMPORTE quel fichier (mesuré sur `lib/utils.ts`, non touché) — panne préexistante, déléguée à la CI |
| gateway / iOS / Android | **non modifiés** — aucun contrat de fil touché ; ce lot ne change qu'un routage côté web |

## Suivi MESURÉ

- **Le web n'a toujours qu'un déclencheur ÉPHÉMÈRE pour ce double.** Ce lot
  répare le trajet de l'annonce ; il ne donne pas au store la seconde source
  PÉRENNE que le cycle 132 a donnée à Android. Un onglet resté ouvert pendant
  une coupure de socket ne reçoit jamais la diffusion, et rien ne la rejoue à la
  reconnexion. `useConnectionStatus` expose déjà la transition — c'est un lot à
  part, et c'est exactement la leçon 310 rejouée sur l'autre client.
- **La route socket n'est montée que sur les écrans de conversation**
  (`useSocketCacheSync` est appelé par `ConversationLayout` et
  `bubble-stream-page`). C'est suffisant pour le symptôme visé — les bulles sont
  sur cet écran — mais un changement fait ailleurs pendant qu'aucune
  conversation n'est ouverte n'atteint le double qu'au prochain montage.
- **`syncAll()` lit `/me/preferences/privacy` DEUX fois** au démarrage
  (`syncEncryption` puis `syncPrivacy`, deux projections d'une seule ligne).
  Défaut de performance préexistant, non touché ici : le fusionner change la
  forme des deux actions et de leurs témoins.
- **iOS n'a toujours pas été mesuré** sur la question du cycle 132.
