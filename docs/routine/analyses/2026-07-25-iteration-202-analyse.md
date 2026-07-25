# Iteration 202 — `use-profile-v2.getLanguageName` : dernière copie inline **vivante** de « code langue → nom » sur la surface profil, romanisée ASCII et plafonnée à 13 langues → convergence sur le SSOT `getLanguageInfo`

## Protocole (démarrage)
`main` @ `0ae263e9` (derniers merges : #2296 android/chat gate composer ;
#2294 android/auth anonymous-session ; suite E2E réglages gateway/iOS). Branche
`claude/brave-archimedes-cnacxu` réinitialisée sur `origin/main`. Ce cycle prend
**202** (les numéros 199/200/201 sont déjà consommés par des swarms concurrents,
voir plus bas).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `packages/shared/dist` construit via
`tsc --project tsconfig.json` (le jest web mappe `@meeshy/shared/(.*)` →
`packages/shared/dist/$1`). `bun install` complet bloqué à l'étape
`prisma generate` (download engine bloqué par le proxy — connu depuis it. 198) ;
sans impact : le correctif est **web-only**, ne touche aucun type Prisma, et le
build `tsc` de `shared` ne dépend pas de Prisma.

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2291** (199i) : converge `apps/web/components/v2/flags.ts`
  (`getFlag`/`getLanguageName`) sur le SSOT — **la cible #1 de l'audit it. 198**.
  Déjà couverte. **Non touchée.**
- **#2293** (200i) : converge le relative-time du dashboard agent
  (`classifyRelativeTime`) — cible #2 de l'audit it. 198. **Non touchée.**
- **#2295** (201i) : restaure le `nativeName` arménien corrompu dans le SSOT.
  **Non touchée.**
- #2282/#2276/#2275 : swarms iOS a11y VoiceOver — hors surface TypeScript.
  **Non touchées.**

Les trois cibles nommées par l'audit it. 198 étant déjà prises, cette itération
identifie une **4ᵉ copie inline vivante** de la même classe de défaut
(réimplémentation locale divergente du SSOT de langues), non couverte par aucune
PR ouverte.

## Sélection : **Priorité 1 — convergence SSOT, surface profil v2**

`apps/web/hooks/v2/use-profile-v2.ts` (rendu par `app/(connected)/me/page.tsx`,
la page profil v2) portait sa **propre** table `LANGUAGE_NAMES` :

```ts
const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'Francais',   // ← ASCII romanisé, sans cédille
  en: 'English',
  es: 'Espanol',    // ← sans tilde
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Portugues',  // ← sans tilde ni accent
  zh: '中文', ja: '日本語', ko: '한국어', ar: 'العربية', ru: 'Русский', hi: 'हिन्दी',
  multi: 'Multilingue',
};
function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}
```

Le SSOT `packages/shared/utils/languages.ts` (`getLanguageInfo(code)`) couvre
**60+ langues** avec `nativeName` correct (Français, Español, Português,
Nederlands, Polski, Türkçe…), déjà normalisé via `normalizeLanguageCode`, et déjà
adopté par toute la surface bubble-message / v2 (via #2291).

## Current state (avant correctif)

La page profil v2 affiche la liste des langues d'un utilisateur (native / fluent
/ learning) à partir de `systemLanguage`, `regionalLanguage`,
`customDestinationLanguage`. Le nom affiché passait par la table inline ci-dessus.

## Problems identified

1. **Noms romanisés ASCII — défaut d'exactitude visible.** `fr → « Francais »`
   (sans cédille), `es → « Espanol »` (sans tilde), `pt → « Portugues »` (sans
   accent). Le reste de l'app (sélecteur de langue, bulles, badges) affiche
   « Français » / « Español » / « Português ». Deux orthographes pour la même
   langue selon l'écran.
2. **Couverture plafonnée à 13 langues.** Toute langue hors des 13 entrées
   (nl, pl, tr, sv, da, fi, cs, ro, hu, el, he, fa, bn, ur, sw, yo… — 47+ codes)
   tombait sur `code.toUpperCase()` : un utilisateur néerlandophone voyait
   **« NL »** au lieu de « Nederlands » sur son profil.
3. **Incohérence inter-écrans.** Même donnée (`systemLanguage: 'pt'`) rendue
   « Portugues » sur le profil mais « Português » dans le sélecteur de langue.
4. **Fallback par défaut divergent.** L'absence de langue poussait un
   `name: 'Francais'` codé en dur (même défaut d'accent).
5. **Dette : 4ᵉ copie d'une logique déjà centralisée** (après flags v2 #2291,
   relative-time #2293, formatFileSize it. 198).

## Root causes

Table écrite localement avant/à côté de l'existence du SSOT `getLanguageInfo`,
avec un jeu de noms romanisés (probablement pour éviter des soucis d'encodage
initiaux) et une couverture partielle, jamais recâblée lors de la centralisation.
Classe identique aux itérations 195-201.

## Business impact

Page profil v2 (`/me`) — surface utilisateur directe, pas admin. Tout utilisateur
dont la langue système/régionale/custom n'est ni l'une des 5 langues latines
romanisées correctement présentées voit un nom mal orthographié ou un code brut
en capitales. Portée : 100 % des utilisateurs consultant leur profil, défaut
purement cosmétique mais très visible (le nom de SA langue mal écrit).

## Technical impact

−18 lignes de données figées et de helper ; import d'un SSOT déjà présent dans le
bundle v2 (tiré par la surface bubble-message). Aucun coût runtime : une lecture
de `Map` (cache de langues du SSOT) remplace une lecture d'objet littéral.

## Risk assessment

Faible. Web-only ; aucun schéma/API/migration/clé i18n. Le seul écart de
comportement théorique : `getLanguageName('multi')` renvoyait « Multilingue »,
désormais « MULTI » — mais `'multi'` est un pseudo-code **de conversation**
(`utils/v2/transform-conversation.ts:104`), jamais une valeur des champs
`systemLanguage`/`regionalLanguage`/`customDestinationLanguage` d'un utilisateur
(alimentés par le sélecteur, qui n'expose que des codes réels de
`SUPPORTED_LANGUAGES`). Chemin **inatteignable** ici.

## Proposed improvements (implémenté)

`getLanguageName` délègue à `getLanguageInfo(code).nativeName ?? .name` :
- restaure les noms natifs corrects (Français, Español, Português…),
- couvre les 60+ langues du SSOT (nl → Nederlands, pl → Polski…),
- préserve le fallback code-en-capitales pour un code inconnu (le SSOT retourne
  `name: code.toUpperCase()`, `nativeName: undefined` → `?? name` = capitales),
- le fallback « pas de langue » utilise `getLanguageName('fr')` = « Français ».

## Expected benefits

Convergence orthographique profil ↔ sélecteur ↔ bulles ; +47 langues rendues
correctement ; −18 lignes de dette ; une source unique pour les noms de langue.

## Implementation complexity

**Triviale** — 1 fichier de prod (import + suppression table + réécriture helper
+ fallback), 1 fichier de test (+4 tests).

## Validation criteria

- 4 nouveaux tests : fr → « Français », es → « Español », nl → « Nederlands »,
  pt → « Português », fallback vide → « Français ». Échec confirmé sur l'ancien
  code (« Francais » / « NL »).
- Suite `use-profile-v2.test.tsx` verte (40/40).
- Suite `__tests__/hooks/v2` verte (85/85, 4 suites).
- Aucune erreur `tsc` introduite sur les fichiers modifiés.

## Future improvements (audit — mises en file)

1. **`apps/web/utils/language-utils.ts`** (`en → 🇺🇸` vs SSOT 🇬🇧, `LANGUAGE_NAMES`
   noms natifs) — **bloqué sur décision produit** : couvre ~25 langues absentes
   du SSOT ; converger les régresserait (prérequis : étendre `SUPPORTED_LANGUAGES`
   + le miroir Python, ou les scoper hors). Documenté par #2291 et #2295.
2. **`apps/web/utils/audio-effects-config.ts`** exporte une table `LANGUAGE_NAMES`
   — à qualifier : usage TTS/voix (peut nécessiter des libellés propres au
   contexte voix) vs simple affichage. À auditer avant convergence.
3. **`v2/CommentItem.tsx:28`** time-ago anglais codé en dur — bloqué sur l'absence
   de câblage `t()` sur la surface v2 (noté par #2293).
4. **Copies `formatDate` ad-hoc** (~30 sites `toLocaleDateString`) vs un SSOT de
   **date absolue** à créer (distinct du `date-format.ts` relatif existant) —
   cible #3 de l'audit it. 198, impact moyen, diffuse.
