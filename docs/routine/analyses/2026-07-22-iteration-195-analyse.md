# Iteration 195 — Deux derniers sites de troncature aveugle `slice(0,2)` sur un code de langue contournent encore le SSOT `normalizeLanguageCode` : email transactionnel en mauvaise langue (`spa`/`por` → défaut EN) côté gateway + couleur/drapeau de langue divergents côté web (`LanguageOrb` = 6e copie de `FLAG_MAP`, sans `id`)

## Protocole (démarrage)
`main` @ `eea15779` (derniers merges : #2274 android/auth step-navigation ;
#2273 web/v2 language-badge flags via `normalizeLanguageCode` — itération **194** ;
#2271 web/v2 unification `flags.ts` — itération **193**). Branche
`claude/brave-archimedes-isgqzw` réinitialisée sur `origin/main`. Ce cycle prend
**195**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install` ;
`packages/shared` construit (`dist`) car le jest web mappe
`@meeshy/shared/(.*)` → `packages/shared/dist/$1`, et les tests gateway
importent `@meeshy/shared/*`.

PRs ouvertes au démarrage : #2275/#2276 (swarm iOS a11y `laughing-thompson`),
#2277 (android registration gate core), #2278 (iOS story timeline stickers),
#2269 (CI iOS release ANDP) — toutes gérées par d'autres swarms, **non
touchées** (aucune ne concerne la surface TypeScript de cette itération).

Sélection : **Priorité 1 (continuité directe des itérations 193-194)**.
L'itération 194 a branché `normalizeLanguageCode` (SSOT
`packages/shared/utils/language-normalize.ts`) dans `flags.ts` (`getFlag`,
`getLanguageName`), fermant la classe de collisions de la troncature aveugle
`slice(0, 2)` sur les **badges de drapeau**. Un audit exhaustif du reste du
monorepo (`grep 'slice(0, 2)|substring(0, 2)'` filtré aux codes de langue)
révèle que **deux consommateurs actifs de code de langue tronquent encore à
l'aveugle**, dont un côté **backend** avec un impact utilisateur réel.

## Current state

Trois sites hors `flags.ts` normalisent encore un **code de langue** par
troncature `slice(0, 2)` / `substring(0, 2)` :

### 1. Gateway — `EmailService.normalizeLanguage` (BACKEND, impact réel)
`services/gateway/src/services/EmailService.ts:766`
```ts
private normalizeLanguage(language?: string): SupportedLanguage {
  if (!language) return this.defaultLanguage;
  const normalized = language.toLowerCase().substring(0, 2);   // <-- troncature aveugle
  const supported: SupportedLanguage[] = ['fr', 'en', 'es', 'pt', 'it', 'de'];
  return supported.includes(normalized as SupportedLanguage)
    ? (normalized as SupportedLanguage)
    : this.defaultLanguage;
}
```
Point d'entrée unique de **toute** la sélection de langue des emails
transactionnels (vérification, reset mot de passe, alerte sécurité,
notification) : `getTranslations`, `getLocale`, `getSlogan`,
`getFooterContentHtml` délèguent tous à `normalizeLanguage`. Le paramètre
`language` provient de `user.systemLanguage` / préférences utilisateur, dont la
forme canonique peut être un code **ISO 639-2/639-3 3-lettres** (documenté dans
la docstring de `normalizeLanguageCode` : *« cas réels rencontrés
cross-platform : `spa`, `deu`, `fra`, `eng` »*), ou une locale BCP-47.

### 2. Web — `getLanguageColor` (`v2/theme.ts:157`)
```ts
export function getLanguageColor(code: string): string {
  const normalizedCode = code.toLowerCase().slice(0, 2);       // <-- troncature aveugle
  return theme.languageColors[normalizedCode as LanguageCode] || theme.languageColors.default;
}
```
Consommé par **7 composants v2** (`MessageBubble`, `MediaImageCard`,
`MediaAudioCard`, `MediaVideoCard`, `ReplyPreview`, `LanguageOrb`) avec
`translation.languageCode` / `version.languageCode`, où `languageCode` =
`MessageTranslation.targetLanguage` — *« la forme canonique employée partout »*,
donc potentiellement 3-lettres.

### 3. Web — `LanguageOrb.tsx` (6e copie de `FLAG_MAP` + `slice(0,2)`)
`apps/web/components/v2/LanguageOrb.tsx:21` redéclare **encore** une copie
locale de `FLAG_MAP` (20 clés) + `slice(0, 2)` (l.56), alors que l'itération 193
a établi `flags.ts` comme SSOT et 194 y a branché `normalizeLanguageCode`. Cette
copie a **divergé** de la table canonique : elle contient `no` mais **omet
`id`** (Indonésien) — exactement le défaut inverse corrigé sur `MediaVideoCard`
à l'itération 193.

## Problems identified

1. **Email transactionnel rendu dans la MAUVAISE langue (violation du Prisme
   Linguistique, backend).** Pour un code de langue 3-lettres d'une langue
   supportée dont les 2 premières lettres ne forment PAS le code 639-1 cible, la
   troncature rate la table `supported` et tombe sur le défaut (`en`) :
   - `'spa'` (Espagnol, 639-2/T) → `substring(0,2)` = `'sp'` → **absent** de
     `['fr','en','es','pt','it','de']` → email en **anglais** au lieu d'espagnol.
   - `'por'` (Portugais, 639-2) → `'po'` → absent → email en **anglais** au lieu
     de portugais.
   Un utilisateur hispanophone/lusophone dont la préférence est stockée sous
   forme canonique 3-lettres reçoit ses emails de sécurité (reset mot de passe,
   alerte connexion) dans une langue qu'il ne comprend pas.
   (`'ita'`→`'it'`, `'deu'`→`'de'`, `'fra'`→`'fr'`, `'eng'`→`'en'` fonctionnent
   PAR HASARD car les 2 premières lettres coïncident — fragilité, pas
   correction.)

2. **Couleur d'accent de langue incohérente selon la forme du code (web).**
   `getLanguageColor('spa')` → `'sp'` → gris `default` (`#64748B`) au lieu de
   l'ambre espagnol (`#F59E0B`) ; `getLanguageColor('es')` → ambre. La même
   langue rend une couleur d'accent différente selon que le code arrive en 2 ou
   3 lettres — sur les cartes média, la bulle de message et la preview de
   réponse.

3. **Drapeau divergent sur `LanguageOrb` (6e copie de `FLAG_MAP`).**
   `getFlag('id')` (Indonésien) rend 🇮🇩 partout (message bubble, cartes média
   via `flags.ts`) mais 🌐 (globe) sur `LanguageOrb`, car sa copie locale omet
   `id`. Identique au défaut inverse `no`/vidéo corrigé en 193. De plus, tout
   code 3-lettres/BCP-47 y est tronqué à l'aveugle (`slice(0,2)`), non normalisé.

4. **Dette DRY persistante.** La paire `FLAG_MAP` + troncature réapparaît une 6e
   fois malgré l'unification 193/194 ; `getLanguageColor` et `getFlag`
   normalisent différemment (SSOT vs `slice`), incohérence interne au même
   dossier `v2/`.

## Root causes
- Troncature `slice(0,2)`/`substring(0,2)` écrite avant l'existence du SSOT
  `normalizeLanguageCode` (introduit itérations 190+), jamais rebranchée sur ces
  trois sites lors de la migration 193/194 (audit incomplet — 194 ne couvrait
  que `flags.ts`).
- `LanguageOrb` a été écrit avant l'extraction de `flags.ts` (193) et n'a jamais
  été migré vers `getFlag`, laissant une copie qui a divergé indépendamment.

## Business impact
- **Élevé (gateway)** : un email de sécurité (reset mot de passe) en mauvaise
  langue dégrade la confiance et peut bloquer un utilisateur qui ne comprend pas
  l'instruction — friction linguistique directe, l'anti-thèse du Prisme.
- **Faible-moyen (web)** : incohérence visuelle (couleur/drapeau) sur du contenu
  multilingue ; cosmétique mais visible et contraire à la cohérence produit.

## Technical impact
- Élimine les **2 derniers** sites de troncature aveugle de code de langue du
  monorepo TS et la **6e** copie de `FLAG_MAP` → convergence totale sur le SSOT.
- Réduit la surface de régression future (une langue ajoutée/corrigée ne se
  propage plus qu'en un point).

## Risk assessment
- **Faible.** `normalizeLanguageCode` est un SSOT pur, testé, déjà consommé en
  prod (`resolveUserLanguage`, `flags.ts`). Les cas qui fonctionnaient par
  hasard (`en-US`→`en`, `pt-BR`→`pt`, `ita`→`it`) restent identiques ; seuls les
  cas cassés (`spa`→`es`, `por`→`pt`, `id` sur `LanguageOrb`) changent — tous
  vers le comportement correct. `LanguageOrb` délègue à `getFlag` (déjà testé).

## Proposed improvements
1. **Gateway** : `EmailService.normalizeLanguage` compose `normalizeLanguageCode`
   (réduction 639-2/3 → 639-1) PUIS teste l'appartenance à l'ensemble des 6
   langues email supportées. `undefined` ou hors-ensemble → `defaultLanguage`.
2. **Web `theme.ts`** : `getLanguageColor` remplace `slice(0,2)` par
   `normalizeLanguageCode(code)` avant lookup (fallback `default` inchangé).
3. **Web `LanguageOrb.tsx`** : supprimer la copie locale `FLAG_MAP` + `slice`,
   déléguer à `getFlag` de `flags.ts` (SSOT). Le drapeau fourni explicitement
   (`flag` prop) reste prioritaire.

## Expected benefits
- Emails transactionnels toujours dans la langue de l'utilisateur (Prisme
  respecté jusque dans le canal email).
- Couleur + drapeau de langue cohérents quelle que soit la forme du code, sur
  tout le dossier `v2/`.
- Zéro copie divergente de `FLAG_MAP` restante ; un seul chemin de
  normalisation de code de langue dans tout le TS.

## Implementation complexity
**Faible.** 3 fichiers de production (1 gateway + 2 web), edits ciblés ; 2
fichiers de test (1 gateway étendu, 1 web nouveau). Aucun changement de schéma,
d'API, de dépendance.

## Validation criteria
- **RED prouvé** :
  - gateway : `sendPasswordResetEmail({ language: 'spa' })` attend `'Hola'`,
    `{ language: 'por' }` attend `'Olá'` → échouent sur `main` (rendu EN).
  - web : `getLanguageColor('spa')` attend l'ambre `#F59E0B` → échoue (`default`).
- **GREEN** après fix ; suites existantes (`EmailService.test.ts`,
  `flags.test.ts`) inchangées et vertes.
- `bun run test` gateway + web ciblés verts ; typecheck OK ; aucune régression.
