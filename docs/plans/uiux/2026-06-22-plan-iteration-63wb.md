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
# Plan itération 63wb — a11y(web) Framer Motion respecte `prefers-reduced-motion`

## Objectif
Faire respecter globalement `prefers-reduced-motion` à **toutes** les animations
Framer Motion de l'app web (WCAG 2.3.3 — Animation from Interactions), via le
mécanisme natif `<MotionConfig reducedMotion="user">`. Surface **non-i18n**,
strictement orthogonale à la forte contention i18n `t()||fallback` en vol
(#849/#851/#852/#853/#854/#855).

## Contexte / diagnostic
- `globals.css` neutralise déjà les animations/transitions **CSS** sous
  `@media (prefers-reduced-motion: reduce)`.
- **Mais** Framer Motion pilote ses animations en **JavaScript** (Web Animations
  API / styles inline) : elles échappent entièrement au bloc CSS. **55 fichiers**
  importent `framer-motion` et animent transform/scale/layout sans aucune prise
  en compte de la réduction de mouvement.
- `MotionConfig` n'est utilisé **nulle part** (grep = 0).
- `reducedMotion="user"` lit la même media query système et désactive
  automatiquement transform/layout en conservant les fondus d'opacité → un seul
  point de couverture pour les 55 fichiers, **zéro changement par composant**.

## Étapes
1. [x] Confirmer le gap (CSS couvre, Framer Motion non ; `MotionConfig` absent).
2. [x] Créer `components/providers/MotionProvider.tsx` (client, `MotionConfig
       reducedMotion="user"`).
3. [x] Exporter depuis le barrel `components/providers/index.ts`.
4. [x] Monter `<MotionProvider>` dans `app/layout.tsx` autour de l'arbre complet
       (couvre `CallManager`, feed, bulles, etc.).
5. [x] Test `__tests__/components/providers/MotionProvider.test.tsx` (passe-plat
       des enfants + `reducedMotion="user"`).
6. [ ] `tsc`/jest verts localement (selon dispo deps), push, CI vert, merge main.
7. [ ] Mettre à jour `branch-tracking.md` et supprimer la branche après merge.

## Fichiers touchés
- `components/providers/MotionProvider.tsx` (nouveau)
- `components/providers/index.ts` (+1 export)
- `app/layout.tsx` (import + wrap)
- `__tests__/components/providers/MotionProvider.test.tsx` (nouveau)

## Risques
Aucun pour les utilisateurs sans `prefers-reduced-motion` (comportement
inchangé). Pour ceux qui l'activent : les animations de déplacement/échelle
deviennent instantanées (intentionnel, conforme WCAG). Aucune clé i18n, aucune
locale touchée → zéro collision avec les PR i18n en vol.

## Différé (documenté, non tranché ici)
La préférence **applicative** `preferences.reducedMotion` (toggle
ApplicationSettings) reste un **quasi no-op** : elle est persistée côté serveur
(`usePreferences`, async + authentifié) mais n'est appliquée ni au document ni à
Framer Motion ; et les spinners settings se basent sur le hook OS
`useReducedMotion()`, pas sur la préférence. La câbler globalement exige de
souscrire à un état serveur asynchrone au niveau du layout racine (couplage
lourd) → itération dédiée ultérieure (idéalement : refléter la préférence en
classe `<html>` + alimenter `MotionConfig`). **Ne pas re-flagger** le gap OS-level
Framer Motion (réglé ici).
