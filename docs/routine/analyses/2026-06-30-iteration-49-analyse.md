# Iteration 49 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 48 (« Source unique de la validation d'email web — F25a + dernière horloge inline »,
mergée dans `main` : PR #1146 / squash `e4f0aa0d`). Le magic-link et `xss-protection` délèguent au
canonique RFC 5322 ; la dernière horloge inline web délègue à `formatClock`.

La continuité iter 48 désignait **F25b** (façade de validation téléphone). Le scout iter 49 l'a
réévaluée puis a trouvé un cluster SSOT plus **net et plus sûr** : la duplication de
`getUserDisplayName`.

## Triage F25b (téléphone) — reporté à nouveau

Les deux validateurs web ont des **contrats incompatibles** :
- `apps/web/utils/phone-validator.ts` : `validatePhoneNumber(phone: string)` — regex simple `/^(\+|00)?\d+$/`, longueur 8-15, **sans pays**.
- `apps/web/utils/phone-validation-robust.ts` : `validatePhoneNumber(phone, countryCode)` — `libphonenumber-js`, **country-aware**, retourne E.164/national/international.

Le simple accepte des numéros que le robuste rejette (et inversement). Unifier = **changement de
comportement**, pas une dédup byte-identique. Confirmé **reporté** (façade à concevoir, lot dédié).

## Cartographie — `getUserDisplayName` (cluster SSOT retenu)

Source de vérité canonique : `apps/web/utils/user-display-name.ts` → `getUserDisplayName(user, fallback?)`
(+ `getUserDisplayNameOrNull`). Priorité documentée et **couverte par une suite de tests**
(`apps/web/__tests__/utils/user-display-name.test.ts`) :
`displayName(trim) > firstName+lastName(trim) > username(trim) > fallback` (défaut `'Utilisateur inconnu'`).

| # | Emplacement | Priorité | Fallback | Verdict |
|---|-------------|----------|----------|---------|
| Canonique | `utils/user-display-name.ts` | displayName > nom > username | `'Utilisateur inconnu'` (param) | **SSOT** |
| R1 | `lib/avatar-utils.ts:66` (exporté, importé 5×) | displayName > nom (+ firstName-seul / lastName-seul) > username | `'Utilisateur inconnu'` | **équivalent** au canonique (les branches firstName-seul/lastName-seul sont couvertes par `` `${f} ${l}`.trim() ``) ; canonique ajoute `trim` → **strictement plus correct aux bords** |
| R2 | `lib/contacts-utils.ts:3` (exporté) | displayName > nom > username | (aucun final ; type garantit username) | **même priorité** ; canonique ajoute `trim` du displayName → plus correct |
| — | `utils/user.ts:17` | **firstName+lastName D'ABORD** > displayName > username | `username` | **divergent** (ordre) — hors périmètre |
| — | `components/conversations/steps/MemberSelectionStep.tsx:24` | displayName > **username** > firstName > lastName | `'Unknown User'` | **divergent** (username avant nom) — hors périmètre |
| — | `components/v2/FriendRequestCard.tsx:28` (local) | displayName > nom > username | `'?'` | même priorité, fallback distinct — candidat futur (composant, fallback `'?'`) |
| — | `app/(connected)/contacts/page.tsx:59` (local `userDisplayName`) | displayName > nom > username | `''` | même priorité, fallback distinct — candidat futur |

### Pourquoi R1/R2 sont sûrs (byte-identiques en usage réel)

- **R1 `avatar-utils`** : pour tout utilisateur réel, la sortie est identique au canonique. Les
  branches « firstName seul » / « lastName seul » d'avatar-utils sont exactement couvertes par le
  canonique `` `${firstName} ${lastName}`.trim() `` (firstName seul → `"John"`, lastName seul →
  `"Doe"`). Même fallback `'Utilisateur inconnu'`. La seule différence est aux **bords** : le
  canonique ignore un `displayName` blanc (whitespace) là où avatar-utils le renverrait tel quel —
  **strictement plus correct** (même garde que la règle Prisme `formatClock`). Couvert par la suite
  de tests du canonique (12+ cas dont trim/whitespace) + les 5 importeurs d'avatar-utils.
- **R2 `contacts-utils`** : même priorité ; le canonique ajoute le `trim` du displayName. Le type de
  R2 garantit `username` non vide → la priorité 3 du canonique le renvoie avant tout fallback.

## Décision iter 49 — lot « Source unique du nom d'affichage utilisateur (F26) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `lib/avatar-utils.ts` : `getUserDisplayName` délègue au canonique `utils/user-display-name.ts` (signature inchangée) | Dédup ; byte-identique en usage réel, +correct aux bords ; 5 importeurs intacts |
| B | `lib/contacts-utils.ts` : `getUserDisplayName` délègue au canonique | Dédup ; même priorité, +trim |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26b | `getUserDisplayName` divergents (`utils/user.ts` name-first, `MemberSelectionStep` username-first) + copies locales (`FriendRequestCard` `'?'`, contacts `''`) | MOYEN | Ordres/fallbacks distincts ; décision produit sur la priorité canonique avant bascule |
| F26c | `getInitials` (7 réimplémentations web divergentes : fallback `'?'` vs `''`, 1 vs 2 car. mot unique, strip `@`) | MOYEN | Sémantiques divergentes ; normaliser = décision produit + tests par composant |
| F25b | Validateurs téléphone (simple regex vs libphonenumber country-aware) | MOYEN | Contrats incompatibles ; façade à concevoir |
| F24b | `formatFileSize` locale-aware gateway FR | FAIBLE | Change l'arrondi de contenu push visible |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit sémantique + backfill |

## Gain estimé global
Source unique du **nom d'affichage utilisateur** : les 2 réimplémentations exportées au niveau `lib/`
(`avatar-utils`, `contacts-utils`) délèguent au canonique testé `utils/user-display-name.ts`. Sortie
byte-identique en usage réel, strictement plus correcte aux bords (trim displayName), comportement
d'affichage cohérent à travers tous les importeurs. Couvert par la suite de tests du canonique +
web jest.
