# Iteration 217 — Stat publique `spokenLanguages` : dédup par `.toLowerCase()` brut → langues BCP-47 comptées deux fois + code malformé `en-us` exposé

## Protocole (démarrage)
`main` @ `f8e45ea4` (dernier commit : fix ios/story — médias de publication différée). Branche
`claude/brave-archimedes-kdl8dl` déjà synchronisée sur `origin/main` (même SHA).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` OK ; `prisma generate --generator client` + `packages/shared`
`tsc` build OK → harnais jest gateway + vitest shared verts.

PRs ouvertes au démarrage — **audit anti-doublon** : les 22 PRs ouvertes (#2334→#2355) sont
**toutes iOS/Android** (NavigationStack, a11y, StatusComposerView, window metrics, haptics). Aucune
ne touche `services/gateway/**` ni `packages/shared/**`. **Zéro chevauchement de fichier** avec
cette itération.

## Sélection : **Priorité — correctness + Single Source of Truth (couche langue)**

Candidat explicitement légué par l'itération 216 (« Future Considerations ») :
`routes/anonymous.ts:919-934`, l'agrégat `spokenLanguages`/`languageCount` de l'aperçu de lien
partagé anonyme, dédupe via `.toLowerCase()` brut au lieu du SSOT `normalizeLanguageCode`.

## Current state (avant correctif)

L'aperçu public d'un lien partagé (`GET /anonymous/link/:identifier`) construit un `Set<string>` des
langues parlées par les participants actifs :
```ts
allActiveParticipants.forEach(p => {
  if (p.type === 'user' && p.user) {
    if (p.user.systemLanguage) languageSet.add(p.user.systemLanguage.toLowerCase()); // ← brut
    if (p.user.regionalLanguage) languageSet.add(p.user.regionalLanguage.toLowerCase());
    if (p.user.customDestinationLanguage) languageSet.add(p.user.customDestinationLanguage.toLowerCase());
  } else {
    if (p.language) languageSet.add(p.language.toLowerCase());
  }
});
```

Les préférences in-app (`systemLanguage`, `regionalLanguage`, `customDestinationLanguage`) sont
persistées **verbatim** (`z.string().optional()`, aucune normalisation à l'écriture — cf. JSDoc
`conversation-helpers.normalizeInAppLanguage`). Une valeur BCP-47 produite par le web
(`Accept-Language` → `'en-US'`) ou iOS (`Locale.current.identifier` → `'fr_FR'`) atteint donc
l'agrégat telle quelle.

## Problems identified

1. **Bug de correctness — stat gonflée et code malformé exposé.** Un participant avec
   `systemLanguage: 'en-US'` et un autre avec `systemLanguage: 'en'` décrivent la **même** langue.
   `.toLowerCase()` donne `'en-us'` ≠ `'en'` → le `Set` contient **deux** entrées → `languageCount`
   compte **2 langues** au lieu d'1, et `spokenLanguages` **expose publiquement** le code malformé
   `'en-us'` (jamais un code Meeshy canonique).
2. **Duplication du couple normalisation-avec-repli.** Le pattern `normalizeLanguageCode(x) ?? x.toLowerCase()`
   existait déjà en **trois** endroits conceptuels : `conversation-helpers.ts:81`
   (`normalizeInAppLanguage`), `anonymous.ts:28` (transform zod du champ `language` au join), et
   **aurait dû** être ici — mais l'agrégat utilisait `.toLowerCase()` brut. Trois copies, une
   divergente = le bug.

## Root causes
- Les préférences de langue in-app sont persistées sans normalisation (asymétrie connue, documentée
  dans `normalizeInAppLanguage`), alors que la dédup suppose des codes déjà canoniques.
- Absence d'un helper **exporté** unique pour « canonicaliser un code verbatim en clé de dédup sans
  perdre les codes irréductibles » — chaque site réimplémentait le repli `?? .toLowerCase()`, et
  l'agrégat a divergé.

## Business impact
- Aperçu de lien partagé (surface **publique**, pré-authentification) affichant un nombre de langues
  faux et un code de langue corrompu (`en-us`) — perte de confiance, incohérence produit visible.

## Technical impact
- Convergence sur un SSOT exporté `normalizeLanguageForDedup` (packages/shared) — les trois sites
  délèguent désormais à une seule implémentation testée. Suppression de deux copies du repli inline.

## Risk assessment
Faible. `normalizeLanguageForDedup(code) = normalizeLanguageCode(code) ?? code.toLowerCase()` est
**idempotent** sur les codes déjà canoniques (`'fr'→'fr'`, `'en'→'en'`) et préserve exactement le
comportement des deux sites qui utilisaient déjà ce repli. Les codes 639-3 irréductibles inconnus
restent lowercased (jamais supprimés). 1391/1391 vitest shared + 30/30 anonymous gateway restent
verts.

## Proposed improvements
1. Exporter `normalizeLanguageForDedup(code: string): string` depuis
   `packages/shared/utils/language-normalize.ts` (SSOT + JSDoc du contrat).
2. `conversation-helpers.normalizeInAppLanguage` délègue au helper (−1 copie).
3. `anonymous.ts:28` (transform zod) délègue au helper (−1 copie).
4. L'agrégat `spokenLanguages` (4 sites `.add`) utilise le helper (**le correctif**).

## Expected benefits
- `spokenLanguages` / `languageCount` canoniques : `'en'`, `'EN'`, `'en-US'` comptent pour **une**
  langue, aucun code malformé exposé.
- SSOT unique pour la dédup de langue verbatim — plus aucune divergence possible entre les sites.

## Implementation complexity
Faible : +1 fonction exportée (~5 lignes utiles + JSDoc), 3 sites convergés, +1 import supprimé,
2 blocs de tests RED→GREEN (gateway route + shared helper).

## Validation criteria
- RED prouvé (agrégat non patché) : `systemLanguage:'en-US'` + `'EN'` + anonyme `'fr'` →
  `spokenLanguages` ≠ `['en','fr']` (test échoue). ✅ prouvé (revert temporaire).
- GREEN : `spokenLanguages: ['en','fr']`, `languageCount: 2`. ✅
- Non-régression : 21/21 `anonymous.test.ts`, 30/30 anonymous (base+extended), 1391/1391 vitest
  shared, `tsc --noEmit` gateway 0 erreur, `tsc` shared 0 erreur. ✅

## Future Considerations
- `MessagingService.ts` / écriture des préférences in-app : normaliser `systemLanguage` &
  co. **à l'écriture** rendrait la base auto-cohérente et supprimerait le besoin de dédup défensive
  côté lecture. Plus large (impacte le stockage historique + migration) — à isoler.
- Auditer les autres agrégats de langue (admin analytics, dashboards) pour le même `.toLowerCase()`
  brut ; `normalizeLanguageForDedup` est maintenant le point de convergence disponible.
