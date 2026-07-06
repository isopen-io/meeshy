# Iteration 53 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 52 (« Source unique du nom d'affichage (déjà displayName-first) — F26b-a », mergée dans
`main` : PR #1159 / `5f95e77e`). Les 4 copies `getUserDisplayName` déjà displayName-first (G1–G4)
délèguent au canonique `utils/user-display-name`.

La continuité iter 52 désigne **iter 53 = F26b-c** : converger les 2 copies **username-first**
(G6/G7) vers le canonique. C'est le dernier sous-cluster à ordre divergent « fixable sans réécrire
de test verrouillé » (G5 name-first reste consigné en F26b-b).

## Baseline runner (parité CI)
- `bun install` OK (postinstall prisma KO réseau, sans impact web jest).
- `create-conversation-modal.test.tsx` : users mockés ont **tous** un `displayName`
  (`john`/`John Doe`, `jane`/`Jane Smith`) → le canonique retourne la même valeur → **tests
  inchangés** au baseline et après convergence.

## Cartographie — sous-cluster username-first

| # | Emplacement | Ordre actuel | Fallback | Usage |
|---|-------------|--------------|----------|-------|
| G6 | `components/conversations/create-conversation-modal.tsx:96` (closure `useEffect`) | `displayName` \|\| **`username`** \|\| `firstName` \|\| `lastName` | `'Unknown User'` | titres auto de conversation |
| G7 | `components/conversations/steps/MemberSelectionStep.tsx:24` (fonction module) | `displayName` \|\| **`username`** \|\| `firstName` \|\| `lastName` | `'Unknown User'` | libellés + initiale d'avatar de la sélection de membres |

### Problème (correctness)
Les deux placent `username` **avant** `firstName`/`lastName`. Pour un utilisateur sans `displayName`
mais avec un vrai nom (`firstName`/`lastName`), l'UI affiche le **handle technique** (`john_doe123`)
au lieu de « John Doe ». Incohérent avec tout le reste du produit (canonique iter 49 :
`displayName` > `firstName+lastName` > `username`) et avec l'état de l'art (Telegram/Discord/Slack
affichent le nom réel, le handle en secondaire).

## Décision iter 53 — lot « Source unique du nom d'affichage (username-first → canonique) — F26b-c »

Converger G6/G7 vers le canonique par **délégation**, fallback `'Unknown User'` préservé :

| Cible | Remplacement |
|-------|--------------|
| G6 `create-conversation-modal` | `resolveDisplayName(user, 'Unknown User')` |
| G7 `MemberSelectionStep` | `resolveDisplayName(user, 'Unknown User')` |

Effet : `displayName` > `firstName+lastName` > `username` > `'Unknown User'`. Le `username`
reste l'avant-dernier recours (comme avant la valeur finale), mais **cesse de supplanter le vrai
nom**. Changement de comportement **borné et bénéfique** (titres auto + sélection de membres
affichent le nom réel), sans régression de test (users mockés ont un `displayName`).

### Note de périmètre
G7 dérive aussi l'initiale d'avatar via `getUserDisplayName(user).charAt(0)` (l.115/179). On ne
touche **pas** cette logique d'initiale ici (elle relèverait de F26c) — seule la source du nom
change ; l'initiale reste la 1ʳᵉ lettre du nom désormais correctement résolu.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26b-b | G5 `utils/user.ts` (name-first : firstName+lastName avant displayName) → canonique + réécriture `utils/user.test.ts` ; 3 importeurs | MOYEN | Flip d'ordre = décision produit + test verrouillé |
| F26c-d | G7 initiale d'avatar via `getUserDisplayName(...).charAt(0)` → `getUserInitials` | FAIBLE | Cosmétique ; lot initiales séparé |
| F26c-c | Famille C : widgets dashboard preview + `Avatar` mono-lettre | FAIBLE | Intention distincte |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain estimé global
Les 2 dernières copies username-first de résolution de nom délèguent au canonique. Les titres auto
de conversation et la sélection de membres affichent désormais le **vrai nom** (correctif UX
cohérent avec tout le produit), et la logique de résolution vit dans une seule fonction. Restent
isolées : G5 (name-first, décision produit F26b-b) et la dérivation d'initiale de G7 (F26c-d).
