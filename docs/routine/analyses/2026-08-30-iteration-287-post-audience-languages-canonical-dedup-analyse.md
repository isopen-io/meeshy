# Itération 287 — `PostService.audienceLanguages` canonicalise ses codes avant le filtre de pivot et la déduplication

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→286,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). En balayant les
résolveurs de langue serveur NON couverts par la SSOT de canonicalisation, un cœur
PUR de résolution d'audience dédupliquait et filtrait sa langue-pivot sur des codes
**verbatim**, jamais canonicalisés : `PostService.audienceLanguages`.

> Note de continuité : une branche superseded (`claude/brave-archimedes-jngpu1`,
> ancien iteration-286) portait déjà ce correctif, mais `main` a pris un
> iteration-286 DIFFÉRENT (stream-translation-stats). Le défaut est donc encore
> vivant sur `main` — vérifié par lecture directe de `PostService.ts:630` avant
> ce lot. Repris tel quel, avec des témoins élargis.

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
`packages/shared/utils/conversation-helpers.ts`). Les valeurs BCP-47
région-taguées ou en casse mixte produites par le web (`Accept-Language`) et iOS
(`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`, `'FR'`, `'fr_FR'` —
atteignent donc CE résolveur intactes. Trois conséquences, toutes mesurées par
témoin RED :

1. **La langue-pivot échappe au filtre.** Le filtre `l !== 'en'` retire l'anglais
   (langue pivot NLLB, jamais une cible), mais `'en-US'` et `'EN'` le franchissent.
   Un membre d'audience anglophone déclaré `'en-US'` faisait donc émettre une
   requête de traduction vers `'en-US'` / `'en'` — une cible que le pipeline
   n'aurait jamais dû viser.

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
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`), dont
le doc-comment nomme EXACTEMENT ce cas d'usage : « SSOT unique du couple
normalisation-avec-repli employé partout où des codes verbatim … sont agrégés en
une liste ou dédupliqués — un `.toLowerCase()` brut compterait `'en'` et `'en-US'`
comme deux langues distinctes ». Le reste du répertoire (aperçu de liste, bannière
de notification, recipient-language, `anonymous.ts` `spokenLanguages`) passe déjà
par cette SSOT ; ce résolveur en divergeait en silence.

## Impact métier

Traductions de story dupliquées et cibles invalides envoyées au translator :
gaspillage de calcul ML (le poste le plus cher du pipeline) et, dans le pire cas
(saturation du cap par des variantes), une langue réelle de l'audience privée de
traduction — un membre voit la story dans la langue de l'auteur au lieu de la
sienne. Dimension 2 (Performance) et 13 (Complétude) du `CLAUDE.md`.

## Impact technique

Surface minimale : une fonction pure, un `map` de canonicalisation inséré avant le
filtre et le `Set`. Aucun schéma, aucune requête, aucune frontière réseau touchée.

## Évaluation du risque

Très faible. `normalizeLanguageForDedup` est déjà consommée par une dizaine de
sites du gateway et rend un code canonique déterministe. La détection ne peut que
CONVERGER (des variantes s'effondrent sur leur langue) — jamais introduire une
cible que l'ancien code n'aurait pas produite pour une langue réelle.

## Améliorations proposées (implémentées)

- `audienceLanguages` canonicalise chaque `systemLanguage` via
  `normalizeLanguageForDedup` AVANT le filtre de pivot (`!== 'en'`) et le `new Set`.
- Quatre témoins ajoutés (`PostService.audienceLanguages.test.ts`) : dédup des
  variantes régionales en une cible, retrait des formes région-taguées/casse-mixte
  du pivot, émission de codes canoniques, et cap de 10 langues RÉELLES.

## Critères de validation

- RED prouvé : les 4 nouveaux témoins échouent contre l'implémentation verbatim,
  les 4 originaux passent (mesuré par `git stash`).
- GREEN : 8/8 témoins de la suite, 312/312 sur `PostService|reelAffinity`.
- `tsc --noEmit` du gateway : EXIT=0.
