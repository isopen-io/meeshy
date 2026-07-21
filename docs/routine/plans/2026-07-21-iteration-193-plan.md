# Iteration 193 — Plan : unifier `v2/flags` (drapeau langue média)

## Objectifs
Éliminer la quadruple duplication de `FLAG_MAP`/`getFlag` et la divergence
active `id`/`no` entre cartes média, en faisant converger les 3 cartes vers la
table canonique unique de `flags.ts`, elle-même complétée du Norvégien manquant.

## Modules affectés
- `apps/web/components/v2/flags.ts` (ajout `no` à `FLAG_MAP` + `LANGUAGE_NAMES`)
- `apps/web/components/v2/MediaImageCard.tsx` (suppr. copies locales + import)
- `apps/web/components/v2/MediaAudioCard.tsx` (idem)
- `apps/web/components/v2/MediaVideoCard.tsx` (idem)
- `apps/web/__tests__/components/v2/flags.test.ts` (nouveau)

## Phases
1. **RED** — écrire `flags.test.ts` : `getFlag('no')` = 🇳🇴, `getFlag('id')` = 🇮🇩,
   code connu, code inconnu → globe, casse. `getFlag('no')` échoue sur le code
   actuel (clé absente).
2. **GREEN** — ajouter `no: '🇳🇴'` (`\u{1F1F3}\u{1F1F4}`) à `FLAG_MAP` et
   `no: 'Norsk'` à `LANGUAGE_NAMES` dans `flags.ts`.
3. **REFACTOR** — dans chaque carte média : supprimer le bloc `FLAG_MAP` local +
   la fonction `getFlag` locale, ajouter `import { getFlag } from './flags';`.
4. **VALIDATION** — `tsc --noEmit` sur web ; jest sur `flags.test.ts` + suites v2
   existantes ; grep : plus aucun `FLAG_MAP` local dans les 3 cartes.

## Dépendances
Aucune. `./flags` est déjà importé par d'autres composants v2.

## Risques estimés
Minimal. Changement additif (sur-ensemble) + suppression de duplication à
comportement identique. Seul écart observable : `id`/`no` désormais couverts
partout (élargissement, jamais rétrécissement).

## Stratégie de rollback
Revert du commit unique. Les 4 fichiers sont indépendants ; aucune migration,
aucun état persistant.

## Critères de validation
- RED→GREEN prouvé sur `getFlag('no')`.
- `flags.test.ts` vert ; suites v2 inchangées.
- `tsc --noEmit` propre sur les 4 fichiers.
- Grep `FLAG_MAP` = 0 hit dans les 3 cartes média.

## Statut de complétion
- [x] Analyse rédigée
- [x] RED test — 4 échecs prouvés sur le code pré-fix (`no`, casse `NO`,
  maps-in-sync `no`, nom `Norsk`)
- [x] GREEN (flags.ts) — `no: 🇳🇴` + `no: 'Norsk'` ajoutés ; 11/11 verts
- [x] REFACTOR (3 cartes) — `FLAG_MAP`/`getFlag` locaux supprimés, import
  `./flags` ; grep `FLAG_MAP` = 0 dans les 3 cartes
- [x] Validation tsc (0 erreur sur les 4 fichiers) + jest (v2 : 12 suites /
  102 tests verts + flags 11/11)
- [ ] Commit + push + merge

## Améliorations futures
- Brancher `normalizeLanguageCode` dans `getFlag` si BCP-47/3-lettres atteint les
  badges média (itération 194+).
- `getLanguageInfo` shared BCP-47 (cycle d'import à casser) — reporté de 192.
