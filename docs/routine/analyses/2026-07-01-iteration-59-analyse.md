# Iteration 59 — Analyse d'optimisation (2026-07-01)

## Contexte
Routine exécutée en parallèle multi-agents. `main` (`2261ca0f`) a intégré iter 58 (F26c-c(c),
profil public → `getUserInitials`, PR #1131) et iter 58bis (F27, classification temps relatif).
Reprise sur base à jour (`git fetch` + `checkout -B origin/main`).

## Constat — RÉGRESSION confirmée sur la famille contacts (F26c-c(b))
Un balayage `grep "DisplayName(...).slice(0,2)"` sur `apps/web` révèle que les **5 composants
contacts convergés en iter 57** (PR #1181, `getUserInitials`) ont **régressé** vers la troncature
brute `getUserDisplayName(x).slice(0, 2).toUpperCase()` :

| Fichier | Ligne |
|---------|-------|
| `components/contacts/ContactsList.tsx` | 91 |
| `components/contacts/tabs/PendingRequestsTab.tsx` | 76 |
| `components/contacts/tabs/ConnectedContactsTab.tsx` | 89 |
| `components/contacts/tabs/AffiliatesTab.tsx` | 68 |
| `components/contacts/tabs/RefusedRequestsTab.tsx` | 77 |

### Cause racine (bad-merge multi-agents)
`git log` sur ces fichiers : le dernier commit les touchant est **`88bc5c71`**
(« feat(sdk): RelativeTimeFormatter.lastSeenString (Lot 6 iOS) ») — un commit **iOS/SDK** qui,
via une résolution de merge sur base périmée, a **supprimé** l'`import { getUserInitials }` et
**réécrit** `getUserInitials(x)` → `getUserDisplayName(x).slice(0, 2).toUpperCase()` dans les 5
fichiers. Diff vérifié (`git show 88bc5c71 -- apps/web/components/contacts/`).

### Pourquoi c'est une vraie régression (pas cosmétique)
`slice(0,2)` du nom affiché produit de **fausses initiales** : « John Doe » → « JO » au lieu de
« JD ». Le canonique `getUserInitials` (`@/lib/avatar-utils`) dérive du nom résolu
(`resolveDisplayName`) via `getInitials` (mot unique → 2 car., multi-mot → 1ʳᵉ+1ʳᵉ du dernier).
La régression a **réintroduit dans les contacts** exactement le défaut qu'iter 57 avait corrigé,
et **rompt la cohérence produit** (admin iter 56, profil iter 58 utilisent `getUserInitials`).

## Décision iter 59 — lot « Restaurer la convergence initiales contacts (anti-régression F26c-c(b)) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Restaurer les 5 composants contacts sur `getUserInitials` (reverse-apply exact de la portion contacts de `88bc5c71`) | Vraies initiales ; cohérence produit rétablie |

Restauration **exacte** : `git show 88bc5c71 -- apps/web/components/contacts/ | git apply -R`
(reverse-apply propre vérifié), soit +import + `getUserInitials(x)` dans les 5 fichiers — état
identique à iter 57 (mergé vert). Aucun test ne rend ces composants (verrou de sortie absent,
constat iter 57 reconduit).

## Leçon consignée (process)
Un commit d'un **autre domaine** (iOS/SDK) peut, par merge sur base périmée, **écraser** une
convergence web déjà mergée. Renfort process : au-delà de « repartir de `origin/main` », **ré-auditer
les familles SSOT déjà traitées** (un simple `grep` du motif anti-pattern) à chaque itération —
une convergence « faite » peut avoir régressé.

## Consignés pour itérations futures
- **F26c (reste)** : `AdminLayout.tsx:239` `(user.displayName||user.username).slice(0,2)` →
  `getUserInitials(user)` (user object) ; troncatures sur **chaînes de titre** (conversation/
  communauté : `ConversationSettingsModal`, `conversation-utils`, `ConversationsWidget`,
  `CommunitiesWidget`) → nécessitent un canonique `getInitials(string)`, cluster distinct.
- **F25b** (validateurs téléphone), **F2** (`SOCKET_LANG_FILTER`, staging), **F10**
  (`conversationId` scalaire/index, backfill), **F21** (sémantique, backfill).

## Gain estimé global
Régression UX corrigée : les 5 écrans contacts réaffichent de **vraies initiales** cohérentes avec
le reste du produit, via la source unique `getUserInitials`. Changement purement de présentation,
sans impact réseau/DB. Restauration exacte de l'état iter 57 (mergé vert).
