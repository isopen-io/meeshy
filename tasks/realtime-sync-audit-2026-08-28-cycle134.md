# Cycle 134 — trois déclencheurs, tous ÉPHÉMÈRES : l'absent au moment qui compte n'est rattrapé par personne

Date : 2026-08-28 · Issue : #4214 · Branche : `claude/keen-hamilton-5amvto`

Base : cycle 133 (#4207), dont le « Suivi MESURÉ » nommait ce lot en toutes
lettres. Leçon appliquée : `tasks/lessons.md` § **Leçon 310**, portée d'Android
au web comme elle-même l'annonçait.

## La question reprise du cycle 133

Le cycle 133 a réparé le TRAJET de l'annonce : les trois routes qui annoncent un
changement de préférence atteignent désormais le double Zustand que les bulles
rendent (`DeliveryIndicator`, `FocalRow`, `BubbleMessageNormalView`), et plus
seulement le jumeau React Query que personne ne lit hors des réglages.

Il restait la question de la leçon 310 : **« que se passe-t-il pour celui qui
n'a rien reçu ? »**

## Le défaut

Les trois routes exigent toutes que l'onglet soit **PRÉSENT** pour entendre :

| route | ce qu'elle exige |
|---|---|
| diffusion socket d'un autre appareil | un socket VIVANT **et** `useSocketCacheSync` monté — écrans de conversation seulement |
| `BroadcastChannel` | un autre onglet du même navigateur |
| mutation locale | que le geste soit dans CET onglet |

Un onglet resté ouvert pendant une coupure de socket n'entend donc rien, et
**rien ne rejoue l'annonce manquée** : le bloc reste périmé indéfiniment. Un
abonnement enregistre un écouteur, il ne demande pas d'arriéré.

## Ce qui change

| site | ce qui change |
|---|---|
| `lib/preferences/preference-write-lock.ts` (NOUVEAU) | ce contre quoi une relecture court : les écritures optimistes se DÉCLARENT |
| `lib/preferences/preference-rehydration.ts` (NOUVEAU) | le second déclencheur, PÉRENNE : l'état de connexion |
| `lib/preferences/mirrored-preference-categories.ts` | le veto, sur la relecture ; `rehydrateMirroredPreferences()` |
| `stores/user-preferences-store.ts` | `updatePrivacy` / `updateEncryption` passent par le verrou |
| `stores/store-initializer.tsx` | l'abonnement, monté à l'échelle de l'APPLICATION |

### Pourquoi « pas connecté » ne veut pas dire « décroché »

Mesuré sur `services/socketio/connection.service.ts` : `connect()` émet un
diagnostic `isConnected: false` sur le chemin qui **OUVRE** la connexion
(`isConnecting = true`), et `connect_error` en émet un autre. Un démarrage à
froid voit donc au moins un `false` avant son premier `true`.

Lire ce `false` comme une coupure aurait fait payer à **chaque chargement de
page** une relecture pour zéro fraîcheur de plus — la dimension 2 dit qu'une
requête gratuite est un défaut, pas un détail. Une coupure ne s'observe
qu'APRÈS une connexion : d'où `everConnected`.

### Pourquoi le veto, et pourquoi il vit sur la RELECTURE

`updatePrivacy` et `updateEncryption` appliquent **optimistement** au double
puis envoient. Pendant cette fenêtre, la valeur juste n'existe que localement.

> Une relecture qui gagne la course contre l'écriture locale qu'elle double
> ANNULE un geste : le serveur finit juste, l'écran finit revenu à l'ancienne
> valeur, et aucune annonce ne reste pour le défaire (leçon 310).

Le veto est posé sur `refreshMirroredPreferenceCategory`, donc les **deux**
chemins — l'annonce et le rattrapage — le partagent d'un seul site, exactement
comme la leçon 310 le prescrit. Un COMPTEUR et non un drapeau : deux
interrupteurs basculés coup sur coup se chevauchent.

### Pourquoi `StoreInitializer`, et pas `useSocketCacheSync`

`useSocketCacheSync` n'est monté que par `ConversationLayout` et
`bubble-stream-page` — c'était le second suivi du cycle 133. `StoreInitializer`
enveloppe l'application entière (`app/layout.tsx`) : un changement fait pendant
qu'aucune conversation n'est ouverte est rattrapé quand même.

Trois témoins portent sur ce CÂBLAGE et pas seulement sur le mécanisme — leçon
311 : un déclencheur correct que personne ne monte est indiscernable, dans un
balayage de code, d'un déclencheur qui agit.

## Gates

| gate | résultat |
|---|---|
| `__tests__/lib/preference-write-lock.test.ts` (nouveau, 5) | le verrou tient pendant l'écriture, se libère sur l'ÉCHEC, et compte les écritures chevauchantes |
| `__tests__/lib/preference-rehydration.test.ts` (nouveau, 8) | relit après un décrochage ; **ne relit RIEN** au démarrage à froid nominal ; relit quand aucune passe n'a eu lieu ; ne double pas une hydratation en vol ; un saut motivé par `isLoading` ne CONSOMME pas le décrochage ; une seule relecture par décrochage ; désinscription ; diagnostic vide |
| `__tests__/stores/store-initializer.test.tsx` (nouveau, 3) | l'abonnement est POSÉ à l'échelle de l'application, et retiré au démontage |
| `__tests__/lib/mirrored-preference-categories.test.ts` (+4, 9 au total) | le veto sur les deux chemins ; le rattrapage relit toutes les catégories doublées, et rien d'autre |
| `__tests__/stores/user-preferences-store.test.ts` (+4, 57 au total) | les deux écritures optimistes se déclarent, et libèrent sur refus comme sans jeton |
| `npx jest __tests__/stores __tests__/lib hooks/queries/__tests__` | **86 suites, 1707 témoins verts** (85 suites / 1704 avant les témoins de câblage) |
| `bun run test:coverage` (apps/web, la commande de la CI) | **806 suites, 14795 témoins verts**, 21 sautés — la suite web ENTIÈRE, sous `bun` comme la CI et non sous node |
| `scripts/check-type-debt.sh` (étape BLOQUANTE de la CI) | `✓ 1194 erreurs de types — la dette n'a pas bougé.` — le cliquet du dépôt dit en ses propres termes ce que le comptage brut ci-dessous disait en lignes |
| `tsc --noEmit` (apps/web) | **1787 lignes de diagnostic AVANT comme APRÈS** (mesuré par `git stash`) — aucune erreur ajoutée, et aucune sur les fichiers touchés. Le bruit préexistant est massif et non traité ici. |
| `scripts/check-law-literals.sh` (étape BLOQUANTE de la CI) | `✓ No law literals found in skin files` |
| `eslint` | **toujours non exécutable dans ce conteneur** (`eslint@10` + `eslint-plugin-react@7.37.5` → `contextOrFilename.getFilename is not a function`) — panne préexistante mesurée au cycle 133, déléguée à la CI |
| gateway / iOS / Android | **non modifiés** — aucun contrat de fil touché |

## Suivi MESURÉ

- **`lastSyncedAt` annonce une fraîcheur que le store n'a pas.** `syncAll()`
  absorbe l'échec de chacun de ses quatre `GET` (chaque `sync*` a son propre
  `catch`), donc `initialize()` pose l'horodatage même quand **aucune** lecture
  n'a abouti — et `partialize` le PERSISTE. Conséquence : un onglet ouvert hors
  ligne par un utilisateur qui revient déclare une hydratation qui n'a rien lu,
  et le rattrapage de ce lot ne le distingue pas d'un démarrage nominal. La
  clause « aucune passe » ne couvre donc que le cas SANS JETON au montage. Le
  corriger change le contrat de `syncAll` et de ses témoins : lot à part,
  issue #4217.
- **`syncAll()` lit `/me/preferences/privacy` DEUX fois** au démarrage
  (`syncEncryption` puis `syncPrivacy`) — et le rattrapage de ce lot hérite du
  même doublon. Défaut de performance préexistant, relevé au cycle 133, non
  touché ici.
- **iOS a été mesuré EN PARALLÈLE, pas ici** : le cycle 133 bis (#4201,
  `tasks/realtime-sync-audit-2026-08-28-cycle133-bis.md`) a livré la symétrique
  iOS pendant que ce lot était en cours, et les deux ont été intégrés à la
  fusion. Aucun chemin de code partagé — iOS y ajoute un déclencheur de
  DIFFUSION à un `UserPreferencesManager` qui n'avait que du cycle de vie, là où
  le web ajoute un déclencheur de CONNEXION à un double qui n'avait que des
  annonces. Les deux lots portent le veto de course, chacun avec le sien
  (`pendingCategories` côté iOS, `preference-write-lock` côté web).
  Collision de NUMÉRO de leçon à la fusion : les deux gardées, la nôtre
  renumérotée 313.
