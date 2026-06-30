# Iteration 50 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 49 (« Source unique du nom d'affichage utilisateur — F26 », mergée dans `main` :
PR #1147 / `e58689ae`). Les 2 réimplémentations exportées de `getUserDisplayName` au niveau `lib/`
(`avatar-utils.ts`, `contacts-utils.ts`) délèguent désormais au canonique testé
`apps/web/utils/user-display-name.ts`.

La continuité iter 49 désignait **F26b** (display-name divergents) ou **F26c** (`getInitials`,
réimplémentations divergentes). Le scout iter 50 a cartographié le cluster `getInitials` et confirme
qu'il est **plus large et plus net** que prévu : c'est la cible retenue.

## Cartographie — `getInitials` (cluster SSOT retenu)

Aucun canonique **string-based** n'existe. Il y a deux familles d'« initiales » :

### Famille A — string-based `getInitials(name: string)` (réimplémentations locales)

| # | Emplacement | Strip `@` | Mot unique | Multi-mot | Fallback vide | Crash-safe |
|---|-------------|:---------:|------------|-----------|---------------|:----------:|
| A1 | `app/(connected)/contacts/page.tsx:51` | ✅ | **2 car.** (`slice(0,2)`) | 1er+**dernier** | `'?'` | ✅ (`filter(Boolean)`) |
| A2 | `app/(connected)/me/page.tsx:44` | ✅ | 1 car. | 1er+2e | `'?'` | ✅ |
| A3 | `components/feed/ReelPlayer.tsx:26` | ❌ | 1 car. | 1er+2e | `'?'` | ✅ |
| A4 | `components/common/bubble-message/MessageReadStatusDetails.tsx:16` | ❌ | 1 car. | 2 premiers mots | `''` | ✅ |
| A5 | `components/auth/PhoneExistsModal.tsx:196` | ❌ | 1 car. | ≤2 (tous mots) | `''` | ⚠️ (`n[0]` sur `''`) |
| A6 | `components/video-call/CallNotification.tsx:45` | ❌ | **2 car.** (`substring(0,2)`) | 1er+2e | — (pas de garde) | ❌ (`parts[0][0]` sur `''`) |
| A7 | `components/admin/agent/UserDisplay.tsx:69` | ❌ | 1 car. | ≤2 (tous mots) | `''` | ✅ |

**Verdict** : sémantiques divergentes (mot unique 1 vs 2 car. ; multi-mot 1er+2e vs 1er+dernier ;
strip `@` ; fallback `'?'` vs `''` ; sûreté sur chaîne vide). A1 (`contacts/page`) est **la plus
robuste** : strip `@`, crash-safe, 1er+dernier mot, 2 car. pour mot unique, fallback `'?'`.

### Famille B — user-object `getUserInitials(user)` (hors périmètre iter 50)

| # | Emplacement | Mot unique | Note |
|---|-------------|------------|------|
| B1 | `lib/avatar-utils.ts:9` (canonique de fait, **25 tests**) | 1 car. | firstName/lastName d'abord, puis displayName, username ; fallback `'??'` |
| B2 | `utils/user.ts:32` (**doublon silencieux, non testé**, 3 importeurs) | 2 car. | diverge de B1 sur mot unique |
| B3 | `app/search/SearchPageContent.tsx:226` (local) | 1 car. | dérive de `getUserDisplayName(user)` |
| B4 | `app/signup/affiliate/[token]/page.tsx:68` (closure) | 1 car. | fallback `''` |

### Famille C — title-preview / single-letter (intention distincte)

| # | Emplacement | Note |
|---|-------------|------|
| C1 | `components/dashboard/ConversationsWidget.tsx:52` | `title.slice(0,2)` **non word-aware** (preview titre) |
| C2 | `components/dashboard/CommunitiesWidget.tsx:49` | `name.slice(0,2)` **non word-aware** |
| C3 | `components/v2/Avatar.tsx:35` | `name.charAt(0)` — **1 seule lettre** (design assumé) |

## Décision iter 50 — lot « Source unique des initiales (string) — F26c-a »

Décision produit (état de l'art, alignée sur Telegram/Discord/Slack et sur A1 déjà la plus robuste) :

> Canonique `getInitials(name, fallback = '?')` :
> - strip `@` en tête, `trim`, `split(/\s+/)`, `filter(Boolean)` ;
> - aucun mot → `fallback` ;
> - **1 mot → 2 premières lettres** (`slice(0,2)`) ;
> - **multi-mot → 1ʳᵉ lettre du 1er + 1ʳᵉ lettre du dernier mot** ;
> - toujours `toUpperCase()`, null/undefined-safe.

C'est exactement la sémantique de A1 (`contacts/page`), généralisée (fallback paramétrable +
null-safety). Établir ce canonique = **un avatar d'initiales cohérent partout** + crash-safety +
strip `@` uniforme.

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `apps/web/utils/initials.ts` : `getInitials(name, fallback='?')` + suite de tests dédiée | Nouveau SSOT testé (RED→GREEN) |
| B | Converger les 7 appelants string (A1–A7) vers le canonique | Dédup ; comportement unifié ; crash-safety + strip `@` partout |

### Churn visible assumé (documenté, déterministe)
- **Mot unique 1→2 car.** pour A2, A3, A4, A5, A7 (ex. `alice` → `AL` au lieu de `A`) — plus
  informatif, conforme à l'état de l'art. A1/A6 déjà 2 car.
- **Multi-mot ≥3 mots** : passe à 1er+dernier mot (ex. `A B C` → `AC`). Cas rare. A1 déjà ainsi.
- **Fallback `''`→`'?'`** pour A4, A5, A7 (nom vide) — affiche `?` au lieu d'un avatar blanc.
- **Crash-safety** ajoutée pour A5, A6 (nom vide ne plante plus).
- **Strip `@`** ajouté pour A3, A4, A5, A6, A7 (cohérence avec A1/A2).
- Cas commun « Prénom Nom » → `XY` : **inchangé** pour les 7.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-b | Famille B (`getUserInitials`) : unifier B1/B2/B3/B4 en dérivant les initiales du nom résolu (`getInitials(getUserDisplayName(user,''), '??')`) ; supprimer le doublon B2 | MOYEN | Réécriture des attentes de la suite 25-tests `avatar-utils` (changement de sémantique mot-unique/username/3-mots) → lot dédié |
| F26c-c | Famille C : widgets dashboard (preview titre non word-aware) + `Avatar` (1 lettre) | FAIBLE | Intention distincte (preview/mono-lettre) ; décision produit séparée |
| F26b | `getUserDisplayName` divergents (`utils/user.ts` name-first, `MemberSelectionStep` username-first) + copies locales | MOYEN | Ordres/fallbacks distincts ; décision produit |
| F25b | Validateurs téléphone (regex simple vs libphonenumber) | MOYEN | Contrats incompatibles ; façade à concevoir |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain estimé global
Source unique des **initiales d'avatar (string)** : les 7 réimplémentations locales délèguent à un
canonique testé `utils/initials.ts`. Comportement d'initiales **unifié, crash-safe, strip-`@`
cohérent** à travers tout le produit ; fallback standardisé `'?'`. Couvert par une suite de tests
dédiée + web jest des composants touchés.
