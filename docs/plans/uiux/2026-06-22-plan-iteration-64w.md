# Plan d'itération 64w (web only)

**Objectif** : éliminer l'anti-pattern `t('key') || 'fallback FR'` sur la page de
connexion par lien magique (`app/auth/magic-link/page.tsx`) — surface d'entrée non
authentifiée (deep-link email). Continuité du travail auth de 63w (forgot/reset).

## Étapes
1. ✅ Revue cohérence : confirmer aucun doublon d'analyse ; choisir une surface
   **orthogonale** aux PR en vol (#849/#852/#853/#854/#855).
2. ✅ Vérifier l'existence des 43 clés ×4 locales (script) → toutes présentes sauf
   `featureGate.backToHome`.
3. ✅ Ajouter `auth.featureGate.backToHome` aux 4 locales (en/fr/es/pt), insert ciblé
   (pas de reformat JSON).
4. ✅ Convertir `t('key') || 'FR'` → `t('key', 'English')` (44 occ.) ; supprimer le
   `|| fb` mort des 2 cas paramétrés (`expiresIn`, `retriesRemaining`).
5. ✅ Grep résiduel = 0 ; JSON valides.
6. ⏳ Commit + push branche `claude/practical-fermat-w6ianf` ; PR ; CI ; merge `main`.
7. ⏳ Mettre à jour `branch-tracking.md` (base + History + Next iteration = 65).

## Critères d'acceptation
- 0 occurrence `t()||fallback` dans `app/auth/magic-link/page.tsx`.
- Aucune clé brute ni secours FR affichable en toutes langues sur cette page.
- 4 locales auth.json valides, parité stricte, `featureGate.backToHome` présente ×4.
- CI vert (typecheck/build/tests).

## Risques
- **Faible** : changement mécanique. Seul ajout de contenu = 1 clé ×4 (déjà vérifiée
  absente). Signature `t()` exclusive params/fallback respectée (cas paramétrés gérés).
