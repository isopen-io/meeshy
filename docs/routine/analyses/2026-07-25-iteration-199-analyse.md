# Iteration 199 — `v2/flags.ts` : convergence de la carte drapeau/nom vers le SSOT `getLanguageInfo` (fin du fallback globe 🌐 pour 40+ langues + noms natifs restaurés sur toute la surface chat v2)

## Protocole (démarrage)
`main` @ `e2cb1673` (derniers merges : #2289 web/admin media file-size badge →
`formatFileSize` SSOT — itération 198). Branche `claude/brave-archimedes-79c0j1`
réinitialisée sur `origin/main`. Ce cycle prend **199**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `packages/shared` déjà construit (`dist`) ; le
jest web mappe `@meeshy/shared/(.*)` → `packages/shared/dist/$1`.

PRs ouvertes au démarrage : #2290 (android registration VM), #2282/#2276/#2275
(iOS a11y VoiceOver) — **toutes gérées par d'autres swarms**, aucune ne touche la
surface TypeScript web ni le module `v2/flags.ts` → aucun conflit possible.

Sélection : **Priorité 1 — cible explicitement mise en file par l'itération 198**
(section « Future improvements », rang #1, « impact le plus élevé ») :
> Cartes drapeau/nom de langue — divergence 3-voies vivante sur la surface chat
> principale. Convergence : router `getFlag`/`getLanguageName` sur
> `getLanguageInfo`. **Cible recommandée itération 199.**

Cette itération ferme la **même classe de défaut** (réimplémentation locale
divergente d'un SSOT existant) que les itérations 190-198, appliquée à la carte
code-langue → drapeau / nom sur la surface chat v2.

## Current state

Trois implémentations indépendantes de « code langue → drapeau / nom »
coexistent :

- **SSOT** : `packages/shared/utils/languages.ts` — `getLanguageInfo(code)` sur
  **60+** langues, avec `flag`, `name` (anglais) et `nativeName` (natif). `en → 🇬🇧`.
  Résolution déjà robuste (normalisation `.toLowerCase().trim()`, cache).
- **Copie A** : `apps/web/utils/language-utils.ts` (`getLanguageFlag`/
  `getLanguageDisplayName`) — `en → 🇺🇸`, noms natifs. *(hors périmètre 199 : voir
  Future improvements — le flag `en` diverge et un test contradictoire exige une
  décision produit.)*
- **Copie B — CIBLE 199** : `apps/web/components/v2/flags.ts` (`getFlag`,
  `getLanguageName`) — carte locale de **21 langues seulement**, noms romanisés
  ASCII (`Espanol`, `Nihongo`, `Zhongwen`, `Hangugeo`, `Russkiy`, `Arabiya`).

`v2/flags.ts` alimente **toute** la surface chat/média/social v2 :
`MessageBubble`, `LanguageOrb`, `TranslationToggle`, `MediaImageCard`,
`MediaAudioCard`, `MediaVideoCard`, `PostCard`, `PostDetail`, `StatusBar`
(11 fichiers). C'est la surface la plus visible du produit.

### `v2/flags.ts` (avant correctif)
```ts
export const FLAG_MAP: Record<string, string> = { fr, en, es, zh, ja, ar, de,
  pt, ko, it, ru, hi, nl, pl, tr, vi, th, id, sv, uk, no };   // 21 langues
export const LANGUAGE_NAMES: Record<string, string> = { fr: 'Francais',
  es: 'Espanol', zh: 'Zhongwen', ja: 'Nihongo', ... };        // romanisé ASCII
export function getFlag(code) { ...FLAG_MAP[normalized] || GLOBE; }
export function getLanguageName(code) { ...LANGUAGE_NAMES[normalized] || CODE; }
```
Le module route déjà `normalizeLanguageCode` (bien) mais retombe sur une carte
locale de 21 entrées.

## Problems identified

1. **Fallback globe 🌐 pour 40+ langues supportées — défaut visible sur la surface
   chat.** Toute langue absente des 21 entrées locales (da, fi, cs, ro, hu, bg,
   hr, el, he, fa, bn, ur, ms, sw, am, yo, ha + toutes les langues africaines et
   camerounaises) affiche un **globe générique** à la place de son drapeau
   national dans les bulles, orbes, et cartes média. Un message coréen affiche
   ✅ 🇰🇷 (dans la carte) mais un message amharique/hébreu/persan affiche 🌐.
2. **Noms romanisés ASCII incohérents.** `Espanol` (au lieu de `Español`),
   `Nihongo` (au lieu de `日本語`), `Zhongwen` (au lieu de `中文`),
   `Russkiy` (au lieu de `Русский`) — accent-strippés et translittérés là où le
   reste de l'app (Copie A, sélecteurs de langue) affiche le nom natif réel.
3. **Incohérence inter-écrans.** Le même code langue rend un drapeau/nom dans le
   sélecteur de langue (SSOT/Copie A) et un autre dans la bulle de message (v2) —
   deux vérités pour la même donnée.
4. **Dette : carte de 21 langues gelée** qui doit être maintenue à la main à
   chaque ajout de langue, alors que le SSOT en couvre 60+.

## Root causes

Carte extraite de `MessageBubble` (cf. en-tête du fichier) avant/à côté de
l'adoption du SSOT `getLanguageInfo`, jamais recâblée lors de la centralisation.
Classe identique aux itérations 195-198 (troncature de code langue, helpers
d'affichage utilisateur, présence, taille de fichier).

## Business impact

Surface chat/social v2 = cœur du produit, tous rôles. Un utilisateur consommant
du contenu dans une des 40+ langues non mappées voit un globe anonyme au lieu du
drapeau attendu → dégrade le Prisme Linguistique (« le contenu traduit s'affiche
comme du contenu natif, avec un indicateur subtil »). Les noms romanisés
dégradent la lisibilité pour les locuteurs natifs.

## Technical impact

- Suppression de 2 cartes locales (FLAG_MAP 21 + LANGUAGE_NAMES 21) → délégation
  pure au SSOT testé de 60+ langues.
- `getFlag` : 40+ langues gagnent leur drapeau national ; **zéro régression** sur
  les 21 déjà mappées (les drapeaux locaux étaient déjà identiques au SSOT,
  `en → 🇬🇧` inclus).
- `getLanguageName` : noms natifs restaurés (`Español`, `日本語`, `中文`…),
  cohérents avec le sélecteur de langue et le reste de l'app.
- Aucun coût de bundle : le module `languages` est **déjà** dans le bundle v2 (via
  `language-normalize` qui importe `getSupportedLanguageCodes`).
- Sémantique de bord **préservée** : `getFlag('')`/`getFlag('xx')` → 🌐 (garde
  `!normalized` + entrée synthétique globe du SSOT) ; `getLanguageName('fil')` →
  `FIL` (code 3-lettres non réductible → `undefined` → code brut majusculé).

## Risk assessment

**Faible.** Changement web-only, aucune API/schéma/migration/clé i18n. Les
consommateurs affichent librement le drapeau/nom (aucune assertion de format en
prod). Le SSOT `getLanguageInfo` est couvert par
`packages/shared/__tests__/utils/languages.test.ts`. `normalizeLanguageCode`
(déjà utilisé par le module courant) est inchangé. Les seules assertions de test
dépendantes sont dans `flags.test.ts` (mises à jour dans le même commit) ;
`post-card-enhanced.test.tsx` **mocke** le module.

## Proposed improvements

Réécrire `v2/flags.ts` en deux adaptateurs fins sur le SSOT :
```ts
export function getFlag(code) {
  const n = normalizeLanguageCode(code);
  return n ? getLanguageInfo(n).flag : GLOBE;   // synthétique = '🌐'
}
export function getLanguageName(code) {
  const n = normalizeLanguageCode(code);
  if (!n) return code ? code.toUpperCase() : 'Unknown';
  const info = getLanguageInfo(n);
  return info.nativeName ?? info.name;
}
```
Supprimer `FLAG_MAP` / `LANGUAGE_NAMES` (aucun consommateur hors re-export
`v2/index.ts` + test), et leur re-export dans `v2/index.ts`.

## Expected benefits

- Drapeau national pour les 60+ langues supportées dans les bulles/orbes/cartes
  média — plus de globe pour l'amharique, l'hébreu, le persan, le bengali, etc.
- Noms natifs réels (`Español`, `日本語`) partout sur la surface v2, cohérents
  avec le sélecteur de langue.
- −42 lignes de cartes gelées ; une carte de moins à maintenir.
- 1 des 3 voies de divergence fermée (la plus impactante).

## Implementation complexity

**Faible** — 1 fichier de prod réécrit (`v2/flags.ts`), 1 re-export retiré
(`v2/index.ts`), 1 fichier de test mis à jour (`flags.test.ts` : `spa` →
`Español`, drapeaux via `getFlag`, tests « plus de globe » ajoutés, bloc « maps
stay in sync » retiré).

## Validation criteria

- `flags.test.ts` vert : `getFlag('swe')`→🇸🇪, `getFlag('am')`≠🌐 (nouveau),
  `getLanguageName('spa')`→`Español` (mis à jour), `getLanguageName('ja')`→`日本語`
  (nouveau), bords `''`/`xx`/`fil` préservés.
- Suites v2 dépendantes vertes (`translation-toggle`, `post-card-enhanced`,
  `theme`).
- Aucune erreur `tsc` introduite sur les fichiers modifiés.

## Future improvements (audit exhaustif — mises en file pour cycles suivants)

1. **Copie A `apps/web/utils/language-utils.ts` (`en → 🇺🇸`).** Convergence
   bloquée par une **décision produit** : le flag `en` diverge (🇺🇸 vs SSOT 🇬🇧)
   et `language-utils.test.ts:77` assert `en→🇺🇸`. Trancher le drapeau canonique
   `en` (recommandation : SSOT 🇬🇧 par principe « Single Source of Truth ») puis
   router `getLanguageDisplayName`/`getLanguageFlag` sur `getLanguageInfo`
   (`nativeName` pour l'affichage). Consommée par `ActiveUsersSection`,
   `use-conversation-stats`.
2. **Cartes de noms romanisés ad-hoc restantes** (mêmes ASCII `Espanol`/
   `Portugues`/`Turkce`) : `apps/web/hooks/v2/use-profile-v2.ts`,
   `apps/web/app/admin/broadcasts/new/page.tsx` — petites listes locales à router
   sur le SSOT.
3. **`classifyRelativeTime`** — 5 copies « time ago » locales (dont
   `v2/CommentItem` anglais non-i18n). *(inchangé depuis 198)*
4. **`date-format.ts`** — ~15 copies `formatDate` ad-hoc. *(inchangé depuis 198)*

### Note de qualité de données (hors périmètre, à corriger séparément)
`languages.ts` l.430-433 : l'entrée arménienne (`hy`) contient des placeholders
corrompus `'Հdelays'` / `translateText: 'Թdelays delays…'` (le mot `delays` a
écrasé le texte natif). À réparer dans un commit dédié SSOT (touche le drapeau
`hy → 🇦🇲` correct mais le `nativeName` est cassé).
</content>
</invoke>
