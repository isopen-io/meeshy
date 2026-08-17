# Cycle 55 — la question de la leçon 215, posée à l'ORDRE de la liste

## 0. La voie, et pourquoi ce n'est toujours pas IOS_DETTE

`tasks/lane-cursor.md` est à `lane=ANDROID android_streak=0
last_run=mediasessioncoordinator-try-optional-logging`. Comme au cycle 54-bis,
l'environnement d'exécution est un conteneur Linux sans Xcode ni toolchain Swift
(`which xcodebuild swift` → rien) : les deux gates obligatoires du couloir iOS
sont inexécutables ici, et livrer du Swift non compilé serait un diff non prouvé.

Voie retenue : le couloir temps réel, sur une surface entièrement gatable ici
(web, jest + tsc). Le curseur reste intact pour le prochain run disposant d'un
Xcode.

## 1. D'où vient la piste

La leçon 215 (cycle 54-bis) énonce une règle et un point de vue :

> Elle demande de partir du RENDU et de remonter vers les écrivains, pas de
> partir d'un écrivain et de regarder ce qu'il touche.
>
> Corollaire opérationnel : une réponse à une telle question doit toujours être
> écrite comme un TABLEAU de sites avec la colonne du critère.

Les cycles 53 et 54 l'ont posée au TEXTE de la ligne de liste. Ce cycle-ci la
pose à l'autre moitié de ce que la liste rend, celle qu'aucun cycle n'avait
encore instruite : son **ORDRE**.

## 2. Le constat

### 2.1 Ce que la liste trie, et où chaque critère vit

`ConversationList` délègue à `useConversationSorting`, qui adapte chaque
conversation en `SectionableConversation` avant de passer la loi partagée
`sortConversations` (pinned → live → catégorie/`orderInCategory` → `lastMessageAt`).
Les critères ne viennent pas du même endroit :

| Critère de tri | Lu dans | Peuplé par |
|---|---|---|
| `isPinned` | `preferencesMap` (store Zustand) | `initialize()` + socket |
| `categoryId` | `preferencesMap` | `initialize()` + socket |
| `orderInCategory` | `preferencesMap` | `initialize()` + socket |
| `lastMessageAt` | `Conversation` (React Query) | `message:new`, `conversation:updated`, … |
| ordre d'AFFICHAGE des groupes | `categories[]` (store Zustand) | `initialize()` **seul** |

`useConversationPreferences` — le hook que `ConversationList` monte — lit les deux
premières colonnes dans le **store Zustand**, jamais dans React Query.

### 2.2 Les écrivains temps réel, et ce qu'ils atteignent VRAIMENT

| Événement | Charge utile | Routé vers | Atteint le rendu ? |
|---|---|---|---|
| `user:preferences-updated` (scope conversation) | snapshot complet | `applyRemotePreferences` (store) | **oui** |
| `user:preferences-reordered` | `updates[]` | `notifyCategory` → `invalidateQueries(preferences.categories())` | **non** |
| `category:created` | `category` | idem | **non** |
| `category:updated` | `category` | idem | **non** |
| `category:deleted` | `categoryId` | idem | **non** |
| `categories:reordered` | `updates[]` | idem | **non** |

Cinq des six événements qui décrivent l'ORGANISATION de la liste n'arrivaient
nulle part. Deux défauts distincts, et ils se cachaient l'un l'autre.

### 2.3 Premier défaut — un événement qui PORTE une charge, souscrit sans elle

`PreferencesSyncService` déclarait `notifyCategory = () => this.categoryChangedListeners.forEach(l => l())` :
un écouteur de type `() => void`. `user:preferences-reordered` y était abonné —
et ses `updates[]` étaient **jetés à l'entrée**, avant même d'atteindre un
consommateur.

Ce n'est pas non plus un événement de catégorie. `reorderConversationPreferences`
(gateway) n'écrit QUE `orderInCategory` sur des lignes
`UserConversationPreferences` ; aucune `UserConversationCategory` n'est touchée.
Le rangement était doublement faux : mauvaise charge, mauvais seau.

