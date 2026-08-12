# Iteration 196 — `apps/web/services/users.service.ts` : trois helpers (`getDisplayName`, `getDefaultAvatar`, `getLastSeenFormatted`/`formatLastSeenLabel`) réimplémentent localement des SSOT existants et en ont divergé → nom vide affiché, initiales-avatar cassées sur emoji, libellé « en ligne » désaccordé de la pastille de présence

## Protocole (démarrage)
`main` @ `648572dc` (derniers merges : #2280 android/auth content-language picker ;
#2279 gateway/email + web/v2 normalize language codes SSOT — itération **195** ;
#2277 android/auth proceed-gate core). Branche `claude/brave-archimedes-7qww1c`
réinitialisée sur `origin/main`. Ce cycle prend **196**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install`.

PRs ouvertes au démarrage : #2278 (iOS story timeline stickers), #2275/#2276
(swarm iOS a11y `laughing-thompson`), #2269 (CI iOS release ANDP) — toutes gérées
par d'autres swarms, **non touchées** (aucune ne concerne la surface TypeScript
de cette itération).

Sélection : **Priorité 1 (continuité du thème SSOT-convergence 190-195)**. Les
itérations 190-195 ont unifié la normalisation des **codes de langue** sur un
seul SSOT (`normalizeLanguageCode`, `flags.ts`, `getLanguageColor`,
`EmailService.normalizeLanguage`). Cette itération applique la **même doctrine
de convergence** à une **classe de helpers différente** — l'affichage
d'utilisateur (nom, initiales, présence) — où `users.service.ts` réimplémente
trois SSOT déjà existants et en a **silencieusement divergé**, produisant trois
défauts utilisateur réels.

## Current state

`apps/web/services/users.service.ts` porte trois copies locales de logique
canonique existante, chacune ayant divergé de sa source unique :

### 1. `getDisplayName` (l.217) — fuite d'un nom vide / non-`trim`
```ts
getDisplayName(user: User): string {
  if (user.displayName) {                    // truthiness brute
    return user.displayName;                  // pas de trim
  }
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}
```
SSOT : `apps/web/utils/user-display-name.ts` → `getUserDisplayName` garde avec
`user.displayName && user.displayName.trim()` et **retourne la valeur trimmée**,
retombant sur firstName+lastName quand le displayName est blanc.

- **Input défaillant** : `{ displayName: '   ', firstName: 'Jean', lastName: 'Dupont' }`
  → copie locale rend `'   '` (nom vide à l'écran) ; canonique rend `'Jean Dupont'`.
- **Input défaillant** : `{ displayName: ' Bob ' }` → copie locale rend `' Bob '`
  (espaces parasites) ; canonique rend `'Bob'`.
- **Blast radius** : `hooks/v2/use-profile-v2.ts:293` (nom de profil),
  `components/admin/agent/UserDisplay.tsx:69`, et alimente les initiales avatar
  ci-dessous.

### 2. `getDefaultAvatar` (l.274) — initiales cassées sur emoji + incohérence multi-mot
```ts
const initials = this.getDisplayName(user)
  .split(' ')
  .map(word => word.charAt(0))               // charAt = unité UTF-16
  .join('').toUpperCase().slice(0, 2);
```
SSOT : `apps/web/utils/initials.ts` → `getInitials`, écrit **spécifiquement**
pour découper par point de code Unicode (`[...word]`) et jamais par
`charAt(0)`.

- **Input défaillant** : displayName `'🎨 Studio'` → `'🎨'.charAt(0)` renvoie la
  demi-paire de substitution isolée `'\uD83C'` → glyphe cassé `�` dans l'avatar
  (exactement le bug que `getInitials` documente et prévient).
- **Incohérence** : `'John Paul Jones'` → copie locale rend `'JP'` (2 premiers
  mots) ; canonique `getInitials` rend `'JJ'` (1ᵉʳ + dernier, convention
  Telegram/Discord/Slack) → le même nom affiche des initiales **différentes**
  selon le composant d'avatar (SVG fallback vs `avatar-utils`/`getInitials`).
- **Blast radius** : rendu de l'avatar SVG de secours (méthode publique du
  service).

### 3. `getLastSeenFormatted` / `formatLastSeenLabel` (l.228 / l.243) — libellé désaccordé de la pastille + math de jour élapsé
```ts
getLastSeenFormatted(user, options) {
  if (user.isOnline) { return options.t('status.online'); }   // isOnline brut
  return this.formatLastSeenLabel(user.lastActiveAt, options);
}
formatLastSeenLabel(lastActiveAt, options) {
  const diffDays = Math.floor(diffHours / 24);                 // jours élapsés
  // ... status.minutesAgo / hoursAgo / daysAgo / toLocaleDateString
}
```
SSOT : `apps/web/utils/presence-format.ts` → `formatPresenceLabel`, qui
1. dérive « en ligne » de la **règle de présence canonique partagée**
   (`getUserPresenceStatus`, `packages/shared/utils/user-presence.ts`) — gardée
   contre un `isOnline` **périmé** — donc le libellé s'accorde toujours avec
   `presenceColorClass` (la pastille) ;
2. utilise une math de **jour calendaire** (`calendarDayDiff`) avec les clés
   i18n `status.lastSeenYesterday` / `lastSeenBeforeYesterday` / `lastSeenDateTime`
   (heure exacte incluse), contrat partagé avec iOS `RelativeTimeFormatter`.

- **Input défaillant (label ≠ dot)** : `{ isOnline: true, lastActiveAt: il y a 10 min }`
  → `getLastSeenFormatted` rend `status.online`, mais la pastille rendue à côté
  (`presenceColorClass` → `getUserPresenceStatus`) traite le `isOnline` périmé
  comme `away`/`offline`. Le libellé dit « en ligne », le point dit « absent ».
- **Input défaillant (jour calendaire)** : dernière activité hier 23:00, vu
  aujourd'hui 01:00 → copie locale rend `status.hoursAgo (2)` ; canonique rend
  `status.lastSeenYesterday` (« Vu hier à 23:00 »).
- **Clés i18n** : les clés canoniques `status.lastSeen*` **existent déjà** dans
  les 4 locales (`locales/{en,fr,es,pt}/contacts.json:40-44`), et les deux
  appelants (`hooks/v2/use-profile-v2.ts:169` via `useI18n('contacts')`,
  `components/v2/ContactLastSeenLabel.tsx:32`) sont **dans le namespace
  `contacts`** → migration transparente, aucune clé à ajouter.
- **Blast radius** : `ContactLastSeenLabel` (rendu dans `ContactCard`),
  page profil (`use-profile-v2`).

## Root causes
Trois helpers écrits avant (ou en parallèle de) l'extraction des SSOT
`user-display-name.ts`, `initials.ts`, `presence-format.ts`, jamais recâblés
dessus. Chaque SSOT a depuis reçu des durcissements (trim/blank-guard, découpe
Unicode, règle présence partagée + math calendaire) que les copies locales
n'ont pas suivis → dérive silencieuse.

## Business / Technical impact
- **Business** : nom vide au profil (`'   '`), avatar avec glyphe cassé pour les
  ~% d'utilisateurs dont le displayName commence par un emoji (produit
  social/chat), libellé de présence contredisant visuellement la pastille juste
  à côté (perte de confiance sur la donnée « en ligne »).
- **Technical** : trois SSOT court-circuités = dette de cohérence ; toute
  évolution future de la règle de présence / des initiales doit être répliquée à
  la main dans `users.service.ts` (fragilité).

## Risk assessment
**Faible.** Refactor de délégation pur : chaque helper appelle désormais son
SSOT. Aucune signature publique ne change. Les clés i18n canoniques existent
déjà dans les 4 locales sous le namespace utilisé par les deux appelants. Les
tests unitaires existants encodent l'**ancien** comportement bugué (ex.
`status.minutesAgo`, `'JP'`) → ils sont mis à jour pour asserter le comportement
canonique (nouvelle vérité SSOT), avec ajout de cas couvrant explicitement les
inputs défaillants ci-dessus (displayName blanc, nom emoji, isOnline périmé,
bascule cross-minuit).

## Proposed improvements
1. `getDisplayName` → `getUserDisplayName(user, user.username)` (SSOT
   `user-display-name`).
2. `getDefaultAvatar` → initiales via `getInitials(getUserDisplayName(...))`
   (SSOT `initials`).
3. `getLastSeenFormatted` / `formatLastSeenLabel` → `formatPresenceLabel(...)`
   (SSOT `presence-format`), en propageant `isOnline` (pour `getLastSeenFormatted`)
   et en laissant `isOnline` indéfini pour l'API `formatLastSeenLabel` autonome
   (comportement canonique : online = activité < 60 s).

## Expected benefits
- Nom d'affichage jamais vide ni non-trimmé.
- Initiales avatar cohérentes partout, Unicode-safe (plus de `�`).
- Libellé de présence toujours accordé à la pastille ; math de jour calendaire +
  heure exacte alignée sur iOS.
- Trois SSOT re-câblés, dette de cohérence supprimée.

## Implementation complexity
**Faible** — 1 fichier de production (`users.service.ts`), 3 imports SSOT
ajoutés, ~40 lignes supprimées ; 1 fichier de test mis à jour + cas ajoutés.

## Validation criteria
- `apps/web` : `users.service.test.ts` vert (cas anciens mis à jour + nouveaux
  cas défaillants).
- Aucune régression sur `use-profile-v2.test.tsx`, `ContactLastSeenLabel.test.tsx`.
- `tsc` (web) sans nouvelle erreur.
