# Iteration 50 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique des initiales (string) — F26c-a » : créer un canonique testé
`apps/web/utils/initials.ts` → `getInitials(name, fallback='?')` (strip `@`, mot unique 2 car.,
multi-mot 1er+dernier, null/crash-safe, uppercase), puis converger les **7** réimplémentations
locales string-based vers ce canonique.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] `packages/shared` `dist/` + prisma client générés.
- [ ] Baseline : nouvelle suite `__tests__/utils/initials.test.ts` RED puis GREEN.

## Étapes (RED → GREEN → converger)

### Phase A — Canonique + suite de tests
- [ ] `__tests__/utils/initials.test.ts` (RED) : couvre vide/null/`@`-strip/mot unique 2 car./
      multi-mot 1er+dernier/3-mots/whitespace/uppercase/fallback custom.
- [ ] `apps/web/utils/initials.ts` (GREEN) :
      ```ts
      export function getInitials(name: string | null | undefined, fallback = '?'): string {
        const cleaned = (name ?? '').replace(/^@+/, '').trim();
        const parts = cleaned.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return fallback;
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      ```

### Phase B — Converger les 7 appelants string (familles A1–A7)
- [ ] `app/(connected)/contacts/page.tsx:51` (A1) → import + suppression du local (zéro changement).
- [ ] `app/(connected)/me/page.tsx:44` (A2) → import (fallback `'?'`).
- [ ] `components/feed/ReelPlayer.tsx:26` (A3) → remplacer `initials()` local par `getInitials`.
- [ ] `components/common/bubble-message/MessageReadStatusDetails.tsx:16` (A4) → import.
- [ ] `components/auth/PhoneExistsModal.tsx:196` (A5) → import (supprime closure).
- [ ] `components/video-call/CallNotification.tsx:45` (A6) → import (supprime closure).
- [ ] `components/admin/agent/UserDisplay.tsx:69` (A7) → import.

### Phase C — Vérification & livraison
- [ ] `jest __tests__/utils/initials.test.ts` → vert.
- [ ] Suites web jest des composants touchés (s'il en existe) vertes.
- [ ] `tsc --noEmit` web : aucune nouvelle erreur sur les fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-q6i1lx` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-b : famille B `getUserInitials` (B1 canonique 25-tests, B2 doublon, B3/B4) → dériver du nom
  résolu ; réécriture de la suite avatar-utils → lot dédié iter 51.
- F26c-c : famille C (widgets dashboard preview, `Avatar` 1 lettre) → intention distincte.
- F26b, F25b, F24b, F2, F10, F21.

## Continuité
Iter 51 : **F26c-b** (famille `getUserInitials` → `getInitials(getUserDisplayName(user,''), '??')`,
suppression du doublon `utils/user.ts`, réécriture des attentes de la suite avatar-utils) ; sinon
F26c-c (widgets), F26b, ou nouveau scout (slug/url, sanitize, date-relative).

## Incidents de merge (parallélisme multi-agents)
- À surveiller : un commit parallèle pourrait réintroduire une copie locale d'initiales. En cas de
  conflit, restaurer la délégation au canonique `utils/initials.ts`.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `apps/web/utils/initials.ts` (`getInitials(name, fallback='?')`) + suite dédiée
      `__tests__/utils/initials.test.ts` **17/17** (RED→GREEN).
- [x] Phase B — 7 appelants convergés (A1 `contacts/page`, A2 `me/page`, A3 `ReelPlayer`,
      A4 `MessageReadStatusDetails`, A5 `PhoneExistsModal`, A6 `CallNotification`,
      A7 admin `UserDisplay`). Aucune définition locale orpheline ; usages intacts.
- [x] Phase C — web jest complet **425/425 suites, 10797 pass** ; `tsc --noEmit` : **aucune**
      nouvelle erreur sur les fichiers source touchés (erreurs `UserDisplay.test.tsx` préexistantes,
      mocks user incomplets, hors périmètre) ; commit + push + PR + merge squash.
