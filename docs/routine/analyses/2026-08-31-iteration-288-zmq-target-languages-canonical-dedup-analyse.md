# Itération 288 — `ZmqRequestSender` canonicalise ses langues cibles avant l'envoi, pas seulement dans le jeu suivi

Suite de la campagne « une source de vérité par règle de langue » (cycles
118→287, Prisme + `recipient-language.ts` + `normalizeLanguageForDedup` +
`audienceLanguages`). Les cycles 286/287 ont resserré les résolveurs qui
COMPOSENT une liste de langues cibles (`PostService.audienceLanguages`). Ce lot
descend d'un cran, au point où la liste est effectivement DISPATCHÉE au
translator : `ZmqRequestSender.sendTranslationRequest`.

## État actuel (avant ce lot)

```ts
// Dédupliquer les langues cibles (normalisation lowercase)
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
...
this.pendingRequests.set(taskId, {
  ...
  pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))
});
```

Deux jeux de langues sont dérivés de la même entrée, sous **deux formes
différentes** :

- **Le jeu ENVOYÉ** (`requestMessage.targetLanguages`, ligne 97) : dédupliqué sur
  `.toLowerCase()` BRUT.
- **Le jeu SUIVI** (`pendingLanguages`, ligne 121) : dédupliqué sur
  `canonicalLanguage` (`normalizeLanguageCode`).

Et le solde d'une langue rendue par le translator canonicalise aussi la langue
reçue avant de la retirer du jeu suivi (`settleTranslationLanguage`, ligne 467).

## Problème identifié

`request.targetLanguages` porte des codes NON canonicalisés — ils descendent des
`systemLanguage`/préférences persistés verbatim (`'en-US'`, `'pt-BR'`, `'FR'`,
`'fr_FR'`) que la campagne documente comme jamais normalisés à l'écriture. Le
`.toLowerCase()` brut de la ligne d'envoi produit donc une **asymétrie mesurée**
entre le jeu envoyé et le jeu suivi :

1. **Travail dupliqué au translator.** `['fr', 'fr-FR']` sont UNE cible NLLB.
   `.toLowerCase()` les garde distinctes (`'fr'` + `'fr-fr'`) et envoie DEUX
   travaux de traduction pour la même langue — l'étape la plus chère du pipeline
   (calcul ML/GPU). `pendingLanguages`, canonique, n'en suit qu'UNE (`{fr}`).

2. **Cible invalide.** `'en-US'` part en `'en-us'`, un code que NLLB ne reconnaît
   pas — travail perdu ou en erreur.

3. **Divergence envoyé/suivi silencieuse.** Le jeu envoyé peut porter 4 entrées
   (`fr`, `fr-fr`, `es-es`, `es`) quand le jeu suivi n'en porte que 2 (`{fr, es}`).
   La première langue rendue par le translator canonicalise et retire son entrée ;
   quand la variante dupliquée revient, `settleTranslationLanguage` ne trouve plus
   rien (`taskId` déjà soldé) et la traite comme « un doublon, ou un résultat
   arrivé après le deadman » — le témoin d'un défaut de cette famille est, par
   construction, invisible.

## Cause racine

Le site d'envoi dédupliquait AVANT toute canonicalisation, alors que le reste du
cycle (jeu suivi, solde) raisonne déjà en forme canonique via `canonicalLanguage`
(défini dans le même fichier, ligne 37, sur la SSOT `normalizeLanguageCode`). Le
doc-comment de `canonicalLanguage` affirmait même « les cibles partent telles que
l'appelant les donne » — une décision qui n'a jamais eu de raison de sécurité ou
de protocole : le translator attend des codes NLLB canoniques (le cas nominal
`'fr'`/`'en'` en est déjà un), et le solde canonicalise ce qui revient quelle que
soit la forme envoyée. La forme brute n'était donc pas un besoin, c'était un trou.

## Impact métier

Gaspillage de calcul ML au translator (poste le plus cher du pipeline) sur des
requêtes de traduction dupliquées et des cibles invalides, dès qu'un membre
d'audience ou un destinataire porte une préférence de langue région-taguée —
c'est-à-dire dès que la locale appareil (rang 4 du Prisme) diffère de la langue
applicative. Dimensions 2 (Performance) et 13 (Complétude) du `CLAUDE.md`.

## Impact technique

Surface minimale : un `map(canonicalLanguage)` substitué à `map(l => l.toLowerCase())`
sur une seule ligne, et `pendingLanguages` dérivé du jeu déjà canonique (la
double canonicalisation devient une identité, supprimée). Aucun schéma, aucune
requête, aucune frontière réseau touchée — le format du fil ZMQ est inchangé
(codes 2-lettres lowercase, ce qu'il portait déjà dans le cas nominal).

## Évaluation du risque

Très faible. `canonicalLanguage` est déjà consommée par le jeu suivi et le solde
du même fichier ; le repli (`?? language.toLowerCase()`) préserve le comportement
historique pour tout code que `normalizeLanguageCode` rejette. La détection ne
peut que CONVERGER — des variantes s'effondrent sur leur langue réelle — jamais
introduire une cible qu'un code déjà canonique n'aurait pas produite. Les 69
témoins existants de la suite (dont le pin `['FR','fr','EN'] → ['fr','en']`)
restent verts.

## Améliorations livrées

- `sendTranslationRequest` canonicalise chaque code de `request.targetLanguages`
  via `canonicalLanguage` AVANT le `new Set`, alignant le jeu ENVOYÉ sur le jeu
  SUIVI et sur la forme de solde.
- `pendingLanguages` dérive désormais directement du jeu canonique
  (`new Set(uniqueTargetLanguages)`), rendant la symétrie explicite.
- Le doc-comment de `canonicalLanguage` est corrigé : il ne prétend plus que « les
  cibles partent telles que l'appelant les donne ».
- Trois témoins ajoutés (`ZmqRequestSender.test.ts`) : dédup d'une variante
  région-taguée en une cible, canonicalisation multi-langues, et symétrie
  envoyé ↔ suivi (le jeu envoyé se solde exactement).

## Critères de validation

- RED prouvé : les 3 nouveaux témoins échouent contre l'implémentation `.toLowerCase()`
  (le témoin de symétrie montre `['fr','fr-fr','es-es','es']` envoyé pour
  `{fr, es}` suivi), verts après le fix.
- GREEN : 116/116 sur les deux suites `ZmqRequestSender`, 400/400 sur
  `zmq-translation` + `ZmqTranslationClient` + `MessageTranslationService`.
- `tsc --noEmit` du gateway : EXIT=0.
