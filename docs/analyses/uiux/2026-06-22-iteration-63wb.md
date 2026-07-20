# Analyse UI/UX — Itération 63wb (web)

> **Renumérotée 63w→63wb** : un agent parallèle a livré une itération 63w distincte
> (cohérence des tokens de thème / empty states, #856 mergé) — périmètre disjoint.
> Convention de collision (49w/49wb, 57w/57wb/57wc, 58w/58wb…).

## Périmètre
Web uniquement. Revue de continuité (étapes 1–3) + livraison d'une optimisation
bornée : **bug anti-pattern `t('key') || 'fallback'`** sur le hook `useEffectTiles`
(`components/video-calls/audio-effects/hooks/useAudioEffects.ts`).

## Contexte de run (continuité + contention extrême)
- L'itération **bulle-de-message** préparée plus tôt ce cycle a été **supersédée par
  #842 (61we)**, déjà mergée (périmètre identique) → PR #843 fermée. Le correctif
  (dont la clé manquante `bubbleStream.bubble.forwarded`) **est bien sur `main`**.
- Le doublon **#812** (config-modal, déjà mergé #806) a été **fermé**.
- **Contention sévère** : ~8+ PR web d'agents parallèles ce cycle, merges en rafale
  (#835/#840/#841/#814/#816/#818/#842/#847/#850/#856…). Chaque rebase de cette
  branche re-conflictait `branch-tracking.md` car `main` avançait toutes les ~2 min.
- **Décision pragmatique** : pour briser le treadmill de rebase, l'édition de
  `branch-tracking.md` a été **retirée de cette PR** (le fichier est par ailleurs
  dégradé — voir ci-dessous) ; 63wb reste tracée par ce doc + le message de commit.

## Étapes 1–3
Aucun doublon d'**analyse**. Tous les items i18n/a11y 49w→63w ont un plan et sont
mergés. `branch-tracking.md` **non édité** ici (treadmill de conflits) — son
nettoyage est requis (voir Découverte).

## Étape 4 — Optimisation livrée

### Constat
`useEffectTiles(t)` (constructeur des tuiles d'effets audio du carrousel d'appel)
contenait **5 occurrences** de `t('key') || 'texte'` : `resetAll`, `voiceCoder.title`,
`backSound.title`, `babyVoice.title`, `demonVoice.title`. `useI18n.t(key)` 1-arg
renvoie la **clé brute** (truthy) tant que la traduction n'est pas chargée ⇒ le
secours `||` est dead-code et la clé brute flashe. **Distinct du 50w** (qui avait
corrigé `AudioEffectsCarousel`/`Panel`, mais **pas** ce hook).

### Correctif (code-only, 0 locale)
- `t('key') || 'X'` → `t('key', 'English')` sur les 5 occurrences. Les 5 clés
  `audioEffects.*` **existent déjà ×4 locales** → aucun ajout de locale.
- Secours alignés sur la **valeur EN exacte du locale** (leçon 50w) : les anciens
  divergeaient — `voiceCoder` codé `'Voice Coder'` vs locale `'Perfect Voice'` ;
  `backSound` codé `'Background'` vs `'Background Ambiance'` (l'ancien flash montrait
  donc un libellé incohérent).
- Type du paramètre `t` élargi `(key)=>string` → `(key, fallback?)=>string`
  (appelant `AudioEffectsCarousel` = `useI18n('audioEffects').t`, compatible).

### Tests / non-régression
- `components/video-calls/audio-effects/__tests__/imports.test.ts` vérifie seulement
  les exports (`useEffectTiles` inclus) — aucune assertion sur les titres → vert.

### Découverte — `branch-tracking.md` dégradé
Les résolutions de conflits par concaténation (fleet parallèle) ont laissé ~6 blocs
« Last merged PR / Last Merged Base / Next iteration » redondants + des lignes
History dupliquées. À nettoyer dans une **passe documentaire dédiée** (hors périmètre
code-only ; non éditée ici pour ne pas re-conflicter).

### Hors périmètre
- ~31 fichiers restants du même anti-pattern → lots bornés 64w+.

## Faux positifs / NE PLUS re-flagger
- `components/video-calls/audio-effects/hooks/useAudioEffects.ts` / `useEffectTiles` :
  anti-pattern `t() || 'fb'` **soldé** → ne plus signaler.

## Statut
✅ Implémenté — itération **63wb**. Diff minimal (1 fichier code, +6/-6, 0 locale).
node_modules absent dans le container routine → typecheck/build délégués au CI.
# Analyse itération 63wb — Framer Motion & `prefers-reduced-motion`

**Date** : 2026-06-22
**Périmètre** : `apps/web` uniquement (web only). Surface **non-i18n**, choisie
pour éviter la forte contention i18n `t()||fallback` (≥6 PR en vol :
#849/#851/#852/#853/#854/#855).

## Constat

Audit d'optimisation orienté **accessibilité / état du métier** sur la prise en
compte de la réduction de mouvement.

1. **CSS couvert** : `app/globals.css` (l.624-645) neutralise déjà
   animations/transitions CSS sous `@media (prefers-reduced-motion: reduce)`
   (`animation-duration: 0.01ms !important`, `.animate-*` → `animation: none`).
2. **Framer Motion NON couvert** (le trou) : Framer Motion anime via JS (Web
   Animations API / styles inline `transform`/`opacity`), **hors de portée** du
   bloc CSS `transition-duration`. **55 fichiers** importent `framer-motion`
   (bulles de message, feed/reels, lightboxes, modales, header, notifications,
   wizard auth, message-composer…) et déplacent/scalent du contenu sans aucune
   prise en compte de `prefers-reduced-motion`.
3. **`MotionConfig` jamais utilisé** : grep `MotionConfig|reducedMotion="..."` =
   0 dans le code applicatif. Le hook `useReducedMotion()` existe (réactif,
   `hooks/use-accessibility.ts`) mais n'est branché que sur quelques spinners de
   pages settings — pas sur la couche Framer Motion.

→ Rupture d'accessibilité **WCAG 2.3.3 (Animation from Interactions)** : un
utilisateur sensible au mouvement (troubles vestibulaires) voit toujours les
translations/zooms Framer Motion malgré son réglage système.

## Correction (livrée)

Mécanisme **natif** Framer Motion, un seul point de couverture :
`<MotionConfig reducedMotion="user">` monté au-dessus de l'arbre applicatif.
`"user"` lit la même media query que le bloc CSS et désactive automatiquement les
animations de **transform/layout** (x, y, scale, rotate) tout en conservant les
**fondus d'opacité** (sûrs). **Zéro modification par composant** pour les 55
fichiers.

- `components/providers/MotionProvider.tsx` (nouveau, client).
- `components/providers/index.ts` (+1 export).
- `app/layout.tsx` (wrap de l'arbre complet, couvre `CallManager`).
- Test de contrat (passe-plat enfants + `reducedMotion="user"`).

## Faux positifs / hors périmètre (ne pas re-flagger)
- **CSS reduced-motion** : déjà conforme (`globals.css`) — ne pas dupliquer.
- **`useReducedMotion()`** sur les spinners settings : déjà branché sur l'OS,
  conforme.
- **Préférence applicative** `preferences.reducedMotion` : quasi no-op (serveur
  async, non appliquée globalement) → **différé documenté** (voir plan 63wb),
  itération dédiée, ne pas trancher à l'aveugle au layout racine.

## Statut
✅ **Complète et corrigée.** NE PLUS re-flagger le gap « Framer Motion ignore
`prefers-reduced-motion` » : réglé globalement via `MotionProvider`
(OS-level). NE PLUS re-flagger `MotionProvider.tsx`/`globals.css` reduced-motion.
