# Iteration 210 — `ActiveUsersSection` : nom + initiales réimplémentés inline (ignore `displayName`, exige firstName ET lastName) → convergence sur les SSOT `getUserDisplayName` / `getUserInitials`

## Protocole (démarrage)
`main` @ `f6205382` (dernier commit : `feat(android/sharelink)` #2312). Branche
`claude/brave-archimedes-m9ve2a` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` + `packages/shared` construit via
`tsc` (le jest web mappe `@meeshy/shared/(.*)` → `packages/shared/dist/$1`).

**Audit anti-doublon (PRs ouvertes au démarrage) :**
- **#2311** (iter 209) : convergence `getUserDisplayName` sur 6 sites
  (`messages.service`, `use-contacts-actions`, `invite-user-modal`,
  `link-details-modal`, `conversation-participants`). **`ActiveUsersSection`
  n'y figure pas.**
- **#2309** (iter 208) : `formatFileSize` (`AudioFilePreview`, `AudioRecorderCard`,
  `admin/messages`).
- **#2307** (iter 207) : gateway `MessageReadStatusService`.
- **#2305** (iter 206) : `auth.ts` (`isUserAnonymous`) + `ConversationView`.
- **#2275** : iOS a11y.

Aucune PR ouverte ne touche `components/conversations/details-sidebar/ActiveUsersSection.tsx`
→ zéro conflit de fichier. Cette itération **prolonge la vague de convergence
display-name** (#2311/#2305) sur un **site distinct non couvert**, avec sa
**suite de tests dédiée déjà existante**.

## Sélection : **Priorité — correctness + Single Source of Truth (résolution de nom & initiales, sidebar)**

`ActiveUsersSection` (liste des utilisateurs actifs dans la sidebar de détails de
conversation) réimplémente inline la résolution du **nom d'affichage** ET des
**initiales d'avatar**, avec **deux défauts de correctness** de la classe déjà
corrigée ailleurs (transform-conversation, modales de création).

## Current state (avant correctif)

`apps/web/components/conversations/details-sidebar/ActiveUsersSection.tsx` :

```tsx
// ligne 42 — initiales de l'avatar
{(user.firstName || user.username || 'U').charAt(0).toUpperCase()}
...
// lignes 47-49 — nom affiché
{user.firstName && user.lastName
  ? `${user.firstName} ${user.lastName}`
  : user.username}
```

SSOT disponibles et testés à côté :
- `apps/web/utils/user-display-name.ts` → `getUserDisplayName` (priorité
  **displayName > firstName+lastName > username**), testé.
- `apps/web/lib/avatar-utils.ts` → `getUserInitials(user)` / `getUserDisplayName(user)`
  (initiales dérivées du **nom résolu canonique**, découpe Unicode-safe), testé.

## Problems identified

1. **`displayName` (priorité 1 du SSOT) jamais consulté — nom.** Un utilisateur
   qui possède un `displayName` mais pas de `firstName`/`lastName` s'affiche avec
   son **`username` brut** (souvent cryptique) — exactement la divergence que
   `getUserDisplayName` existe pour supprimer.
2. **Garde `firstName && lastName` trop stricte — nom.** Elle **exige les deux
   champs** : un utilisateur avec seulement un `firstName` (cas fréquent) retombe
   sur `username` au lieu d'afficher son prénom. Le SSOT retourne
   `` `${firstName} ${lastName}`.trim() `` dès que **l'un** est présent.
3. **`displayName` jamais consulté + une seule lettre — initiales.** La ligne 42
   prend `.charAt(0)` de `firstName || username` : ignore `displayName`, produit
   **1 initiale** au lieu de 2, et **diverge du nom affiché** (l'initiale peut
   venir du username alors que le nom affiché vient d'ailleurs). Le SSOT
   `getUserInitials` dérive 2 initiales du **nom résolu**, donc initiales et nom
   restent toujours cohérents.

## Root causes

Composant présentationnel écrit avant/à côté de la consolidation des SSOT
display-name (`utils/user-display-name`, `lib/avatar-utils`). La résolution
inline « firstName sinon username » est un raccourci qui marche sur les comptes
au profil complet (firstName+lastName renseignés), masquant le défaut sur les
comptes à `displayName`-seul ou `firstName`-seul.

## Business impact

Sidebar de détails de conversation, section « utilisateurs actifs » : chaque
participant sans `firstName`+`lastName` complet s'affiche sous un **username
cryptique** et une **initiale unique tronquée**, incohérente avec son nom rendu
partout ailleurs dans l'app (bulles de message, listes, badges) qui, eux, passent
par le SSOT. Rupture de cohérence visuelle de l'identité utilisateur.

## Technical impact

- `ActiveUsersSection.tsx` : la résolution nom + initiales délègue aux SSOT
  (`getUserDisplayName`, `getUserInitials` de `@/lib/avatar-utils`). L'`alt` de
  l'`AvatarImage` (jusqu'ici `user.firstName`, potentiellement `undefined`) passe
  au nom résolu → meilleur a11y, un seul calcul réutilisé.
- −6 lignes de logique inline dupliquée. Aucun changement d'API/schéma/i18n.

## Risk assessment

**Faible.** Web-only, un composant présentationnel isolé, aucune PR ouverte sur
ce fichier. Le comportement ne change **que** sur les chemins buggés
(`displayName`-seul, `firstName`-seul) ; les comptes firstName+lastName complets
rendent le nom identique (`"${firstName} ${lastName}"`). Les initiales passent de
1 à 2 caractères issus du nom résolu — amélioration cohérente, couverte par test.

## Proposed improvements (implémenté)

1. Import `getUserDisplayName`, `getUserInitials` depuis `@/lib/avatar-utils`.
2. Ligne 42 → `{getUserInitials(user)}`.
3. Lignes 47-49 → `{displayName}` (nom résolu, calculé une fois par ligne map).
4. `alt={displayName}` sur `AvatarImage`.

## Expected benefits

- Fin du `username` cryptique et de l'initiale unique tronquée dans la sidebar ;
  nom + initiales **cohérents** avec le reste de l'app.
- −1 réimplémentation inline de la résolution de nom ; toute évolution future de
  la priorité display-name se propage automatiquement à ce site.

## Implementation complexity

**Triviale** — 1 composant, 2 substitutions + 1 import, 3 tests de régression
ajoutés à la suite dédiée existante.

## Validation criteria

- 3 nouveaux tests `ActiveUsersSection.test.tsx` verts (RED prouvé avant fix) :
  `displayName`-seul rend le displayName (pas le username) ; `firstName`-seul rend
  le prénom (pas le username) ; initiales = 2 lettres du nom résolu (`AW`).
- Les 5 tests de présence existants restent verts sans modification.
- Aucune nouvelle erreur `tsc` sur le fichier modifié.

## Future improvements (backlog restant)

- **`conversation-item/conversation-utils.tsx:getConversationNameOnly`** (lignes
  18-23) : ordre **username-first** (`displayName || username || firstName+lastName`)
  — bug d'ordonnancement de la classe déjà corrigée dans `transform-conversation.ts`.
  Complication : `getOtherParticipantUser()` retourne `unknown` → un cast au trust
  boundary est requis. Même bug dans `ConversationItem.tsx:getSenderName` (~196-200).
- **`utils/v2/transform-conversation.ts:120`** : `otherUser?.systemLanguage ||
  otherUser?.regionalLanguage || 'fr'` court-circuite le SSOT
  `resolveUserPreferredLanguage` (omet `customDestinationLanguage` + `deviceLocale`).
  Suite de tests dédiée déjà existante.
- **`getUserDisplayName` (`utils/user-display-name.ts`)** : `getUserDisplayName`
  peut déléguer `getUserDisplayNameOrNull(user) ?? fallback` (micro-dedup interne).
