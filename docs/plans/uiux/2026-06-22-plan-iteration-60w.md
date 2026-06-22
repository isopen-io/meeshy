# Plan — Itération 60w (web)

**Base** : `main` HEAD post-merge iter-59w (#786) → `684d33f`
**Branche de travail** : `claude/practical-fermat-06dry3`
**Périmètre** : i18n de la modale de réglages globale `config-modal.tsx`

> **Cible recommandée par le tracking** (Next iteration + analyse 59w) : surface réglages
> orthogonale à la contention feed/reels/modales/OTP. Choisie après DEUX collisions
> consécutives (58w→#787, 59w→#786) où mes PR (#795, #800) ont été fermées comme doublons.

## Objectif
Internationaliser les 9 chaînes FR figées de `config-modal.tsx` (titres d'onglets, titre
dialog, labels du select mobile) — surface réglages entièrement non i18n.

## Étapes
1. [x] Resync sur `main` (`684d33f`) ; vérifier qu'aucune PR ouverte ne touche config-modal.
2. [x] `settings.json` ×4 : bloc `configModal` (6 clés distinctes) ; réutiliser `tabs.*`
       pour stats/notifications/privacy.
3. [x] `config-modal.tsx` : `useI18n('settings')` ; 9 swaps `t()` (fallbacks EN 2e arg).
4. [x] `config-modal.test.tsx` : mock `useI18n` (mappe clés → valeurs FR) ; assertions
       inchangées.
5. [x] Validation : `tsc` 0 err ; `jest config-modal.test.tsx` 22/22 ; JSON ×4 ; parité.
6. [ ] Commit + push sur `claude/practical-fermat-06dry3`.
7. [ ] PR → `main` ; CI ; merge ; supprimer la branche.
8. [ ] Mettre à jour `branch-tracking.md` (Next → 61 ; history 60w ✅).

## Clés
- **Neuves** `settings.configModal.{title,selectSection,sectionAriaLabel,userProfile,
  languageTranslation,appearance}` (6 ×4).
- **Réutilisées** `settings.tabs.{stats,notifications,privacy}`.

## Risques / notes
- `branch-tracking.md` édité en parallèle → conflit probable au merge (résolution additive).
- Contention extrême sur les surfaces web : rester sur réglages (config-modal), zone libre.
- Sandbox `node_modules` partiel mais suffisant : `tsc` + `jest` ciblés exécutés OK.
