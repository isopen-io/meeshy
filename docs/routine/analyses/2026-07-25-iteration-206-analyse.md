# Iteration 206 — Classification auth cassée (`isUserAnonymous`) + divergence du Prisme sur le suivi de lecture (`ConversationView`)

## Protocole (démarrage)

`main` @ `4f0e4080` (dernier commit : ios/i18n italien & arabe langues d'interface).
Branche `claude/brave-archimedes-e9ir8b` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` OK. `packages/shared/dist` reconstruit
via `tsc` (le jest web mappe `@meeshy/shared/(.*)` → `packages/shared/dist/$1`, requis
par `user-language-preferences` et `consumed-language`).

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2304** (Android sharelink guest-join) — hors surface TypeScript.
- **#2275** (iOS a11y StatusComposerView) — hors surface TypeScript.

Aucune PR ouverte ne touche `apps/web/utils/auth.ts` ni
`apps/web/components/conversations/ConversationView.tsx` → zéro risque de conflit.

## Sélection : deux défauts **correctness + Single Source of Truth** (couche web)

Cette itération combine deux correctifs indépendants, sans fichier partagé :

1. Le **candidat prioritaire** explicitement légué par l'itération 205 (backlog) :
   `isUserAnonymous`, heuristique cassée.
2. Une découverte topique (audit du swarm read-exactness + i18n) : le chemin
   « langue réellement affichée » de `ConversationView` diverge du SSOT du Prisme.

---

## Défaut 1 — `apps/web/utils/auth.ts:isUserAnonymous`

### Current state (avant correctif)

```ts
const hasAnonymousProperties = user.hasOwnProperty('sessionToken') ||
                              user.hasOwnProperty('shareLinkId') ||
                              user.hasOwnProperty('isAnonymous');   // ← présence, pas valeur
// ...
const hasAnonymousId = !!(user.id && (
  user.id.startsWith('anon_') ||
  user.id.includes('anonymous') ||
  user.id.length > 20                                              // ← heuristique cassée
));
```

### Problems identified — DEUX bugs de la même classe

1. **`user.id.length > 20`** : un ObjectId Mongo fait **24** caractères hex (cf.
   CLAUDE.md « IDs are MongoDB ObjectIds (24-char hex strings) »), un UUID 36.
   La clause est donc **toujours vraie pour un utilisateur inscrit** → tout compte
   enregistré est classé anonyme. Le test `auth.test.ts` figeait le bug avec un id
   de **20** caractères exactement — la seule longueur qui échappe à la clause.

2. **`hasOwnProperty('isAnonymous')`** : le gateway émet `isAnonymous: false` sur
   l'objet user inscrit (`AuthHandler.ts:181,220` ; `SocketUser`). `hasOwnProperty`
   renvoie `true` dès que la propriété **existe**, même valant `false` → deuxième
   voie de mauvaise classification pour un inscrit.

### Root causes

Détection par forme approximative (longueur, présence de clé) au lieu de signaux
explicites (préfixe `anon_`, session anonyme active, `isAnonymous === true`).

### Business / Technical impact

`isUserAnonymous` est **exporté** et consommé par `isCurrentUserAnonymous`
(`hooks/use-landing-auth.ts`). Le bug est aujourd'hui *masqué* dans l'unique
consommateur par un garde `hasAuthToken` en amont, mais la fonction reste un
landmine pour tout futur consommateur (purge de state anonyme, gating de route).

### Proposed improvements (implémenté)

- Retrait de la clause `id.length > 20`.
- `isAnonymous` testé sur sa **valeur** (`=== true`).
- `sessionToken` / `shareLinkId` : test de présence via `!== undefined` (ces
  champs n'existent QUE sur l'objet de compatibilité anonyme du gateway) —
  `shareLinkId: ''` reste détecté.

### Validation criteria

- 2 nouveaux tests RED→GREEN : (a) inscrit avec ObjectId 24 hex → `false` ;
  (b) inscrit portant `isAnonymous: false` → `false`. Les deux échouaient avant.
- 32/32 `auth.test.ts` verts ; 106/106 sur `auth` + `auth-manager` + `app/page`.

---

## Défaut 2 — `ConversationView.tsx` : suivi de lecture qui ignore la `deviceLocale`

### Current state (avant correctif)

```ts
const preferredLanguages = useMemo(
  () => [
    currentUser.systemLanguage,
    currentUser.regionalLanguage,
    currentUser.customDestinationLanguage,
  ].filter((code): code is string => Boolean(code)),
  [ /* 3 champs in-app */ ]
);
```

### Problems identified

Cette liste faite main pour le **suivi de lecture exact** (`useSeenMessages` →
`resolveConsumedLanguage`) s'arrête à 3 champs et **omet la 4e priorité du Prisme
étendu, `deviceLocale`**. Elle ne **normalise pas** non plus les codes (`pt-BR`
resterait tel quel). Le SSOT est `getUserLanguagePreferences(user)`
(`utils/user-language-preferences.ts`), qui délègue à `resolveUserLanguagesOrdered`
avec injection `deviceLocale` — exactement l'ordre utilisé pour résoudre le **texte**
affiché (`resolveUserPreferredLanguage`). Les deux chemins divergeaient.

### Root cause

Réimplémentation locale d'une règle qui a une source unique — précisément
l'anti-pattern que `resolveConsumedLanguage` interdit dans son propre contrat
(« Toute divergence entre cette résolution et celle du texte produirait une
statistique fausse — d'où le miroir strict »).

### Business / Technical impact

Lecteur dont le **seul** signal de langue est la locale appareil (préférences
in-app vides — cas réel post-i18n it/ar) : la bulle affiche la traduction
`deviceLocale`, mais `resolveLanguage` renvoyait `[]` → `resolveConsumedLanguage`
retombait sur l'**original**. Le serveur enregistrait alors `viewedLanguages` et
`languageBreakdown` sur une langue **jamais affichée** — le défaut même que toute
la feature read-exactness / media-views vise à supprimer.

### Proposed improvements (implémenté)

`preferredLanguages` délègue à `getUserLanguagePreferences(currentUser)`.
Dépendance `useMemo` étendue à `currentUser.deviceLocale`. La logique divergente
non testée est **supprimée** au profit d'un SSOT déjà exhaustivement couvert
(deviceLocale 4e priorité inclus, `user-language-preferences.test.ts:365+`).

### Validation criteria

- 2 nouveaux tests composant (mock `useSeenMessages` capturant `resolveLanguage`) :
  (a) prefs in-app vides + `deviceLocale: 'it'` + traduction it → déclare `'it'`,
  pas l'original `'de'` (RED prouvé : renvoyait `'de'`) ;
  (b) `systemLanguage: 'fr'` prime sur `deviceLocale: 'it'` → `'fr'`.
- 37/37 `ConversationView.test.tsx` ; 681/681 sur `utils` + `components/conversations`.
- `tsc --noEmit` : **0 nouvelle erreur** attribuable (les 2 erreurs de
  `ConversationView.tsx` préexistent à l'identique sur `main`).

## Implementation complexity

**Faible** — 2 fichiers de prod, 2 fichiers de test, aucune dépendance nouvelle,
aucune migration. Chaque correctif est atomique et indépendant.

## Risk assessment

Minimal. Défaut 1 : purement plus strict (retire des faux positifs anonymes) ;
l'unique consommateur était déjà protégé par `hasAuthToken`. Défaut 2 : convergence
sur un SSOT testé, aligne le suivi de lecture sur le chemin texte déjà en prod.

## Future improvements (backlog restant)

- **`MessageReadStatusService.freezeMessageStatus`** (gateway, ~l.1122-1141) :
  union de `viewedLanguages` via un `{ push: code }` Prisma brut au lieu du SSOT
  `mergeViewedLanguages` utilisé par les chemins audio/vidéo/image. Un stock legacy
  `'fr-FR'` face à un `code='fr'` échappe au `.includes` non normalisé → doublon
  `['fr-FR','fr']` qui double-compte dans `languageBreakdown`. Edge-case, mais
  vraie divergence de SSOT. **Candidat prochaine itération** (nécessite mock Prisma).
- **`resolveLanguage` n'achemine pas `manualSelection`** : si une bascule
  per-bulle existe côté web, une lecture explicitement basculée serait déclarée
  sous la langue préférée. Lead non confirmé (chemin manual-toggle web à vérifier).
- Backlog 205 restant : `getUserDisplayName` copié-collé ; formatage d'octets inline
  contournant `formatFileSize`.
