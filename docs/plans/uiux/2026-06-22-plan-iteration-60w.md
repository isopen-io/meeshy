# Plan — Itération 60w (Web)

**Objectif** : Internationaliser `components/settings/config-modal.tsx` (modale
Paramètres & Configuration) — 9 chaînes FR figées en TOUTES langues (rupture Prisme).

## Étapes

1. [x] Identifier la surface candidate (différé 59w : `config-modal.tsx`).
2. [x] Vérifier l'absence de hook i18n + recenser les 9 chaînes (7 visibles, 2 a11y).
3. [x] Choisir un bloc i18n **dédié** `settings.configModal` (wording distinct de
   `settings.tabs.*` existant → ne pas coupler).
4. [x] Ajouter le bloc ×4 locales (en/fr/es/pt) avec parité stricte.
5. [x] Câbler `useI18n('settings')` + `t('configModal...', '<fallback EN>')`
   (fallback 2e arg, anti-flash leçon 50w).
6. [x] Mettre à jour le test existant `config-modal.test.tsx` (mock `useI18n`).
7. [x] Vérifs : JSON valide ×4, parité clés, grep FR résiduel = 0.
8. [ ] `jest config-modal.test.tsx` vert.
9. [ ] Commit + push branche `claude/practical-fermat-x2ian5`.
10. [ ] PR + CI vert + merge dans `main`.
11. [ ] Mettre à jour `branch-tracking.md` (état 60w, base post-59w) + supprimer la
    branche après merge.

## Clés i18n ajoutées

```
settings.configModal.title
settings.configModal.selectSection
settings.configModal.sectionAriaLabel
settings.configModal.tabs.{user,language,theme,stats,notifications,privacy}
```

## Risques / Notes

- **Test synchrone** : le hook réel résout en async → fallback EN au 1er rendu. D'où le
  mock dans le test (assertions FR déterministes). Sans le mock, les `getByText('Profil
  utilisateur')` synchrones échoueraient.
- Diff minimal : 1 composant + 4 locales + 1 test. Aucune API publique touchée.
- Orthogonal aux surfaces feed/reels/modales prises par les agents parallèles.
