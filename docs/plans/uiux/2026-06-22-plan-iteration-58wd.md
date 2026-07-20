# Plan de correction — Itération 58wd (web)

**Branche** : `claude/practical-fermat-6731tz`
**Suffixe** : `wd` (web ; `58w`/`58wb`/`58wc` déjà consommés par agents parallèles → `58wd`)
**Thème** : i18n des primitives partagées d'état (erreur / chargement)

## Objectif
Internationaliser deux composants d'infrastructure partagés restés en français figé,
sans collision avec les PR iter-58w en vol (feed, modales a11y, OTP).

## Étapes
1. ✅ Étendre le namespace `common` (`errorBoundary`) ×4 locales avec 3 clés :
   `featureError` (param `{feature}`), `featureUnavailable`, `retry`.
2. ✅ `FeatureErrorBoundary.tsx` (class component) → extraire `FeatureErrorFallback`
   (fonction) consommant `useI18n('common')` ; remplacer les 4 chaînes FR.
3. ✅ `LoadingStates.tsx` → `LoadingState` : défaut i18n `t('loading', 'Loading...')`.
4. ✅ Mettre à jour `__tests__/components/LoadingStates.test.tsx` (défaut → `'Loading...'`).
5. ✅ Vérifier : jest (29/29), tsc (0 err), JSON valides, grep FR vide, CI #794 verte.
6. ✅ Commit + push + PR #794 ; merge dans `main` (après re-rebase / renumérotation 58wd).

## Hors périmètre (déféré, ne pas trancher à l'aveugle)
- Consolidation des deux composants `LoadingState` (ui/ vs common/) — arbitrage visuel.
- Couleurs `bg-red-100`/`text-red-600` de `FeatureErrorBoundary` (non dark-aware) —
  relève de l'arbitrage tokens `gp-*` (cf. déféré 56wb), pas de cette passe i18n.

## Statut : ✅ Développement terminé — merge en cours (PR #794)

---

# Plan — Itération 58wd (web)

## Base
- Repartir de `main` HEAD `343c636` (post-merge #792 iter-58w a11y modales,
  #784 iter-58wc, #790 iter-57wc, + dependabot).
- Branche de travail : `claude/practical-fermat-bsb3ey`.

## Contexte — 3 collisions absorbées
L'agent parallèle a mergé pendant ce run exactement les périmètres préparés ici
(ReelPlayer #774, ReelsFeedScreen #780, a11y modales #792). Cette itération ne
garde que le **delta non couvert par #792**.

## Objectif
Corriger la fuite de focus / a11y du `ConversationDrawer` : #792 lui a donné
`role="dialog"`+`aria-modal` mais il **reste monté hors-écran quand fermé**, donc
ses contrôles restent tabbables et `aria-modal` persiste. Fix : `inert={!isOpen}`.

## Étapes
1. [x] `components/v2/ConversationDrawer.tsx` : ajout `inert={!isOpen}` sur le
   conteneur du tiroir.
2. [x] Annoter analyse (58wb) + `branch-tracking.md`.
3. [ ] Commit + push (force, branche réécrite) ; mettre à jour PR #779 → 58wb ;
   merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Strict delta de #792 : 1 attribut, 1 fichier, **aucune locale**.
- Ne PAS ajouter de backdrop-dismiss sur `AgentTopicEditModal` (#792 l'a écarté
  volontairement — décision respectée).
- `inert` > `aria-hidden` (couvre focus + AT sans anti-pattern).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (59w+)
focus-trap actif des 2 dialogues, `PostsFeedScreen` (vérifier agent parallèle),
`Badge` hexes, `app/settings/loading.tsx`, `next-themes` orphelin.
