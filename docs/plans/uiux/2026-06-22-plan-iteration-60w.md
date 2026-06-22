# Plan d'itération 60w (web only)

**Objectif** : éliminer l'anti-pattern i18n `t('key') || 'fallback'` (dead-code +
flash-of-raw-keys, leçon 50w) sur la surface `auth` et basculer vers la signature
native `t('key', 'fallback')`.

## Base
- Branche tirée de `main` HEAD post-merge iter-58wd / #796 / #779 / #799 (`9857819`).
- Branche de travail : `claude/practical-fermat-o2g4dt`.

## Étapes
1. [x] Confirmer le bug au niveau de l'implémentation `use-i18n.ts` (`return fallback || key`).
2. [x] Mesurer la classe de bug (405 occ / 59 fichiers ; 125 / 11 sur auth).
3. [x] Vérifier l'absence de `t(args,params) || 'x'` (cas multi-arg risqué) → aucun.
4. [x] Transformer `t(k) || 'x'` → `t(k, 'x')` sur 10 fichiers auth (76 remplacements).
5. [x] Exclure `PhoneResetFlow.tsx` (collision PR #800 / iter-59w OTP).
6. [x] Vérifier que les clés existent dans `locales/{en,fr}/auth.json` (zéro changement visible).
7. [x] Angliciser les fallbacks FR → valeur EN exacte du locale (anti-flash).
8. [x] Vérifier 0 anti-pattern restant + parenthèses équilibrées sur les 10 fichiers.
9. [ ] Commit + push, ouvrir PR, attendre CI verte, merger dans `main`.
10. [ ] Mettre à jour `branch-tracking.md` (base suivante, history) + supprimer la branche.

## Hors périmètre / différé
- `PhoneResetFlow.tsx` (post-#800).
- ~270 occurrences sur ~48 fichiers web (admin/conversations/audio/settings/video-calls) → 60wb+.

## Risque
Minimal : transformation mécanique string-level, chaque ligne revue, clés présentes
(comportement runtime inchangé), aucun fichier de test ni JSON locale touché.
