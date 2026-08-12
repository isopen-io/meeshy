# Plan — Iteration 199 : convergence `v2/flags.ts` → SSOT `getLanguageInfo`

## Objectives
Supprimer la carte drapeau/nom locale de `apps/web/components/v2/flags.ts`
(21 langues, noms romanisés ASCII, fallback globe 🌐 pour 40+ langues) et la
recâbler sur le SSOT `getLanguageInfo` (`packages/shared/utils/languages.ts`,
60+ langues, `flag` + `nativeName`).

## Affected modules
- `apps/web/components/v2/flags.ts` (prod — réécriture des 2 helpers, suppression
  des 2 cartes)
- `apps/web/components/v2/index.ts` (prod — retrait du re-export
  `FLAG_MAP, LANGUAGE_NAMES`)
- `apps/web/__tests__/components/v2/flags.test.ts` (test)

## Implementation phases
1. **RED** — Mettre à jour `flags.test.ts` : `getLanguageName('spa')` → `Español`
   (accent restauré) ; remplacer `FLAG_MAP.de/nl/zh` par `getFlag('de'/'nl'/'zh')` ;
   retirer le bloc « maps stay in sync » (cartes supprimées) et les imports
   `FLAG_MAP`/`LANGUAGE_NAMES` ; ajouter tests « plus de globe pour une langue
   auparavant non mappée » (`am`) + « nom natif » (`getLanguageName('ja')` →
   `日本語`). Vérifier l'échec sur le code courant (`Espanol` ≠ `Español`,
   `getFlag('am')` = 🌐).
2. **GREEN** — Réécrire `getFlag`/`getLanguageName` comme adaptateurs fins sur
   `getLanguageInfo` ; supprimer `FLAG_MAP`/`LANGUAGE_NAMES` ; retirer leur
   re-export dans `v2/index.ts`.
3. **Validation** — Suite `flags.test.ts` + suites v2 dépendantes vertes ;
   tsc propre sur les fichiers modifiés.

## Dependencies
Aucune. `getLanguageInfo` déjà exporté/testé ; `normalizeLanguageCode` déjà
importé par le module courant ; le module `languages` est déjà dans le bundle v2.

## Estimated risks
Faible. Web-only ; aucun schéma/API/migration/clé i18n. Sémantique de bord
(`''`/`xx`→🌐, `fil`→`FIL`) préservée par construction. Consommateurs affichent
librement drapeau/nom.

## Rollback strategy
Révert du commit unique — délégation pure à un SSOT indépendant.

## Validation criteria
- `flags.test.ts` : vert (dont `spa`→`Español`, `am`≠🌐, `ja`→`日本語`, bords
  `''`/`xx`/`fil` préservés).
- Suites `translation-toggle.test.tsx`, `post-card-enhanced.test.tsx`,
  `theme.test.ts` vertes.
- Aucune erreur `tsc` introduite sur `v2/flags.ts` / `v2/index.ts`.

## Completion status
- [x] Phase 1 RED (`flags.test.ts` : `spa`→`Español`, `am`/`he`/`fa` ≠ 🌐, `ja`→`日本語`,
  drapeaux via `getFlag('de')`… ; échec confirmé sur le code courant)
- [x] Phase 2 GREEN (`flags.ts` réécrit en adaptateurs SSOT ; `FLAG_MAP`/
  `LANGUAGE_NAMES` supprimés + re-export retiré de `v2/index.ts`)
- [x] Phase 3 validation (`flags.test.ts` 16/16 ; suite `__tests__/components/v2`
  14 suites / 129 tests verts ; tsc propre sur les fichiers modifiés)
- [ ] Merge + delete branch (en cours)

## Découverte pendant l'implémentation
Divergence supplémentaire fermée : l'ancienne carte v2 mappait `pt` sur le
drapeau **brésilien** (🇧🇷) alors que le SSOT mappe `pt` sur le **Portugal** (🇵🇹).
La convergence restaure 🇵🇹, cohérent avec le sélecteur de langue et le reste de
l'app. (Constante de test `FLAG_PORTUGAL` corrigée en conséquence.)

## Progress tracking
Commit unique sur `claude/brave-archimedes-79c0j1` depuis `main@e2cb1673`.

## Future improvements
Voir la section « Future improvements » de l'analyse 199 :
1. Copie A `language-utils.ts` (`en → 🇺🇸`) — décision produit sur le flag `en`.
2. Cartes de noms romanisés ad-hoc restantes (`use-profile-v2`, `admin/broadcasts`).
3. `classifyRelativeTime` — 5 copies « time ago ».
4. `date-format.ts` — ~15 copies `formatDate`.
5. Réparer le `nativeName` arménien corrompu dans `languages.ts` (l.430).
</content>
