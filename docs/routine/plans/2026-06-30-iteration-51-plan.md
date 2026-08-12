# Iteration 51 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique des initiales (objet) — F26c-b » : faire dériver `getUserInitials(user)`
du **nom résolu canonique** via `getInitials(getUserDisplayName(user,''),'??')`, supprimer le
doublon B2 (`utils/user.ts`), converger B3/B4, et réécrire les attentes de la suite
`avatar-utils` (nouvelle sémantique unifiée).

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent ; postinstall prisma KO réseau, sans impact web jest).
- [x] Baseline : `avatar-utils.test.ts` + `initials.test.ts` → 53/53.

## Étapes (RED → GREEN → converger)

### Phase A — Canonique objet + réécriture des attentes
- [ ] `__tests__/lib/avatar-utils.test.ts` (RED) : réécrire les attentes des cas modifiés
      (mot unique 2 car., displayName-first, 3-mots 1er+dernier, username 2 car.) + le bloc
      « Priority order verification » → nouvelle sémantique. Conserver les cas inchangés (JD,
      null→`??`, sender-less→`??`, unicode CN).
- [ ] `lib/avatar-utils.ts` (GREEN) :
      ```ts
      import { getInitials } from '@/utils/initials';
      export function getUserInitials(user: User | null | undefined): string {
        return getInitials(resolveDisplayName(user, ''), '??');
      }
      ```
      (`resolveDisplayName` déjà importé ; `getMessageInitials` inchangé délègue à `getUserInitials`.)

### Phase B — Supprimer le doublon B2 + rediriger
- [ ] `utils/user.ts` : supprimer `export function getUserInitials`.
- [ ] Rediriger les 3 importeurs vers `@/lib/avatar-utils` :
      `components/conversations/invite-user-modal.tsx`, `components/settings/user-settings.tsx`,
      `app/u/page.tsx`.

### Phase C — Converger B3/B4
- [ ] `app/search/SearchPageContent.tsx` : supprimer le `getInitials(user)` local ; importer
      `getUserInitials` ; remplacer l'appel `getInitials(user)` (l.503) par `getUserInitials(user)`.
- [ ] `app/signup/affiliate/[token]/page.tsx` : supprimer la closure `getInitials()` ; importer
      `getUserInitials` ; l'appel (l.126) devient `getUserInitials(inviter)` (fallback `??` → la
      garde `|| <User/>` reste neutralisée car `getUserInitials` ne renvoie jamais vide ; ajuster
      le rendu pour afficher l'icône quand `inviter` absent — déjà géré par `!inviter`).

### Phase D — Vérification & livraison
- [ ] `jest __tests__/lib/avatar-utils.test.ts __tests__/utils/initials.test.ts` → vert.
- [ ] `tsc --noEmit` web : aucune nouvelle erreur sur les fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-kekt10` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26c-c (famille C widgets/Avatar), F26b (`getUserDisplayName` divergents), F25b, F2, F10, F21.

## Continuité
Iter 52 : **F26c-c** (widgets dashboard preview non word-aware + `Avatar` 1 lettre — décision
produit) ou **F26b** (`getUserDisplayName` locaux `SearchPageContent`/`affiliate`/`MemberSelectionStep`
→ canonique) ; sinon nouveau scout (slug/url, sanitize, date-relative).

## Incidents de merge (parallélisme multi-agents)
- Si un commit parallèle réintroduit une copie locale d'initiales objet, restaurer la délégation
  à `getUserInitials` (avatar-utils) qui dérive du canonique.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `lib/avatar-utils.ts` `getUserInitials` délègue à
      `getInitials(resolveDisplayName(user,''),'??')` ; attentes `avatar-utils.test.ts` réécrites
      (mot-unique 2 car., displayName-first, 3-mots 1er+dernier, username 2 car., bloc « Priority
      order verification » refondu). Type du paramètre dérivé du résolveur canonique
      (`Parameters<typeof resolveDisplayName>[0]`) — pas de `User` étroit, pas de cast. **Bonus
      pureté** : `getMessageInitials` narrowé au trust boundary (2 erreurs tsc pré-existantes
      supprimées).
- [x] Phase B — doublon B2 (`utils/user.ts getUserInitials`) supprimé ; 3 importeurs redirigés
      (`invite-user-modal`, `user-settings`, `app/u/page`) ; bloc de tests B2 retiré de
      `utils/user.test.ts`.
- [x] Phase C — B3 (`SearchPageContent`, closure locale supprimée) et B4 (`affiliate/[token]`,
      closure + import `User` lucide mort supprimés) convergés sur `getUserInitials`.
- [x] Phase D — jest **144/144** sur les 5 suites touchées (`avatar-utils`, `initials`, `user`,
      `invite-user-modal`, `user-settings`) ; `tsc --noEmit` web : **aucune nouvelle** erreur sur
      les fichiers touchés (2 corrigées) ; commit + push + PR + CI + merge.
