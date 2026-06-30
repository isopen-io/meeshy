# Iteration 50 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 49 (« Source unique du nom d'affichage utilisateur — F26 », mergée dans `main` :
PR #1147 / squash `e58689ae`). Les 2 réimplémentations **exportées au niveau `lib/`** de
`getUserDisplayName` (`avatar-utils`, `contacts-utils`) délèguent au canonique testé
`apps/web/utils/user-display-name.ts`.

La continuité iter 49 désignait **F26b** (copies locales + divergents). Le scout iter 50 isole le
**sous-ensemble sûr** de F26b : les copies **locales de composant** à priorité **identique** au
canonique, dont seul le `fallback` diffère — exactement le paramètre que le canonique expose.

## Cartographie — copies locales `getUserDisplayName` (sous-ensemble sûr)

| # | Emplacement | Priorité | Fallback / `!user` | Verdict |
|---|-------------|----------|--------------------|---------|
| R3 | `components/v2/FriendRequestCard.tsx:28` (local `getUserDisplayName`) | displayName > firstName+lastName > username | `'?'` | **même priorité** que le canonique ; fallback `'?'` → `getUserDisplayName(user, '?')` ; +trim |
| R4 | `app/(connected)/contacts/page.tsx:59` (local `userDisplayName`) | displayName > firstName+lastName > username | `''` | **même priorité** ; fallback `''` → `getUserDisplayName(u, '')` ; +trim |

### Pourquoi R3/R4 sont sûrs (byte-identiques en usage réel)

- **R3 `FriendRequestCard`** : `!user → '?'` ; `displayName` ; `` `${firstName||''} ${lastName||''}`.trim() `` ;
  `|| username || '?'`. Le canonique avec `fallback='?'` reproduit exactement : `!user → '?'`, puis
  `displayName.trim()`, `` `${f} ${l}`.trim() ``, `username.trim()`, `'?'`. Différence aux bords
  seulement (canonique trim un `displayName` blanc) → **strictement plus correct**. Appelé 1× (l.58).
- **R4 contacts `userDisplayName`** : `!u → ''` ; `displayName || full || username || ''` (où
  `full = [firstName,lastName].filter(Boolean).join(' ').trim()`). Le canonique avec `fallback=''`
  produit la même sortie (firstName seul → `"John"`, lastName seul → `"Doe"` dans les deux cas).
  Appelé 1× (l.285, `userDisplayName(other) || otherId` — `''` retombe sur `otherId`, comportement
  préservé). +trim displayName.

Aucun test dédié n'assert le comportement laxiste de R3/R4 ; le canonique est couvert par
`__tests__/utils/user-display-name.test.ts` (33 cas).

## Hors périmètre (divergents — décision produit requise)

| # | Emplacement | Divergence | Report |
|---|-------------|-----------|--------|
| F26b-div | `utils/user.ts:17` | **firstName+lastName D'ABORD** (ordre inversé) | décision produit sur la priorité canonique |
| F26b-div | `components/conversations/steps/MemberSelectionStep.tsx:24` | **username avant nom**, fallback `'Unknown User'` | idem |
| F26c | `getInitials` (7 réimplémentations divergentes) | fallback `'?'` vs `''`, 1 vs 2 car. mot unique, strip `@` | normaliser = décision produit + tests par composant |

## Décision iter 50 — lot « Source unique du nom d'affichage utilisateur — copies locales sûres (F26b-safe) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `FriendRequestCard.tsx` : `getUserDisplayName` local supprimé → canonique avec fallback `'?'` | Dédup ; byte-identique en usage réel, +trim |
| B | `contacts/page.tsx` : `userDisplayName` local supprimé → canonique avec fallback `''` | Dédup ; byte-identique en usage réel, +trim |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26b-div | `getUserDisplayName` divergents (`user.ts` name-first, `MemberSelectionStep` username-first) | MOYEN | Décision produit sur la priorité canonique |
| F26c | `getInitials` (7 réimplémentations divergentes) | MOYEN | Décision produit + tests par composant |
| F25b | Validateurs téléphone (regex simple vs libphonenumber country-aware) | MOYEN | Contrats incompatibles ; façade à concevoir |
| F24b | `formatFileSize` locale-aware gateway FR | FAIBLE | Change l'arrondi de contenu push visible |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit sémantique + backfill |

## Gain estimé global
Source unique du nom d'affichage **étendue aux copies locales de composant** à priorité identique :
`FriendRequestCard` et la page contacts délèguent au canonique testé (avec leur fallback respectif).
Après iter 49 (lib/) + iter 50 (composants à priorité identique), seuls restent les **divergents
sémantiques** (`user.ts`, `MemberSelectionStep`) qui nécessitent une décision produit. Sortie
byte-identique en usage réel, +trim aux bords. Couvert par la suite de tests du canonique.
