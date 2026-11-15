# Itération 287 — `MessageTranslationService` canonicalise ses codes de langue via la SSOT `normalizeLanguageForDedup`

Jumeau de l'itération 286 (`PostService.audienceLanguages`). La campagne « une
source de vérité par règle de langue » (cycles 118→286) a une SSOT dédiée au
couple normalisation-avec-repli utilisé partout où des codes verbatim sont
agrégés/dédupliqués : `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts:175`). L'itération 286 y a rallié le
résolveur d'audience des **stories**. Son jumeau — le résolveur d'audience des
**messages de conversation** — en divergeait encore : `MessageTranslationService`
inlinait `normalizeLanguageCode(x) ?? x.toLowerCase()` à **six** sites.

## État actuel (avant ce lot)

Six sites du service canonicalisaient un code de langue par la forme inline :

```ts
normalizeLanguageCode(x) ?? x.toLowerCase()
```

- `_resolveTargetLanguages` (source à filtrer + chaque cible, lignes 466/471)
- `_normalizeSourceLanguage` (source envoyée au translator, ligne 502)
- `_retranslationTaskKey` (clé du garde d'ordonnancement, ligne 759)
- `_extractConversationLanguages`, branche anonyme (dédup du `Set` de cibles, ligne 909)
- lecture d'une traduction stockée par sa clé (ligne 3157)

La branche enregistrée passe déjà par `resolveUserLanguagesOrdered`
(`conversation-helpers.ts`), qui région-strippe et déduplique correctement — elle
n'était pas concernée.

## Problème identifié

`normalizeLanguageForDedup(code)` vaut `normalizeLanguageCode(code) ?? <sous-tag
primaire lowercased>`. L'inline emploie `?? code.toLowerCase()` — la chaîne
ENTIÈRE, région comprise. Les deux formes **divergent pour tout code hors
catalogue tagué région**, mesuré :

| entrée | inline (`?? toLowerCase`) | SSOT `normalizeLanguageForDedup` |
|---|---|---|
| `en-US`, `pt-BR`, `fr-FR`, `FR` | `en` / `pt` / `fr` / `fr` | idem (identiques) |
| **`fil-PH`** (Filipino, hors catalogue) | **`fil-ph`** | **`fil`** |
| **`ceb-PH`** (Cebuano) | `ceb-ph` | `ceb` |
| `yue-HK`, `tlh-XX` | `yue-hk` / `tlh-xx` | `yue` / `tlh` |

`fil-PH` n'est pas un cas d'école : c'est `Locale.current` sur un appareil
philippin, et le Filipino est précisément l'exemple que la SSOT documente
(l'utilisateur philippin qui recevait des traductions finnoises). Trois
conséquences mesurées :

1. **Dédup de cibles (branche anonyme).** Un participant anonyme stocke `language`
   sans validation (schéma de join = `z.string()` nu). Deux participants
   `'fil-PH'` et `'fil'` comptaient pour **deux** langues cibles ; le translator
   recevait un travail `'fil-ph'` — cible que `LANGUAGE_MAPPINGS` ne connaît pas —
   dupliquant la vraie cible `'fil'`.

2. **Filtre de la langue source (`_resolveTargetLanguages`).** La source et les
   cibles étant canonicalisées par l'inline, une source `'fil-PH'` (→ `'fil-ph'`)
   ne matchait pas une cible `'fil'` : le filtre anti-auto-traduction la laissait
   passer, et un travail `fil → fil` était demandé — NLLB altère le texte et
   stocke une fausse traduction du message de l'utilisateur (le défaut même que la
   fonction dit prévenir).

3. **Cohérence envoi ↔ stockage ↔ lecture.** Ce que le service ENVOIE au
   translator devient la clé STOCKÉE, relue à la ligne 3157. Les cinq sites
   d'envoi et le site de lecture doivent donc partager la MÊME canonicalisation ;
   sinon un target neuf `'fil'` stocké ne se relit pas depuis un `'fil-PH'`
   demandé.

## Cause racine

Le service adoptait `normalizeLanguageCode` (cycle antérieur) mais pas la SSOT du
couple **normalisation-avec-repli** `normalizeLanguageForDedup`, reconnue et
documentée seulement plus tard (cycle 286). Six ré-implémentations inline du
repli, divergentes sur le stripping de région hors catalogue.

## Impact

- **Technique** : requêtes ZMQ invalides (`'fil-ph'`) et dupliquées ; travail
  d'auto-traduction `fil → fil` gaspillé et stockant une fausse traduction.
- **Produit (Prisme, dimensions Complétude + Performance + Simplicité)** : sous
  forte diversité de locales hors catalogue, une langue réelle pouvait ne pas être
  traduite proprement, rétrogradant le lecteur sur l'original.
- **Maintenabilité** : six jumelles divergentes d'une même règle — la dette exacte
  que la campagne SSOT résorbe.
- **Sécurité** : nulle.

## Risque

Faible. Fonctions PURES/statiques ou lecture idempotente. Zéro régression sur les
codes du catalogue (`normalizeLanguageForDedup` y est idempotent, mesuré). La
seule différence de comportement est le stripping de région d'un code HORS
catalogue — strictement un resserrement. Legacy : la lecture (3157) tente la clé
verbatim AVANT la clé normalisée, donc un document legacy à clé régionale exacte
reste servi.

## Amélioration livrée

Remplacer les six inline `normalizeLanguageCode(x) ?? x.toLowerCase()` par la SSOT
`normalizeLanguageForDedup(x)` (import resserré ; `normalizeLanguageCode` n'est
plus référencé dans le fichier). Boucle envoi/stockage/lecture canonicalisée par
une seule fonction.

## Bénéfices attendus

- Le translator ne reçoit que des codes NLLB canoniques, dédupliqués par LANGUE.
- Le filtre anti-auto-traduction attrape aussi les sources hors catalogue.
- Une source de vérité de canonicalisation de plus rejoint la SSOT partagée.

## Complexité d'implémentation

Triviale — 6 remplacements de production, import resserré, doc-comments alignés.

## Critères de validation

- `message-translation-destinations.test.ts` : nouveau cas RED (dédup `fil-PH`/`fil`
  → `['fil']`) vert après le fix ; 6 pins existants inchangés.
- `message-translation-source-language.test.ts` : 2 nouveaux cas RED (source
  `fil-PH → fil` ; filtre `fil` contre source `fil-PH`) verts ; 5 pins inchangés.
- 4 suites `MessageTranslationService*` (197 tests) vertes.
- `tsc --noEmit` gateway : 0 erreur.
- Cliquet de budget de taille (`gateway-file-size-budget`) : vert (fichier ≤ 3303).
