# Iteration 73 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v3 (démarrage) — OK
`main` @ `dc9a1a11` (réaligné sur `origin/main`, force-update détecté vs branche de travail →
`git checkout -B claude/brave-archimedes-x80ify origin/main`). Vérification élargie :
- **Doublons d'import** (contrôle v3) : `grep` sur `copyToClipboard` app-wide → **aucun doublon**.
  La régression `TS2300` des iters 70/72 reste résorbée sur `main`.
- **F30 (clipboard)** : recensement `navigator.clipboard.writeText` / `document.execCommand` sur
  `apps/web` (hors docs / rapports générés / `lib/clipboard.ts`) → **0 site brut restant**. Le lot F30
  est **convergé** ; les ~7 sites « exotiques » listés en réserve iter 72 ont été résorbés par les
  itérations parallèles. Rien à faire côté F30.

## Cible iter 73 — Bug de résolution du Prisme : `normalizeLanguageCode` corrompt les codes ISO 639-3 supportés

### Current state
`normalizeLanguageCode` (source de vérité `packages/shared/utils/language-normalize.ts`, miroirs Swift
`MeeshyUser.normalizeLanguageCode` + `ConversationLanguagePreferences.normalize`) **tronquait
systématiquement** tout code à 2 lettres (`.slice(0, 2)` / `.prefix(2)`).

Cette normalisation s'applique à `deviceLocale` — la **4e priorité** du Prisme Linguistique
(Prisme étendu 2026-05-26), injectée par iOS via `X-Device-Locale` (`Locale.current.identifier`) et par
le web via `Accept-Language`.

### Problem identified
Meeshy supporte **5 langues camerounaises en ISO 639-3 sans équivalent ISO 639-1** :
`bas` (Basaa), `ksf` (Bafia), `nnh` (Ngiemboon), `dua` (Douala), `ewo` (Ewondo) —
toutes `supportsTranslation: true`, codées par leur code 3-lettres **partout** dans le système
(clés de traduction, mapping NLLB, `MessageTranslation.targetLanguage`).

La troncature à 2 lettres les **corrompt en langues sans rapport** :
- `bas` → `ba` (**Bachkir**)
- `nnh` → `nn` (**Norvégien Nynorsk**)
- `ewo` → `ew` (**invalide**)
- `dua` → `du`, `ksf` → `ks` (**Kashmiri**)

De plus, la réduction ISO 639-3→639-1 par simple troncature est **fausse dans le cas général** :
`spa` → `sp` (≠ `es` pour l'espagnol). Les cas documentés `eng`→`en` / `fra`→`fr` ne fonctionnaient
que **par coïncidence** (le préfixe 2-lettres se trouve être le code 639-1).

### Root cause
Réduction naïve `prefix(2)` traitant tout code comme un ISO 639-1 tronquable, sans consulter
l'ensemble réel des codes supportés par Meeshy.

### Business impact
Un utilisateur dont l'appareil est réglé sur une langue camerounaise (iOS `Locale.current` = `"bas"`)
et **sans préférence in-app configurée** ne reçoit **jamais** son contenu en Basaa : la 4e priorité
résout `"ba"`, ne matche **aucune** traduction `"bas"`, et retombe sur le fallback `'fr'`. Violation
directe du Prisme Linguistique **pour exactement les langues sous-desservies** que Meeshy a fait l'effort
de supporter.

### Technical impact
Résolution de langue incorrecte sur les 3 plateformes (TS gateway/web, SDK Swift, app iOS) — mirror
divergence potentielle masquée car les trois sites partageaient le **même** défaut.

### Risk assessment
**Faible.** Changement contenu à 3 sites + 2 fichiers de tests. Rétro-compatibilité totale sur les
entrées ISO 639-1 et BCP-47 (tous les tests existants restent verts). Seuls changements de
comportement : (a) codes 639-3 supportés préservés au lieu d'être corrompus (correction), (b) ISO 639-3
inconnu irréductible → `undefined` au lieu d'un code fabriqué (plus sûr — un code non supporté ne
matchait aucune traduction de toute façon, donc effet net identique : fallback `'fr'`).

### Proposed improvement (implémenté)
`normalizeLanguageCode` consulte désormais l'ensemble des codes supportés :
1. Code supporté (2 **ou** 3 lettres) → renvoyé **tel quel** (`bas` → `bas`).
2. ISO 639-3 sans entrée Meeshy → réduction 2-lettres **uniquement si** ce préfixe est supporté
   (`eng` → `en`, `fra` → `fr`) ; sinon rejet (`spa` → `undefined`).
3. Code 2-lettres inconnu → conservé (comportement historique préservé).

Sources des codes supportés :
- TS : `getSupportedLanguageCodes()` (`packages/shared/utils/languages.ts`, module sans import → pas de
  cycle) ; `Set` construit une fois au chargement.
- Swift : nouveau `LanguageData.supportedCodeSet` (`Set<String>`, O(1) membership).

### Expected benefits
- Le Prisme résout correctement les langues 639-3 supportées via la locale appareil.
- Élimine une classe de bugs « code de langue fabriqué » (réduction 639-3 non fiable).
- Aligne `normalizeLanguageCode` sur le reste du système, qui référence déjà ces codes 3-lettres.

### Implementation complexity
Faible — 5 fichiers (2 source TS/Swift, 1 data Swift, 2 tests).

### Validation criteria
- [x] TS : `vitest` `language-normalize.test.ts` **16/16** verts (dont 4 nouveaux cas : préservation
      `bas`/`ewo`/`dua`/`nnh`/`ksf`, `bas-CM`→`bas`, rejet `spa`/`xyz`, réduction `eng`→`en`/`fra`→`fr`).
- [x] TS : `conversation-helpers.test.ts` (consommateur principal) **79/79** verts.
- [x] TS : `bun run build` (shared) **OK**, aucune erreur.
- [~] Swift : miroir strict de la logique TS validée ; tests XCTest mis à jour
      (`MeeshyUserPreferredContentLanguagesTests` : `test_normalizeLanguageCode_iso6393ReducesToSupportedPrefix`,
      `_supportedThreeLetterCodePreserved`, `_unknownIso6393Rejected`). Xcode/simulator **indisponible
      sous Linux** → non exécuté dans cette itération ; le contrat mirror (`ConversationLanguagePreferences.normalize`
      délègue à `MeeshyUser`) reste garanti par construction.

## Note data-parity (consigné, hors périmètre)
`LanguageData.swift` (SDK) contient `bas`/`dua`/`ewo` mais **pas** `ksf`/`nnh` (présents côté TS
`languages.ts`). Écart de données pré-existant, indépendant de ce fix. À traiter dans une itération
data-parity dédiée si besoin.
