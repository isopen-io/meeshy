# Plan — itération 96w (web)

**Date** : 2026-11-26 · **Issue** : #20605 (fix) · #20606 (dette suivi)
**Base** : `origin/dev` · **Cible PR** : `dev` · **Branche** : `claude/practical-fermat-h4rohp`

## Objectif
Supprimer la jumelle divergente `videoDurationLabel` : le badge `m:ss` d'une
vignette vidéo doit PLANCHER et garder le non-fini comme le socle
`formatMediaTime`, en parité avec le badge iOS (`MediaFormat.duration` défaut
`.down`).

## Étapes (TDD)
1. **RED** — ajouter au `media-grid-layout.test.ts` un describe `videoDurationLabel`
   (plancher 1,5 s → « 0:01 », 90,5 s → « 1:30 », accord `formatMediaTime`,
   garde NaN/Infinity/négatif/zéro → « 0:00 »). Confirmer 4 rouges (arrondi +
   « NaN:NaN »).
2. **GREEN** — `videoDurationLabel = (ms) => formatMediaTime(ms / 1000)` ;
   importer `formatMediaTime` depuis `@/lib/view/seek-track` (pas de cycle :
   `seek-track.ts` n'importe rien).
3. **Gates** — `media-grid-layout.test.ts` (27/27), `video-tile.test.tsx` (17/17),
   `lib/view` complet, `tsc`, gate d'harmonie #8879.
4. **Docs** — analyse `docs/analyses/uiux/2026-11-26-iteration-96w.md` annotée
   CORRIGÉ ; pointeur `web-iteration-pointer.md` mis à jour.
5. **Livraison** — PR vers `dev` (auto-merge au vert) ; supprimer la branche
   fusionnée ; la prochaine itération repart de `dev` à jour.

## Hors périmètre (dette #20606)
`composer-tray.tsx:99` et `message-card-media.ts:54` arrondissent encore —
non observables, décision parité export à prendre → issue séparée, jamais dans
ce lot surgical.

## Résultat
✅ Livré. #20605 fermée. Preuve : témoins verts + `lib/view` 4378/0 + `tsc` 0 +
gate #8879 = 0. Dette #20606 ouverte.
