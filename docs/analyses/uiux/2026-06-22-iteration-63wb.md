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
