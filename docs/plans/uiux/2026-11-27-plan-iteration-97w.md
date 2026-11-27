# Plan — itération 97w (web)

**Date** : 2026-11-27 · **Base** : `origin/dev` · **Cible PR** : `dev` (auto-merge au vert, #9226)
**Branche de travail** : `claude/practical-fermat-3gkfko`
**Issue** : #20606 (moitié EXPORT) · suite de 96w / #20605

## Objectif

Solder la moitié EXPORT de la dette #20606 : la durée `m:ss` peinte sur une carte
EXPORTÉE (`lib/export/message-card-media.ts` `formatDuration`) arrondit
(`Math.round`) et ne garde pas le non-fini, alors que le socle `formatMediaTime`
(`lib/view/seek-track.ts`) et iOS (`MediaFormat.duration`, défaut `.down`)
planchén. Une carte partagée affiche donc +1 s à la fraction ≥ .5 s, et « NaN:NaN »
pour une durée indéfinie — divergence de l'affichage dedans comme dehors.

## Étapes (TDD)

1. **RED** — `message-card-media.test.ts`, describe « formatDuration — même horloge
   plancher que le socle » : cas discriminants (1,5 s → « 0:01 », 90,5 s → « 1:30 »),
   accord byte-à-byte avec `formatMediaTime(ms/1000)`, non-fini/négatif → « 0:00 ».
   3 rouges attendus (les anciens cas 67 000 / 4 400 restent verts : fraction < .5 s).
2. **GREEN** — `formatDuration(ms) => formatMediaTime(ms / 1000)` ; import du socle ;
   suppression de l'arithmétique `m:ss` recopiée.
3. **REFACTOR / preuve** — `lib/export/` complet, `tsc --noEmit`, gate #8879.

## Parité iOS (référence, jamais modifiée)

- `MediaFormat+Duration.swift:45` : `rounding: FloatingPointRoundingRule = .down`.
- `MessageCardExcerptStrip.swift:32` (export iOS) : `MediaFormat.duration(start)`
  sans surcharge → plancher. Parité : floor. Le « à décider » de #20606 est tranché.

## Preuve attendue

- `message-card-media.test.ts` 13/13 (témoin neuf 3 rouges→verts).
- `lib/export/` 547/0 ; `tsc` 0 ; gate d'harmonie #8879 **0**.

## Hors scope (dette #20606 restante)

`composer-tray.tsx` `formatDuration` (œil) + `spokenDuration` (oreille) : lot
distinct — plancher les deux ensemble, vérifier la parité iOS du PARLÉ.

## Protocole de fusion

1. Pousser tôt le squelette sur `claude/practical-fermat-3gkfko` (base `origin/dev`).
2. Anti-doublon : `ls docs/analyses/uiux/` + recherche PR sur le nom de fichier cible.
3. PR vers `dev` → auto-merge au vert.
4. Annoter l'analyse `## ✅ Statut : CORRIGÉ (iter-97w)` (fait) + mettre à jour
   `web-iteration-pointer.md`.

## ✅ Statut : LIVRÉ (iter-97w) — voir l'analyse pour la preuve.
