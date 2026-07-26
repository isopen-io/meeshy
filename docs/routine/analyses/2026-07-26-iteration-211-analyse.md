# Iteration 211 — `utils/language-utils` : carte de drapeaux/noms divergente de la SSOT (anglais 🇺🇸 vs 🇬🇧) → convergence

## Protocole (démarrage)
`main` @ `f6205382` (dernier commit : feat android sharelink success sheet #2312).
Branche `claude/brave-archimedes-d1b540` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` sur `apps/web`. `packages/shared/dist`
construit via `bun run build` (le jest web mappe `@meeshy/shared/(.*)` →
`packages/shared/dist/$1`, requis dès qu'un fichier importe la SSOT partagée).

PRs ouvertes au démarrage — **audit anti-doublon** (6 PRs, toutes de la vague
« correctness + SSOT ») :
- **#2305** (iter 206) : `utils/auth.ts` `isUserAnonymous` + `ConversationView` read-tracking.
- **#2307** (iter 207) : gateway `MessageReadStatusService` `viewedLanguages`.
- **#2309** (iter 208) : file-size `formatFileSize` (AudioFilePreview / AudioRecorderCard / admin).
- **#2311** (iter 209) : display-name SSOT (messages.service, invite/link modals, participants).
- **#2313** (iter 210) : `ActiveUsersSection` display-name + initiales.
- **#2275** : iOS a11y VoiceOver. Hors surface TypeScript.

**Pivot nécessaire.** Le candidat prioritaire du backlog iter 205 (`isUserAnonymous`
`id.length > 20`) est **déjà corrigé par #2305 (ouverte)** — une implémentation
identique aurait été un doublon. De même display-name (#2311/#2313), file-size
(#2309), read-tracking (#2305/#2307) sont couverts. Cette itération cible un
**site SSOT-violation distinct, sans chevauchement de fichier** avec aucune PR
ouverte.

## Sélection : **Priorité — correctness + Single Source of Truth (drapeaux/noms de langue web)**

`apps/web/utils/language-utils.ts` maintenait **deux cartes locales**
(`LANGUAGE_NAMES`, `LANGUAGE_FLAGS`) réimplémentant les métadonnées de langue déjà
détenues par la SSOT `packages/shared/utils/languages.ts` — exactement l'anti-pattern
que `components/v2/flags.ts` a été créé pour éliminer (son en-tête documente le
retrait d'une « local 21-language FLAG_MAP … that had diverged from the SSOT »).

## Current state (avant correctif)

```ts
// apps/web/utils/language-utils.ts
const LANGUAGE_FLAGS: Record<string, string> = {
  'fr': '🇫🇷',
  'en': '🇺🇸',   // ← divergence : la SSOT définit 🇬🇧 (languages.ts:96)
  ...
};
export function getLanguageFlag(code) {
  if (!code) return '🇫🇷';
  return LANGUAGE_FLAGS[code.toLowerCase().trim()] || '🌐';
}
```

La SSOT (`SUPPORTED_LANGUAGES`) définit `en` avec `flag: '🇬🇧'`, `nativeName: 'English'`.
`components/v2/flags.ts:getFlag('en')` renvoie donc **🇬🇧**, `getLanguageFlag('en')`
d'ici renvoie **🇺🇸**.

Consommateurs (grep exhaustif — **2 seuls**, aucun édité par ce correctif) :
- `hooks/use-conversation-stats.ts:41,67` → drapeaux de la répartition de langues
  d'une conversation.
- `components/conversations/details-sidebar/ActiveUsersSection.tsx:52` → nom + drapeau
  de la langue système d'un participant.

## Problems identified

1. **Incohérence visuelle cross-surface (correctness).** Même app, même langue, deux
   drapeaux : les stats de conversation et la sidebar « utilisateurs actifs » rendent
   🇺🇸 pour l'anglais, tandis que les bulles de message / cartes média v2 (via
   `flags.ts` → SSOT) rendent 🇬🇧. L'anglais britannique est le choix canonique de la
   SSOT (langue de traduction NLLB par défaut).
2. **Couverture inférieure de la carte locale.** `LANGUAGE_FLAGS`/`LANGUAGE_NAMES`
   couvrent 65 codes ; la SSOT en couvre 60+ **dont** les codes africains ISO 639-3
   supportés (`bas`, `ewo`, `dua`, `ksf`, `nnh`) absents ici → ces langues retombaient
   sur le globe 🌐 dans les stats/sidebar alors qu'elles ont un vrai drapeau via la SSOT.
3. **Duplication — 3ᵉ carte de métadonnées de langue.** Après `flags.ts` (v2) et
   `lib/constants/languages.ts` (déjà convergés sur la SSOT), `language-utils.ts`
   restait la dernière carte locale divergente : piège de maintenance (une langue
   ajoutée à la SSOT n'apparaît pas ici ; un drapeau corrigé à la SSOT ne se propage pas).

## Root causes

Carte historique écrite avant la centralisation SSOT/`v2/flags`, jamais reconvergée.
Le drapeau 🇺🇸 pour l'anglais est un défaut classique de carte main-écrite (le
raccourci « anglais = USA »), en contradiction avec le choix 🇬🇧 de la SSOT. Le test
existant figeait mollement le défaut (`'should return US flag for en code'`
n'assertait que `flag.length > 0`, jamais la valeur).

## Business impact

Cosmétique mais visible et incohérent : un utilisateur voit deux drapeaux différents
pour l'anglais selon l'écran (bulle vs stats/sidebar). Nuit à la perception de
finition du Prisme Linguistique, dont les indicateurs de langue sont un signal
produit central.

## Technical impact

- Suppression des deux cartes locales (−~130 lignes) ; `language-utils.ts` devient un
  adaptateur fin de la SSOT (`getLanguageInfo`, `getSupportedLanguageCodes`,
  `isSupportedLanguage`), à l'identique de `v2/flags.ts`.
- Signatures exportées **inchangées** : `getLanguageDisplayName` (nom natif),
  `getLanguageFlag` (drapeau), `getLanguageInfo`, `isSupportedLanguage`,
  `getAllSupportedLanguages`, `searchLanguages`.
- Aucun des 2 consommateurs n'est modifié — ils héritent du drapeau canonique.

## Risk assessment

**Faible.** Web-only ; aucun schéma/API/migration/clé i18n. Parité prouvée pour tous
les codes testés (fr/en/es/de/zh/ja/ar/ko/ru/pt) : `nativeName ?? name` de la SSOT
reproduit **exactement** les noms natifs locaux, et tous les drapeaux sont identiques
**sauf** `en` (🇺🇸→🇬🇧, précisément le correctif). Les fallbacks historiques sont
conservés (français par défaut sur entrée vide, globe sur langue inconnue). Les
fonctions d'énumération (`getAllSupportedLanguages`/`searchLanguages`/
`isSupportedLanguage`) n'ont **aucun consommateur runtime** (grep) — seul le test les
exerce, avec des assertions robustes à l'élargissement à 60+ langues.

## Proposed improvements (implémenté)

1. `utils/language-utils.ts` : suppression de `LANGUAGE_NAMES`/`LANGUAGE_FLAGS` ;
   délégation à `@meeshy/shared/utils/languages` (`getLanguageInfo`,
   `getSupportedLanguageCodes`, `isSupportedLanguage`). Fallbacks préservés.
2. `__tests__/utils/language-utils.test.ts` : renommage du test « US flag » trompeur en
   **régression** verrouillant `getLanguageFlag('en') === '🇬🇧'` === `sharedGetLanguageFlag('en')`
   === `getFlag('en')` (parité SSOT + v2).

## Expected benefits

- Un seul drapeau/nom par langue app-wide (bulles, stats, sidebar, cartes média).
- Couverture élargie aux 60+ langues de la SSOT (drapeaux africains inclus).
- −1 carte de métadonnées dupliquée ; toute évolution SSOT se propage automatiquement.

## Implementation complexity

**Triviale** — 1 fichier source réécrit en adaptateur, 1 test durci. 0 consommateur touché.

## Validation criteria

- 47 tests `language-utils.test.ts` verts, dont la **régression base RED prouvée**
  (contre l'ancien source : `Received "🇺🇸"` ≠ `Expected "🇬🇧"`).
- Suites voisines vertes sans modification : `v2/flags.test.ts`,
  `ActiveUsersSection.test.tsx` (13/13).
- Aucune nouvelle erreur `tsc` sur `utils/language-utils.ts` (baseline projet inchangée).

## Future improvements (backlog restant)

- **`getLanguageDisplayName` vs SSOT `getLanguageName`** : la SSOT expose `name`
  (anglais) tandis que ce helper rend `nativeName` — les deux intentions coexistent
  légitimement ; documenter le choix « natif » dans un point d'accès unique si un
  besoin de nom anglais émerge côté web.
- **Byte-formatting en logs/télémétrie** (`useAttachmentUpload`,
  `user-analytics-collector`) : divisions `/1024/1024` inline — candidat SSOT
  `formatFileSize` développeur (déjà noté par #2309).
- **`getUserDisplayName` / `getUserDisplayNameOrNull`** : corps copiés-collés →
  délégation `?? fallback` (noté par #2311/#2313 ; attendre leur merge pour éviter le
  conflit sur `user-display-name.ts`).