Conséquence utilisateur : un glisser-déposer fait sur iOS ou dans un autre onglet
n'atteignait jamais la liste web ouverte. Et la liste tourne sur
`staleTime: Infinity` — l'ordre restait faux **indéfiniment**.

`orderInCategory` est pourtant le SEUL critère de tri que
`user:preferences-updated` n'annonce pas : le gateway émet délibérément un
événement par GESTE de réordonnancement plutôt qu'un `USER_PREFERENCES_UPDATED`
par ligne déplacée (`reorderConversationPreferences`, « No version bump »). Le
chemin dédié était donc le seul chemin — et c'est précisément celui qui ne menait
nulle part.

### 2.4 Second défaut — une invalidation vers un cache sans OBSERVATEUR

`handleCategoryChanged` invalidait `queryKeys.preferences.categories()`. Cette
clé n'a **aucun lecteur en production** : `useCategoriesQuery` (le seul hook qui
la monte) n'est importé que par le baril `hooks/queries/index.ts` et par son
propre fichier de test. `invalidateQueries` sur une requête que personne
n'observe la marque périmée sans déclencher de refetch, et rien ne la relit.

Or la liste rend `categories` depuis le **store Zustand**, dont l'action de
rechargement — `refreshCategories()` — n'avait, elle non plus, **aucun appelant**
(grep exhaustif : le seul appel voisin est `refreshPreferences()`, depuis
`ConversationSettingsModal`).

Les deux faits se recoupent : la liste des catégories était figée sur l'unique
chargement d'`initialize()`, pour toute la durée de l'onglet. Créer, renommer,
supprimer ou réordonner une catégorie sur un autre appareil ne changeait rien.

C'est exactement le motif que `apps/web/CLAUDE.md` documente déjà pour la forme
plate de la liste de conversations — « une dizaine d'écrivains et zéro lecteur,
chaque écriture un no-op silencieux » — réapparu sur l'axe des préférences.

### 2.5 Pourquoi cela avait survécu au correctif de l'épinglage

Le cycle qui a branché `applyRemotePreferences` a répondu à la question « le
pin/mute/archive d'un autre appareil atteint-il l'onglet ouvert ? ». La réponse
était non, il l'a corrigée, et il a eu raison. Mais il a instruit un
ÉVÉNEMENT — `user:preferences-updated` — pas un ÉCRAN. Les cinq autres
événements qui écrivent la même vue étaient hors de son champ, et le seau
`onCategoryChanged` leur donnait l'apparence d'être traités : il existait, il
était abonné, il faisait quelque chose. Ce quelque chose ne se voyait juste
nulle part.

## 3. Le correctif

Trois gestes, un par défaut constaté :

1. **`applyRemoteReorder(updates)`** sur le store — applique `orderInCategory`
   sur chaque ligne connue. **Sans arbitrage de `version`** : l'ordre vit hors du
   chemin versionné (le gateway refuse délibérément de bumper, l'événement n'en
   porte aucune), et le mirroir iOS `ConversationStore.applyRemoteReorder`
   applique lui aussi sans garde. Une conversation sans ligne locale est
   **ignorée, jamais créée** : un ordre seul ne dit rien des dix autres champs, et
   la ligne fabriquée affirmerait des défauts (`isPinned: false`, aucune
   catégorie) que le serveur n'a jamais envoyés — elle sortirait la conversation
   de son groupe pour la jeter dans « non catégorisées ». Même règle que le
   témoin iOS `test_applyRemoteReorder_unknownConversation_skipped`.

2. **`onPreferencesReordered`** — une sortie typée pour
   `user:preferences-reordered`, retirée du seau des catégories. La charge utile
   traverse désormais les quatre couches (service → orchestrateur → façade →
   hook) au lieu d'être perdue à la première.

3. **`handleCategoryChanged` rafraîchit le store** en plus d'invalider la requête.
   L'invalidation est **conservée** : elle reste juste, et un futur lecteur React
   Query en hériterait. C'est le rafraîchissement du store qui manquait, pas
   l'invalidation qui était fausse.

