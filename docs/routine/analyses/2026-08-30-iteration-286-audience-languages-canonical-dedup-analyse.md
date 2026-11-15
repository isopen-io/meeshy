# Itération 286 — `PostService.audienceLanguages` canonicalise ses codes avant le filtre de pivot et la déduplication

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→285,
Prisme + `recipient-language.ts`). En balayant les résolveurs de langue serveur
NON couverts par la SSOT de canonicalisation, un cœur PUR de résolution d'audience
dédupliquait et filtrait sa langue-pivot sur des codes **verbatim**, jamais
canonicalisés : `PostService.audienceLanguages`.

## État actuel (avant ce lot)

```ts
static audienceLanguages(systemLanguages: Array<string | null | undefined>): string[] {
  return [...new Set(
    systemLanguages.filter((l): l is string => !!l && l !== 'en')
  )].slice(0, 10);
}
```

Cette fonction pure calcule les **langues cibles NLLB** dans lesquelles une story
est traduite pour son audience (participants des conversations communes de
l'auteur). Elle est partagée par les DEUX pipelines de traduction de story
(`triggerStoryTextTranslation` sur le `content`, et le pipeline `textObjects`),
via `resolveAudienceTargetLanguages`, qui l'alimente directement depuis
`contacts.map((c) => c.user?.systemLanguage)`.

## Problème identifié

`systemLanguage` est **persisté verbatim** — `z.string().optional()`, aucune
normalisation à l'écriture (règle documentée par `normalizeInAppLanguage`,
`packages/shared/utils/conversation-helpers.ts:68`). Les valeurs BCP-47
région-taguées ou en casse mixte produites par le web (`Accept-Language`) et iOS
(`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`, `'FR'`, `'fr_FR'` —
atteignent donc CE résolveur intactes. Trois conséquences, toutes mesurées :

1. **La langue-pivot échappe au filtre.** Le filtre `l !== 'en'` retire l'anglais
   (langue pivot NLLB, jamais une cible), mais `'en-US'` et `'EN'` le franchissent.
   Un membre d'audience anglophone déclaré `'en-US'` faisait donc émettre une
   requête de traduction vers `'en-US'` — une cible que NLLB ne reconnaît pas.

2. **Les variantes régionales dédupliquent comme des langues DISTINCTES.** Le
   `new Set` compare des chaînes brutes : `'fr'`, `'fr-FR'` et `'FR'` comptent pour
   **trois** cibles au lieu d'une. Le translator recevait des travaux dupliqués
   pour la même langue, et le plafond de 10 se remplissait de variantes au lieu
   de langues réelles.

3. **Le plafond de 10 s'applique aux variantes, pas aux langues.** Une audience de
   6 langues réelles réparties sur 12 variantes régionales pouvait saturer le cap
   et priver de traduction une langue réelle rangée après.

## Cause racine

Le résolveur n'appelait pas la SSOT de canonicalisation-avec-dedup
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts:175`),
dont le doc-comment nomme EXACTEMENT ce cas d'usage : « SSOT unique du couple
normalisation-avec-repli employé partout où des codes verbatim … sont agrégés en
une liste ou dédupliqués — un `.toLowerCase()` brut compterait `'en'` et `'en-US'`
comme deux langues distinctes ». Le reste du répertoire (aperçu de liste, bannière
de notification, recipient-language) passe déjà par cette SSOT ; ce résolveur en
divergeait en silence.

## Impact

- **Technique** : requêtes ZMQ de traduction invalides (`'en-US'`, `'pt-BR'`) et
  dupliquées (`'fr'` + `'fr-FR'`) envoyées au translator ; CPU/mémoire GPU gaspillés.
- **Produit (Prisme, dimension Complétude + Performance)** : sous forte diversité
  de variantes, une langue réelle d'audience pouvait ne PAS être traduite (cap
  saturé), rétrogradant ce lecteur sur l'original — une violation indirecte du
  Prisme (le contenu n'est pas disponible dans sa langue alors qu'il aurait dû l'être).
- **Sécurité** : nulle (pas de fuite ; codes déjà passés en aval, ici resserrés).

## Risque

Faible. Fonction PURE, statique, sans état, un seul type d'entrée. La
canonicalisation ne fait que RESSERRER l'ensemble sortant (moins de cibles, jamais
plus) et préserve l'ordre de première apparition. Les codes canoniques déjà propres
sont idempotents sous `normalizeLanguageForDedup` (zéro régression sur les 4 pins
existants, vérifié).

## Amélioration livrée

Canonicaliser chaque code non vide via `normalizeLanguageForDedup` AVANT de filtrer
le pivot `'en'` et de dédupliquer :

```ts
const canonical = systemLanguages
  .filter((l): l is string => !!l)
  .map(normalizeLanguageForDedup)
  .filter((l) => l !== '' && l !== 'en');
return [...new Set(canonical)].slice(0, 10);
```

## Bénéfices attendus

- Le translator ne reçoit plus que des codes NLLB canoniques (2-lettres lowercase),
  dédupliqués par LANGUE réelle.
- Le plafond de 10 compte des langues, pas des variantes.
- La langue-pivot est filtrée quelle que soit sa forme d'écriture.
- UNE source de vérité de canonicalisation de plus rejoint la SSOT partagée.

## Complexité d'implémentation

Triviale — 4 lignes de production, un import élargi (`normalizeLanguageForDedup`),
3 nouveaux pins de comportement.

## Critères de validation

- `PostService.audienceLanguages.test.ts` : 3 nouveaux cas RED sur l'ancien code
  (pivot région-tagué, dédup de variantes, cap post-dédup), verts après le fix ;
  4 pins existants inchangés.
- 8 suites `PostService*` + `PostFeedService` (184 tests) vertes.
- `tsc --noEmit` gateway : 0 erreur.
- `normalizeLanguageForDedup` présent dans le dist shared (`.js` + `.d.ts`).
