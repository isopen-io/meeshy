# Iteration 209 — Résolution du nom d'affichage : 6 réimplémentations inline (dont le bug « undefined undefined ») → convergence sur le SSOT `getUserDisplayName`

## Protocole (démarrage)
`main` @ `9098d9aa` (dernier commit : android/sharelink my-links). Branche
`claude/brave-archimedes-pu8q4q` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` + `packages/shared` construit via
`tsc` (le jest web mappe `@meeshy/shared/(.*)` → `packages/shared/dist/$1`).

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2305** (iteration 206) : web — `utils/auth.ts` (`isUserAnonymous`) +
  `ConversationView.tsx`. **Aucun chevauchement** avec les fichiers ci-dessous.
- **#2307** (iteration 207) : gateway `MessageReadStatusService`. Hors surface.
- **#2309** (iteration 208) : web — `AudioFilePreview`, `AudioRecorderCard`,
  `admin/messages`. **Aucun chevauchement.**
- **#2310** : Android sharelink. Hors surface TypeScript.
- **#2275** : iOS a11y. Hors surface TypeScript.

Cette itération donne suite à la « Future Consideration » explicite des
itérations 205 et 208 (`getUserDisplayName` / résolution de nom dupliquée) et
**pivote** vers un défaut **correctness + Single Source of Truth** dans la
couche d'affichage des noms, sur des fichiers **non touchés** par les PRs ouvertes.

## Sélection : **Priorité — correctness + Single Source of Truth (résolution de nom d'affichage web)**

Le SSOT `getUserDisplayName` (`apps/web/utils/user-display-name.ts`) existe et
est consommé par ~24 sites. Pourtant **6 sites** réimplémentaient la même
intention inline, dont plusieurs avec le **bug « undefined undefined »**.

## Current state (avant correctif)

### Le SSOT — la version correcte
`getUserDisplayName(user, fallback)` : priorité `displayName` (trim, ignore vide)
→ `firstName lastName` (chaque champ trim + garde `|| ''`, jamais « undefined »)
→ `username` (trim) → `fallback`. 41 tests figent ce comportement.

### Les 6 réimplémentations inline

1. **`services/messages.service.ts:222` `getAuthorDisplayName`** — pure, testable :
   ```ts
   if (message.author.displayName) return message.author.displayName;   // ← whitespace-only passe
   return `${message.author.firstName} ${message.author.lastName}`.trim() || message.author.username;
   ```
2. **`components/conversations/invite-user-modal.tsx:176` et `:217`** (2 sites) :
   `user.displayName || \`${user.firstName} ${user.lastName}\`.trim() || user.username`
3. **`components/links/link-details-modal.tsx:378`** :
   `link.creator.displayName || \`${link.creator.firstName} ${link.creator.lastName}\`.trim() || …`
4. **`components/conversations/conversation-participants.tsx:111`** (le pire) :
   `currentUser.displayName || \`${currentUser.firstName} ${currentUser.lastName}\``
   — **ni `.trim()` ni fallback `username`**.
5. **`hooks/use-contacts-actions.ts:37`** — incohérence ironique : la ligne **39
   voisine** appelle déjà `getUserDisplayName(contact)`, mais la 37 réimplémente
   inline pour `currentUser`.

## Problems identified

1. **Bug de correctness réel — « undefined undefined ».** En TypeScript, une
   interpolation `` `${undefined} ${undefined}` `` produit la chaîne littérale
   `"undefined undefined"`. `.trim()` ne retire que les espaces de bord → il reste
   `"undefined undefined"`, **truthy** → affiché à l'utilisateur. Les types
   déclarent souvent `firstName: string` requis, mais les payloads socket/API les
   livrent fréquemment absents à l'exécution (réalité runtime ≠ type). Sites 2-4
   affichent alors « undefined undefined » au lieu de retomber sur `username`.
2. **Bug whitespace `displayName`.** `getAuthorDisplayName` (site 1) retourne un
   `displayName` composé **uniquement d'espaces** (`if (displayName)` — `'   '`
   est truthy), au lieu de retomber sur le nom réel. Le SSOT garde via `.trim()`.
3. **Site 4 sans fallback `username`.** `conversation-participants` construit le
   `displayName` d'un participant sans retomber sur `username` : un `currentUser`
   sans displayName ni prénom produit `" "` (espace) ou « undefined undefined ».
4. **Duplication — 6 copies d'une intention à SSOT existant.** La règle de
   priorité `displayName > firstName lastName > username` est réécrite 6 fois, à
   côté d'un helper dédié déjà importé dans le même fichier (site 5).

## Root causes

