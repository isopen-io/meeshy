# Iteration 52 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 51 (« Source unique des initiales d'avatar (objet) — F26c-b », mergée dans `main` :
PR #1158 / `7d960fb2`). La famille `getUserInitials` délègue désormais au pipeline canonique
`getInitials(getUserDisplayName(user,''),'??')`.

La continuité iter 51 désigne **iter 52 = F26b** : unifier les réimplémentations divergentes de
`getUserDisplayName(user)` sur le canonique testé `apps/web/utils/user-display-name.ts` (iter 49 :
`displayName` > `firstName+lastName` > `username`, trim, fallback paramétrable). Scout iter 52
relancé pour cartographier et **classer** le cluster par ordre de résolution.

## Baseline runner (parité CI)
- `bun install` OK (postinstall prisma KO réseau, sans impact web jest).
- Suites concernées vertes au baseline : `use-contacts-filtering.test.ts` (seule des 4 cibles à
  être testée) ; les 3 autres cibles ne sont pas testées.

## Cartographie — `getUserDisplayName(user)` (cluster SSOT)

Canonique (iter 49, testé) : **`displayName` > `firstName+lastName` > `username`**, `trim`, fallback
paramétrable (`'Utilisateur inconnu'` par défaut). Déjà adopté par `lib/avatar-utils.ts` et
`lib/contacts-utils.ts` (délégations).

| # | Emplacement | Ordre de résolution | vs canonique | Fallback | Testé |
|---|-------------|---------------------|:------------:|----------|:-----:|
| G1 | `components/v2/FriendRequestCard.tsx:28` | displayName > firstName+lastName > username | **✅ identique** | `'?'` | ❌ |
| G2 | `hooks/use-contacts-filtering.ts:44` | displayName > firstName+lastName > username | **✅ identique** | `username` | ✅ |
| G3 | `app/u/[id]/page.tsx:250` | displayName > firstName+lastName > username | **✅ identique** | `username`→`'User'` | ❌ |
| G4 | `app/search/SearchPageContent.tsx:222` | displayName > firstName+lastName > username | **✅ identique** | `username` | ❌ |
| G5 | `utils/user.ts:17` | **firstName+lastName > displayName** > username | ❌ name-first | `username` (pas de garde) | ❌ |
| G6 | `components/conversations/create-conversation-modal.tsx:96` | displayName > **username** > firstName > lastName | ❌ username-first | `'Unknown User'` | ❌ |
| G7 | `components/conversations/steps/MemberSelectionStep.tsx:24` | displayName > **username** > firstName > lastName | ❌ username-first | `'Unknown User'` | ❌ |

### Verdict
Deux sous-clusters nets :
1. **G1–G4 : ordre déjà identique au canonique** — seul le *fallback* diffère. Convergence = **dédup
   pur, zéro changement de comportement visible** (le fallback n'est atteint que pour un `username`
   vide, cas inatteignable pour un `User` dont `username` est requis non vide).
2. **G5–G7 : ordre divergent** — G5 place `firstName+lastName` avant `displayName` (name-first) ;
   G6/G7 placent `username` **avant** le vrai nom (username-first). Converger G5–G7 vers le canonique
   **change le nom affiché** (G5 : un `displayName` explicite l'emporterait ; G6/G7 : le vrai nom
   s'afficherait au lieu du `username`). C'est arguablement un correctif (G6/G7 surtout), mais c'est
   un **changement de comportement produit** + G5 est verrouillé par un test asservissant l'ordre
   inverse (`utils/user.test.ts`). → **décision produit dédiée**, hors périmètre iter 52.

## Décision iter 52 — lot « Source unique du nom d'affichage (déjà displayName-first) — F26b-a »

Converger **G1–G4** vers le canonique par **délégation** (le pattern déjà béni pour `avatar-utils`
et `contacts-utils`), en préservant le fallback local exact :

| Cible | Remplacement | Fallback préservé |
|-------|--------------|-------------------|
| G1 `FriendRequestCard` | `resolveDisplayName(user, '?')` | `'?'` (null-safe conservé) |
| G2 `use-contacts-filtering` | `resolveDisplayName(user, user.username)` | `username` |
| G3 `app/u/[id]/page` | `resolveDisplayName(userData, userData.username || 'User')` | `username`→`'User'` |
| G4 `SearchPageContent` | `resolveDisplayName(user, user.username)` | `username` |

La logique de résolution (ordre + trim) vit désormais **exclusivement dans le canonique** ; les
wrappers locaux ne font qu'adapter le fallback. Zéro changement de comportement pour tout `User`
réel.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26b-b | G5 `utils/user.ts` (name-first) → canonique + réécriture `utils/user.test.ts` ; 3 importeurs | MOYEN | Flip d'ordre displayName vs name-first = décision produit + test verrouillé |
| F26b-c | G6/G7 (username-first) → canonique (correctif : affiche le vrai nom) | MOYEN | Changement de comportement (titres auto de conversation, sélection de membres) |
| F26c-c | Famille C : widgets dashboard preview + `Avatar` mono-lettre | FAIBLE | Intention distincte |
| F25b | Validateurs téléphone (regex vs libphonenumber) | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain estimé global
La résolution du nom d'affichage vit dans **une seule** fonction pour 4 surfaces supplémentaires
(carte de demande d'ami, filtrage de contacts, profil public `/u/[id]`, recherche). 4
réimplémentations divergentes de moins ; ordre + trim garantis cohérents ; aucun changement de nom
visible pour les utilisateurs réels. Les 3 copies à ordre divergent sont isolées et documentées pour
une décision produit ultérieure.
