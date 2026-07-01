# Iteration 59 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique — temps restant avant expiration (F28) » : créer le canonique pur
`formatTimeRemaining(targetMs, nowMs): string | null` dans `@meeshy/shared/utils/time-remaining`
et converger les trois réimplémentations du compte à rebours d'expiration des stories, sans changer
la sortie visible.

## Pré-requis runner (parité CI)
- [x] `bun install` ; `prisma generate` ; `packages/shared` build (dist présent).
- [x] Baseline : tests `timeRemaining` (`story-transforms.test.ts` + extended) verts.

## Étapes (TDD → convergence → vérification)

### Phase A — Canonique shared (RED → GREEN)
- [ ] `packages/shared/__tests__/utils/time-remaining.test.ts` : expiré → `null` ; `< 1 h` → `Xm` ;
      `>= 1 h` avec reste → `XhYm` ; `>= 1 h` sans reste → `Xh` ; cible future/passée ; `now` injecté.
- [ ] `packages/shared/utils/time-remaining.ts` : `formatTimeRemaining(targetMs, nowMs): string | null`.
      `diff = targetMs - nowMs ; if (diff <= 0) return null ; minutes = floor(diff/60000) ;
      hours = floor(minutes/60) ; hours >= 1 → `${hours}h${minutes%60>0?`${minutes%60}m`:''}` ; sinon `${minutes}m``.
- [ ] Export `export * from './time-remaining.js';` dans `packages/shared/utils/index.ts`.
- [ ] `bun run build` shared (dist mis à jour pour les imports web).
- [ ] `vitest run` shared vert.

### Phase B — Convergence des trois sites web
- [ ] `story-transforms.ts` `timeRemaining` → wrapper délégant :
      `formatTimeRemaining(new Date(expiresAt).getTime(), Date.now())`. API publique conservée.
- [ ] `StoryViewer.tsx` IIFE inline → `formatTimeRemaining(new Date(story.expiresAt).getTime(), Date.now())`,
      `null` → ne rend rien (comportement identique).
- [ ] `StatusBar.tsx` `getTimeRemaining` → délègue avec `?? 'Expire'` (préserve le cas expiré).

### Phase C — Vérification & livraison
- [ ] `vitest run` shared vert ; `jest` web sur `story-transforms*` verts (baseline conservée).
- [ ] `tsc --noEmit` : aucune erreur sur les fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-s06d22` ; CI verte ; **merge dans main**.

## Hors périmètre (consigné dans l'analyse)
- F29 (slug — sorties divergentes), F30 (XSS EmailService — itération sécurité dédiée),
  F31 (sanitize → shared), F32 (octets — iter 60), F33 (durée `formatClock`), F34 (constantes TTL), F2.

## Continuité
Iter 60 : F32 (formatage d'octets → `formatFileSize` canonique, 2 duplicats exacts <1 To) ou F33
(durée → `formatClock`, plus large). Les deux ont déjà un canonique existant.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — canonique `formatTimeRemaining` + test vitest + export + build shared vert.
      Vérif fonctionnelle : 13/13 cas + **200 000 diffs aléatoires, 0 divergence** vs les 3 originaux
      (`canon === orig1`, `canon ?? 'Expire' === origStatusBar`).
- [x] Phase B — trois convergences appliquées (story-transforms délègue, StoryViewer inline supprimé,
      StatusBar délègue avec `?? 'Expire'`).
- [x] Phase C — jest `story-transforms*` 84/84, `story-viewer-comments` 6/6 ; `tsc --noEmit` : **0 erreur
      sur les fichiers touchés** (baseline web préexistante inchangée). Reste : push + CI + merge.
