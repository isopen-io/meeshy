# Plan — Itération 63wb (web)

> Renumérotée 63w→63wb (collision : un agent parallèle a livré une 63w « tokens de
> thème / empty states » #856, périmètre disjoint).

## Objectif
Solder l'anti-pattern buggé **`t('key') || 'fallback'`** sur le hook `useEffectTiles`
(`components/video-calls/audio-effects/hooks/useAudioEffects.ts`) — surface effets
audio des appels, orthogonale aux PR en vol.

## Base
- `main` HEAD `a08fed7` (post-merge #856 iter-63w).
- Branche : `claude/practical-fermat-knf2oo` (réutilisée ; #843 fermée, repivot).

## Contexte / état du métier
`useI18n.t(key)` 1-arg renvoie la **clé brute** (truthy) pendant le load
(`use-i18n.ts` `return fallback || key`) → `t('key') || 'X'` = dead-code +
flash-de-clé-brute. La signature à 2 args traite le 2ᵉ string comme fallback natif
(anti-flash, leçon 50w).

## Vérification clé (toutes présentes ×4 → code-only)
`audioEffects.{resetAll,voiceCoder.title,backSound.title,babyVoice.title,demonVoice.title}`
existent ×4 locales → 0 ajout de locale.

## Étapes
1. [x] Mesurer (5 occ. / 1 fichier ; namespace `audioEffects` via caller).
2. [x] Vérifier l'existence des 5 clés ×4 locales.
3. [x] `t(k) || 'X'` → `t(k, 'En')` (secours = valeur EN exacte ; corrige aussi
   `Voice Coder`→`Perfect Voice`, `Background`→`Background Ambiance`).
4. [x] Élargir le type param `t` → `(key, fallback?) => string`.
5. [x] Vérifier 0 anti-pattern restant + test `imports.test.ts` inchangé.
6. [ ] Commit + push (force, branche réutilisée), PR (nouvelle), CI verte.
7. [ ] Merger dans `main`.

## Changements
- `components/video-calls/audio-effects/hooks/useAudioEffects.ts` (5 occ. + type `t`).
- Docs 63wb (analyse + plan). **`branch-tracking.md` NON édité** (treadmill de
  conflits — fleet merge toutes les ~2 min ; fichier par ailleurs dégradé).

## Risque
Minimal : transformation mécanique, clés présentes ×4 (correctif pur, anti-flash).
Test = exports only.

## Suite
- ~31 fichiers restants de l'anti-pattern → 64w+.
- **Nettoyage `branch-tracking.md`** (blocs pointeurs + History dupliqués) → passe
  documentaire dédiée.
