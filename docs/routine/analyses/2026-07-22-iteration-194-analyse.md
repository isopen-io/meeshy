# Iteration 194 — `v2/flags` (web) : `getFlag`/`getLanguageName` normalisent encore la langue par troncature aveugle `slice(0, 2)` au lieu du SSOT `normalizeLanguageCode` → codes ISO 639-2/639-3 canoniques rendus en globe (ou risque de drapeau erroné) au lieu du drapeau national correct

## Protocole (démarrage)
`main` @ `a8a6756e` (derniers merges : #2272 android/auth progress-bar decision
core ; #2271 web/v2 unification `flags.ts` — itération **193** ; #2270 android
JWT-expiry decoder). Branche `claude/brave-archimedes-hq0uxg` réinitialisée sur
`origin/main`. Ce cycle prend **194**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install` ;
`packages/shared` construit (`dist`) car le jest web mappe
`@meeshy/shared/(.*)` → `packages/shared/dist/$1`.

PRs ouvertes au démarrage : #2269 (CI iOS release ANDP), #2261/#2263 (swarm iOS
a11y `CallView` VoiceOver duration — doublon 212i) — toutes gérées par d'autres
swarms, **non touchées** (aucune ne concerne la surface TypeScript de cette
itération).

Sélection : **Priorité 1 (continuité directe de l'itération 193)**. L'itération
193 a unifié les 3 cartes média sur la table canonique unique de `flags.ts` et
a explicitement mis en file (« Améliorations futures ») : *« Brancher
`normalizeLanguageCode` dans `getFlag` si BCP-47/3-lettres atteint les badges
média (itération 194+) »*. C'est exactement cette itération. La feature est
activement consommée (`TranslationToggle`, `PostCard`, `PostDetail`,
`MessageBubble`, `StatusBar` + les 3 cartes média `MediaImageCard`/
`MediaAudioCard`/`MediaVideoCard`) et déjà couverte (`flags.test.ts`).

## Current state
`apps/web/components/v2/flags.ts` expose deux helpers de rendu de badge langue :

```ts
export function getFlag(code) {
  if (!code) return '🌐';
  const normalized = code.toLowerCase().slice(0, 2);   // <-- troncature aveugle
  return FLAG_MAP[normalized] || '🌐';
}
export function getLanguageName(code) {
  if (!code) return 'Unknown';
  const normalized = code.toLowerCase().slice(0, 2);   // <-- idem
  return LANGUAGE_NAMES[normalized] || code.toUpperCase();
}
```

Le `slice(0, 2)` est précisément la troncature que le SSOT partagé
`normalizeLanguageCode` (`packages/shared/utils/language-normalize.ts`) a été
créé pour **remplacer** — sa docstring documente explicitement les collisions
silencieuses (`'fil'` → `'fi'` Finnois, `'swe'` → `'sw'` Swahili) que la
troncature produit.

## Problems identified
`FLAG_MAP` est indexé par code **ISO 639-1** (2 lettres). Or les identifiants de
langue qui atteignent ces badges ne sont pas garantis 639-1 :
- `MessageTranslation.targetLanguage` est *« la forme canonique employée partout »*
  (docstring `language-normalize`) — peut être 3-lettres pour les langues sans
  639-1.
- `version.languageCode` (TranslationToggle) et les codes issus des locales
  client (BCP-47 `Accept-Language`, `Locale.current`) transitent aussi.

Pour tout code dont les 2 premières lettres ne forment PAS le code 639-1 cible,
`slice(0, 2)` produit un préfixe qui rate la table → **globe générique** (perte
d'information) alors qu'un drapeau national correct existe :

| entrée | `slice(0,2)` | rendu actuel | rendu correct |
|--------|--------------|--------------|---------------|
| `swe` (Suédois 639-2/T) | `sw` | 🌐 | 🇸🇪 |
| `spa` (Espagnol 639-2)  | `sp` | 🌐 | 🇪🇸 |
| `jpn` (Japonais 639-2)  | `jp` | 🌐 | 🇯🇵 |
| `por` (Portugais 639-2) | `po` | 🌐 | 🇵🇹 |
| `pol` / `tur` / `ind`   | `po`/`tu`/`in` | 🌐 | 🇵🇱 / 🇹🇷 / 🇮🇩 |
| `ger`/`dut`/`chi` (639-2/B) | `ge`/`du`/`ch` | 🌐 | 🇩🇪 / 🇳🇱 / 🇨🇳 |

`getLanguageName` a le même défaut : `getLanguageName('swe')` → `'sw'` absent de
`LANGUAGE_NAMES` → renvoie le code brut `'SWE'` au lieu de `'Svenska'`.

## Root causes
Réimplémentation locale de la normalisation de langue (troncature) au lieu de
déléguer au SSOT — violation directe du principe **Single Source of Truth**
(CLAUDE.md : *« Language resolution: resolveUserLanguage() … No reimplementation »*).
`flags.ts` était le **dernier** point de la surface web à normaliser la langue
par `slice(0, 2)` (les utils `language-detection.ts`,
`user-language-preferences.ts`, `bubble-stream-page.tsx` consomment déjà
`normalizeLanguageCode`).

## Business impact
Sur les badges de langue de message/média/traduction, un contenu dans une langue
dont le code canonique n'est pas 639-1-préfixé s'affiche avec un globe anonyme au
lieu de son drapeau national — friction visuelle et perte de repère du Prisme
Linguistique (l'indicateur subtil de langue attendu par la philosophie produit).

## Technical impact
- Convergence sur le SSOT : suppression de la dernière réimplémentation de
  normalisation de langue côté web.
- Robustesse future : si `'fi'`/`'sw'` étaient un jour ajoutés à `FLAG_MAP`, la
  troncature ferait apparaître un **drapeau erroné** (`fil`→`fi`, `swe`→`sw`) ;
  le câblage du SSOT élimine cette classe de bug par construction.

## Risk assessment
Minimal. Changement de comportement strictement **élargissant** :
- codes 639-1 valides et locales BCP-47 (`fr`, `fr-FR`, `zh-Hant-HK`) : identiques
  (`normalizeLanguageCode` renvoie le même code 639-1) ;
- codes inconnus (`xx`) et vides/nuls : globe / `Unknown` inchangés ;
- seuls les codes 639-2/639-3 mal préfixés changent — de globe/code-brut vers le
  drapeau/nom correct.
Aucun cycle d'import (contrairement à `getLanguageInfo` shared reporté en 192) :
`flags.ts` est côté web, `@meeshy/shared/utils/language-normalize` est déjà
importé par 3 autres modules web.

## Proposed improvements
1. Importer `normalizeLanguageCode` depuis `@meeshy/shared/utils/language-normalize`.
2. `getFlag` : `normalizeLanguageCode(code)` → globe si `undefined`, sinon
   `FLAG_MAP[normalized] || globe`.
3. `getLanguageName` : `normalizeLanguageCode(code)` → si `undefined`, préserver
   le fallback historique (`code.toUpperCase()` sur l'original, `'Unknown'` si
   vide) ; sinon `LANGUAGE_NAMES[normalized] || normalized.toUpperCase()`.
4. Extraire la constante `GLOBE` (dé-duplication du littéral `'\u{1F310}'`).

## Expected benefits
Drapeaux/noms nationaux corrects pour les codes ISO 639-2/639-3 canoniques ;
dernière réimplémentation de normalisation de langue web éliminée ; parité de
comportement avec `resolveUserLanguage`/`language-detection`.

## Implementation complexity
Faible : 1 fichier de production (`flags.ts`), 1 fichier de test
(`flags.test.ts`). Aucune migration, aucun état persistant, aucune dépendance
nouvelle (import déjà présent ailleurs).

## Validation criteria
- RED→GREEN prouvé : `getFlag('swe')`/`getFlag('spa')`/`getFlag('jpn')`/
  `getFlag('por')` → drapeau national ; `getLanguageName('swe')` → `'Svenska'`.
- Tests de régression existants (`fr`, `fr-FR`, `id`, `no`, `xx`, vide/null,
  maps-en-sync) restent verts.
- `tsc --noEmit` propre sur `flags.ts`.
- Grep : plus aucun `slice(0, 2)` dans `flags.ts`.

## Améliorations futures
- `getLanguageInfo` shared BCP-47 (même classe, mais cycle d'import à casser —
  extraire `SUPPORTED_CODES` en amont) — reporté de 192/193.
- Parité sentinelle `'unknown'` / normalisation iOS/Android (reporté de 190/191).
- `getLanguageInfo` fallback `region: 'Europe'` pour code inconnu (inerte —
  revisiter seulement si un consommateur observe la `region`).