### 3.1 Ce que le correctif ne fait pas

Il ne recalcule rien côté client. `applyRemoteReorder` ne réordonne pas la
liste : il pose la valeur que le serveur annonce, et `sortConversations` — la loi
partagée, déjà en place — en tire l'ordre. La borne est la même que celle du
cycle 54-bis : ne jamais rejouer dans le client une règle qui appartient au
serveur.

## 4. Gates

- **Suite web complète** : **581 suites / 12 459 témoins verts**, 21 ignorés,
  0 échec (`bun x jest`, 122 s).
- **Preuve par mutation, dans les deux sens** — quatre mutations, chacune tuant
  exactement les témoins qui la visent :

  | Mutation | Témoins rouges |
  |---|---|
  | `applyRemoteReorder` neutralisée (no-op) | **5** (4 store + 1 câblage) |
  | `applyRemoteReorder` sur-dosée (crée les lignes inconnues) | **2** |
  | `user:preferences-reordered` remis dans le seau des catégories | **2** |
  | `refreshCategories()` retiré de `handleCategoryChanged` | **1** |

- **`tsc --noEmit`** : **1234 erreurs avant, 1234 après**, et le `comm` des deux
  listes triées ne diffère que par 4 messages dont l'ORDRE des membres d'union
  varie d'un run à l'autre — vérifié en relançant `tsc` deux fois sur l'arbre
  identique, qui reproduit les mêmes 4 diffs. **Zéro erreur nouvelle.**
- **Gardes de dépôt** : `check-law-literals.sh` et `check-swift-viewbuilder.sh`
  verts (self-test inclus).
- **Parité locale** : `prisma generate` (client 6.19.3, binaire épinglé du
  workspace — `npx prisma` résout un Prisma 7.x qui refuse le schéma) +
  `packages/shared` reconstruit avant la campagne (`moduleNameMapper` pointe sur
  `dist/`).
- **ESLint non exécutable dans cet environnement** : le chargement de la config
  échoue (`Converting circular structure to JSON`, eslintrc 3.3.6 sous ESLint
  10.8.0), avant toute lecture de fichier — donc sans rapport avec ce diff. La CI
  le passe en `continue-on-error: true`, comme le type-check.

## 5. Écarté délibérément

**Supprimer `useCategoriesQuery` / `useConversationPreferencesQuery` /
`usePreferencesMap`.** Le constat §2.4 les désigne comme du code mort (aucun
appelant hors baril et tests propres), et les retirer fermerait la classe plutôt
que son instance. Écarté de CE diff : c'est une suppression, pas une correction
de synchronisation, et elle emporte un fichier de test entier. Piste n°1 du
cycle 56, explicitement, plutôt qu'un élargissement silencieux.

**Faire du store la seule source de `categories` en supprimant l'invalidation.**
Deux caches pour une donnée est une dette réelle, mais la trancher demande de
décider LEQUEL survit — décision qui dépasse un correctif de synchronisation.

**Un garde de source interdisant d'abonner un événement typé à un écouteur
`() => void`.** C'est la forme générale du défaut §2.3 et elle mériterait un
verrou mécanique. Écarté faute d'un critère exprimable sans faux positifs : le
seau des catégories, lui, est légitimement sans charge.

## 6. Pistes pour le cycle 56 — repérées, NON livrées

1. **Le code mort des trois hooks de préférences React Query** (§5) — la classe
   dont ce cycle n'a corrigé que l'effet.
2. **`handleMessageDeleted` renonce toujours quand le cache messages est vide**
   (piste des cycles 53/54, intacte). Instruite ce cycle-ci : le jumeau serveur
   la rattrape sur les six transports de suppression, `broadcastMessageMutation`
   émettant `emitConversationPreviewUpdate` sur chacun — le défaut est donc
   transitoire, pas durable. À re-prouver avant d'y consacrer un cycle.
3. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
4. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
5. **Le témoin de source ne couvre qu'un fichier** (piste n°4 du cycle 54-bis) —
   intacte.