Helpers d'affichage écrits inline au fil de l'eau, avant/à côté de
`getUserDisplayName`, en réimplémentant la garde de priorité — en oubliant la
normalisation `|| ''` par champ (site du bug undefined) et la garde `.trim()` sur
`displayName`. Le défaut est masqué en développement car la plupart des comptes
ont un `firstName`/`displayName` bien formé — il n'émerge que sur les payloads
partiels (invités, résultats de recherche, créateurs de lien).

## Business impact

- **Messages** (`getAuthorDisplayName`) : un auteur au `displayName` accidentellement
  composé d'espaces voyait cette valeur vide affichée dans l'en-tête de bulle.
- **Invitation / participants / détails de lien** : « undefined undefined »
  affiché dans les badges d'utilisateurs sélectionnés, la liste de participants
  et la fiche créateur d'un lien — visible et peu professionnel.
- **Titre de conversation 1-à-1** (`use-contacts-actions`) : `"undefined undefined & Bob"`
  possible dans le titre généré.

## Technical impact

- 6 sites recâblés sur `getUserDisplayName`. −10 lignes de logique dupliquée.
- `getAuthorDisplayName` préserve son fallback historique `username`
  (`getUserDisplayName(author, author.username)`), tout en héritant des gardes
  trim/undefined-safe du SSOT.
- Sites 2-5 : substitution mécanique `getUserDisplayName(x)` (fallback SSOT
  `'Utilisateur inconnu'` au lieu d'un `username` potentiellement `undefined` —
  strictement meilleur pour l'affichage).
- Zéro nouvelle erreur `tsc` (baseline projet 1193 avant = 1193 après).

## Risk assessment

**Faible.** Web-only ; aucun schéma/API/migration/clé i18n. Le comportement change
uniquement là où l'ancien code était **buggé** (whitespace displayName, undefined
names, absence de fallback username) — c'est précisément le correctif. Les chemins
bien formés (displayName/prénom présents) sont identiques bit-à-bit. Validé par les
suites existantes des 3 composants (79 tests) + le SSOT (41 tests) sans régression.

## Proposed improvements (implémenté)

1. `messages.service.ts` : `getAuthorDisplayName` → `getUserDisplayName(message.author, message.author.username)`.
2. `invite-user-modal.tsx` (×2) : `getUserDisplayName(user)`.
3. `link-details-modal.tsx` : `getUserDisplayName(link.creator)`.
4. `conversation-participants.tsx` : `getUserDisplayName(currentUser)`.
5. `use-contacts-actions.ts` : `getUserDisplayName(currentUser)` (helper déjà importé).

## Expected benefits

- Fin des affichages « undefined undefined » et des `displayName` vides.
- Fallback `username` garanti là où il manquait (participants).
- −1 classe de duplication ; une source unique pour la priorité d'affichage des
  noms côté web.

## Implementation complexity

**Faible** — 5 fichiers source (2 délégations testables, 3 substitutions de
rendu), 1 fichier de test étendu, 3 imports ajoutés.

## Validation criteria

- `messages.service.test.ts` : +2 tests (RED prouvé : whitespace `displayName`
  → retombe sur `John Doe` ; trim du nom résolu) — 85/85 avec `user-display-name`.
- Suites consommatrices vertes sans modification : `invite-user-modal.test.tsx`,
  `link-details-modal.test.tsx`, `conversation-participants.test.tsx` (79/79).
- Périmètre `__tests__/{services,utils,hooks}` : 194 suites / 4896 tests verts.
- `tsc --noEmit` : 0 nouvelle erreur (1193 = 1193, seuls des décalages de ligne
  dus aux imports insérés).

## Future improvements (backlog restant)

- **`getUserDisplayName` interne** : `getUserDisplayName` pourrait déléguer à
  `getUserDisplayNameOrNull(user) ?? fallback` (−20 lignes, équivalence prouvée
  par les 41 tests existants). Micro-dedup, laissé pour une itération ciblée.
- **Sites déjà `|| ''`-gardés** (`Header.tsx`, `JoinActions.tsx`,
  `join/[linkId]/layout.tsx`, `admin/page.tsx`) : corrects mais verbeux ; polish
  optionnel de convergence SSOT (aucun bug).
- **`use-conversation-creation.ts:48,54`** : ordre de priorité **différent**
  (`displayName || username || firstName || lastName`) — vérifier l'intention
  avant convergence (peut être délibéré pour un titre de groupe).
- **Formatage d'octets en logs/télémétrie** (`useAttachmentUpload`,
  `user-analytics-collector`) : divisions `/1024/1024` inline (backlog #2309).
