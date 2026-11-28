# Plan de correction — itération 98w (web)

**Date** : 2026-11-28
**Cible** : `apps/web` (Vite + Preact) · PR vers `dev`
**Issue** : #20606 (moitié `composer-tray` — FIN de la dette)

## Objectif

Le minuteur d'enregistrement vocal (`components/composer-tray.tsx`) arrondissait sa durée
(`Math.round`) sur **deux surfaces** — l'œil (`formatDuration`) et l'oreille (`spokenDuration`) —
alors que le socle `formatMediaTime` et iOS `MediaFormat.duration` (défaut `.down`) **planchén**.
Les faire plancher ENSEMBLE, depuis une loi de plancher à site unique, pour qu'œil et oreille ne
divergent jamais à la demi-seconde.

## Étapes (TDD)

1. **RED** — ajouter dans `composer-tray.test.tsx` (describe RecordingBar) un témoin à l'axe
   discriminant : monter la barre à `90_500` ms (fraction ≥ .5 s) et exiger que le `role="timer"`
   contienne « 1:30 » ET « 1 min 30 s », et NI « 1:31 » NI « 1 min 31 s ». ✅ rouge
   (« …1:311 min 31 s » avec `Math.round`).
2. **GREEN — socle** : `lib/view/seek-track.ts` — extraire `floorMediaSeconds(seconds)` =
   `Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0` ; `formatMediaTime` la
   consomme (sortie byte-identique).
3. **GREEN — composer-tray** : `formatDuration(ms)` → `formatMediaTime(ms / 1000)` ;
   `spokenDuration(ms, lang)` → `floorMediaSeconds(ms / 1000)` ; importer les deux depuis
   `@/lib/view/seek-track`.
4. **Non-régression** : `composer-tray(.test + -heif)` 9/9 · `lib/view` 4380/0 · `lib/export` 547/0 ·
   `tsc --noEmit` 0 · gate #8879 0.
5. **Housekeeping** : annoter l'analyse `## ✅ Statut : CORRIGÉ (iter-98w)` ; mettre à jour
   `web-iteration-pointer.md` ; fermer #20606.

## Résultat

Tous gates verts (voir analyse). Site unique du plancher : `floorMediaSeconds`. #20606 soldée.

## ✅ Statut : LIVRÉ (iter-98w) — PR vers `dev`
