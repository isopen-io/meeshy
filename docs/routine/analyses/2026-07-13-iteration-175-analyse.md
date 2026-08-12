# Iteration 175 — Story/Status : le libellé auteur ignore la SOURCE UNIQUE `getUserDisplayName` (displayName vide → bulle sans nom)

## Protocole (démarrage)
`main` @ `e0027ae` (dernier merge : PR #1899 — android/media ThumbHash encoder).
Branche `claude/brave-archimedes-c7j4ab` réinitialisée sur `origin/main` (0/0).
Ce cycle prend **175** (l'itération **174** est déjà consommée par la PR ouverte
#1901 — gateway/normalize NANP).

PRs ouvertes laissées intactes (périmètres à ne pas toucher) : #1902/#1900
(android/chat), #1901 (`services/gateway/src/utils/normalize.ts`), #1897
(`services/gateway/src/socketio/handlers/ReactionHandler.ts`), #1842 (dependabot
TS 6→7). Aucune ne touche `apps/web/lib/story-transforms.ts` /
`apps/web/lib/status-transforms.ts`.

Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript (web/gateway/shared). Cible retenue par revue d'ingénierie de la
couche de transformation web (chemin chaud — chaque bulle de la StoryTray, du
StoryViewer et de la StatusBar passe par ces mappers).

## Current state
Trois sites de `apps/web/lib/story-transforms.ts` (`postToStoryItem:151`,
`groupToStoryItem:179`, `postToStoryData:315`) et un site de
`apps/web/lib/status-transforms.ts` (`postToStatusItem:44`) résolvaient le nom
affiché de l'auteur par un `??` brut inline :

```ts
name: author?.displayName ?? author?.username ?? 'Unknown',
avatar: author?.avatar ?? undefined,
```

## Problems identified
1. **Bulle sans nom.** `??` ne bascule que sur `null`/`undefined`, jamais sur une
   chaîne **vide** ou **blanche**. Un auteur avec `displayName: ''` (ou `'   '`)
   rendait un libellé de bulle **vide** dans la StoryTray, l'interstitiel du
   StoryViewer et la StatusBar — alors que **toutes** les autres surfaces de
   l'app (avatars, listes de contacts, en-têtes) affichent le `username`.
2. **`<img src="">` parasite.** `author?.avatar ?? undefined` laisse passer une
   chaîne `''` : le rendu émet `<img src="">`, que le navigateur résout en
   **rechargeant l'URL de la page courante** (requête réseau parasite + image
   cassée).
3. **Réimplémentation de règle produit.** Le nom affiché est une décision produit
   déjà centralisée dans `apps/web/utils/user-display-name.ts`
   (`getUserDisplayName`) — qui traite explicitement `displayName` vide/blanc
   comme « non défini » (`user.displayName && user.displayName.trim()`) et
   retombe sur `username`. Ces quatre sites la ré-inlinaient à la main, en
   violation directe du principe **Single Source of Truth** (CLAUDE.md :
   « Each data type has ONE source. No reimplementation »). Leurs voisins de même
   scope (`avatar-utils.ts`, `contacts-utils.ts`) délèguent, eux, correctement.

## Root cause
Un `??` inline exprime « valeur absente = null/undefined », mais la règle métier
du nom affiché est « valeur absente = null/undefined **OU vide/blanc** ». Les
deux ne coïncident pas, et la seule implémentation correcte de cette règle
(`getUserDisplayName`, avec `.trim()`) était contournée. Divergence de patron
entre les mappers story/status et le reste de l'app.

## Business / Technical impact
- **UX** : un contact dont le `displayName` est vide (cas réel : compte migré,
  displayName effacé côté profil) apparaît sans nom dans le carrousel de stories
  et le bandeau de statuts — perte d'identification, incohérence visible avec le
  reste de l'app qui montre le username.
- **Réseau** : `<img src="">` déclenche une requête parasite par bulle concernée.
- **Dette** : 4 copies d'une règle de résolution de nom → dérive garantie à la
  prochaine évolution (priorité firstName/lastName, casse, etc.).

## Risk assessment
Très faible. La **forme retournée est inchangée** (`{ name: string; avatar?:
string }`), donc aucun consommateur (StoryTray/StoryViewer/StatusBar) n'est
impacté. Le seul changement de comportement — `displayName` vide/blanc →
`username`, et avatar `''` → `undefined` — est strictement une amélioration.
`PostAuthor` ne porte ni `firstName` ni `lastName`, donc déléguer à
`getUserDisplayName` n'introduit aucun nouveau chemin de résolution surprise.

## Correctif (TDD)
- **RED** : +7 tests (`__tests__/lib/story-transforms.test.ts` : displayName
  vide/blanc → username, avatar `''` → undefined, pour `postToStoryItem`,
  `groupToStoryItem` — jusqu'ici **non testé** —, `postToStoryData` ;
  `__tests__/lib/status-transforms.test.ts` : idem `postToStatusItem`).
  Vérifié : exactement ces 7 échouent sur le code d'origine (`Received: ""` /
  `Received: "   "`), les 42 existants passent.
- **GREEN** :
  - `story-transforms.ts` — helper local unique `toDisplayAuthor(author)` qui
    délègue le nom à `getUserDisplayName(author, 'Unknown')` et normalise
    l'avatar via `author?.avatar || undefined` ; branché aux 3 sites (dédup).
  - `status-transforms.ts` — même délégation inline sur le site unique.

## Validation criteria
- `__tests__/lib/story-transforms.test.ts` + `status-transforms.test.ts` : 49/49.
- `__tests__/lib` complet : 34 suites, 834 tests verts (2 skipped préexistants).
- `tsc --noEmit` : **0 erreur** sur les fichiers touchés (le bruit baseline
  ~1196 — implicit-any de mocks de test, types générés absents — est préexistant
  et sans rapport).

## Backlog (candidats consignés pour une itération future)
- `packages/shared/utils/participant-helpers.ts:22` — `resolveParticipantAvatar`
  a la MÊME faiblesse chaîne-vide (`participant?.avatar ?? participant?.user?.avatar`
  renvoie `''` au lieu de retomber sur l'avatar de compte), alors que son frère
  SSOT `getSenderUserId` garde bien les chaînes vides. Fichier partagé
  (gateway), suite de tests dédiée — à traiter isolément.
