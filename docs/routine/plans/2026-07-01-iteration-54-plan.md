# Iteration 54 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Suppression du module mort `utils/user.ts` (clôture cluster `getUserDisplayName`) — F26b-b » :
supprimer le module mort (aucun importeur de production), son test, et les 2 `jest.mock` morts qui
le référencent.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Audit exhaustif : aucun `from '@/utils/user'` en production ; 3 hits seulement (test + 2 mocks).

## Étapes

### Phase A — Suppression du dead code
- [ ] `rm apps/web/utils/user.ts` (module mort, 8 exports injoignables).
- [ ] `rm apps/web/__tests__/utils/user.test.ts` (teste le module supprimé).

### Phase B — Nettoyage des mocks morts (obligatoire : `jest.mock` d'un module inexistant échoue)
- [ ] `__tests__/components/conversations/invite-user-modal.test.tsx` : retirer le
      `jest.mock('@/utils/user', …)` (l.58).
- [ ] `__tests__/components/settings/user-settings.test.tsx` : retirer le `jest.mock('@/utils/user', …)` (l.98).

### Phase C — Vérification & livraison
- [ ] `jest` sur les 2 suites composant → vertes (elles tournaient déjà avec le vrai `getUserInitials`).
- [ ] `grep -rn "@/utils/user'" apps/web` → plus aucun hit.
- [ ] `tsc --noEmit` web : aucune nouvelle erreur.
- [ ] Commit + push `claude/sharp-wozniak-kekt10` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-d (initiale MemberSelectionStep), F26c-c, F25b, F2, F10, F21.

## Continuité
Iter 55 : nouveau scout hors cluster nom/initiales (cluster `getUserDisplayName` clos). Pistes :
F26c-c (widgets dashboard preview + `Avatar` mono-lettre), F26c-d (initiale via charAt), ou nouveau
domaine (slug/url, sanitize, date-relative, validateurs).

## Incidents de merge (parallélisme multi-agents)
- Si un commit parallèle réintroduit un import de `@/utils/user`, re-cibler vers les canoniques
  (`utils/user-display-name`, `lib/avatar-utils`, `utils/language-utils`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `utils/user.ts` (module mort, 8 exports, ~180 lignes) + `__tests__/utils/user.test.ts`
      supprimés.
- [x] Phase B — 2 `jest.mock('@/utils/user', …)` morts retirés (`invite-user-modal.test.tsx`,
      `user-settings.test.tsx`).
- [x] Phase C — `grep '@/utils/user''` : **0 hit** ; jest 2 suites **62/62** (tournent avec le vrai
      `getUserInitials`) ; `tsc --noEmit` web : **aucune** erreur liée au module supprimé ; commit +
      push + PR + CI + merge.
