# Itération 287 — `ZmqRequestSender` canonicalise les langues cibles ENVOYÉES au translator, pas seulement celles qu'il SUIT

Suite de la campagne « une source de vérité par règle de langue » (cycles
118→286, Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). En
balayant les sites gateway qui dédupliquent des codes de langue par
`.toLowerCase()` brut plutôt que par leur forme canonique, un défaut d'ASYMÉTRIE
interne est apparu au dernier chokepoint de toute requête de traduction :
`ZmqRequestSender.sendTranslationRequest`.

## État actuel (avant ce lot)

```ts
// Dédupliquer les langues cibles (normalisation lowercase)
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
// …
this.pendingRequests.set(taskId, {
  request, timestamp: Date.now(),
  pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))  // ← canonique
});
```

Le fichier définit `canonicalLanguage(l) = normalizeLanguageCode(l) ?? l.toLowerCase()`
(SSOT `normalizeLanguageCode`) et l'emploie pour construire `pendingLanguages` —
le jeu des langues encore attendues d'un `taskId`. Mais le jeu **ENVOYÉ** au
translator (`uniqueTargetLanguages`, frame `targetLanguages`) était dédupliqué
sur `.toLowerCase()` BRUT. Les deux jeux, construits depuis la MÊME entrée,
divergeaient dès qu'un code portait un tag de région ou une casse mixte.

## Problème identifié

Toute requête de traduction du gateway (message, story, audio, sous-titres
d'appel) passe par ce sender. Ses `targetLanguages` sont formés depuis des
langues d'utilisateur — `systemLanguage`, `regionalLanguage`,
`customDestinationLanguage` — persistées **verbatim** (`z.string().optional()`,
aucune normalisation à l'écriture ; règle documentée par `normalizeInAppLanguage`).
Les valeurs BCP-47 région-taguées ou en casse mixte produites par le web
(`Accept-Language`) et iOS (`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`,
`'FR'`, `'fr_FR'` — atteignent donc ce sender intactes. Trois conséquences,
toutes mesurées par les nouveaux tests :

1. **Des cibles INVALIDES partent au translator.** `.toLowerCase()` envoyait
   `'fr-fr'`, `'en-us'`, `'pt-br'` comme cibles NLLB — des codes que NLLB ne
   reconnaît pas. Le translator gaspillait CPU/mémoire GPU sur une cible qui
   n'existe pas, ou repliait silencieusement.

2. **Les variantes régionales dédupliquaient comme des langues DISTINCTES.**
   `['fr', 'fr-FR', 'FR']` produisait `['fr', 'fr-fr']` — DEUX travaux de
   traduction pour une seule langue réelle. La même bulle était traduite deux
   fois vers `fr`.

3. **Le jeu ENVOYÉ divergeait du jeu SUIVI.** `pendingLanguages` (canonique)
   portait `{fr, en}` quand le fil envoyait `['fr', 'fr-fr', 'en-us']`. Le
   suivi et l'envoi, construits de la même source, ne parlaient pas la même
   langue — un piège pour tout futur rapprochement des deux (accusés de
   remise, comptage des langues manquantes).

## Cause racine

Le dédup ENVOI n'appelait pas `canonicalLanguage`, alors que le fichier
l'utilise déjà pour le suivi. C'est la forme exacte du défaut de l'itération 286
(`PostService.audienceLanguages` dédupliquait sur des codes verbatim), un cran
plus bas dans le pipeline — au point de sortie ZMQ que TOUS les producteurs
partagent.

## Impact

- **Performance / Optimisation GPU** : le translator ne reçoit plus de cible
  invalide (`'fr-fr'`) ni de doublon régional. Une langue réelle = un travail.
- **Technique** : le jeu envoyé est désormais IDENTIQUE au jeu suivi
  (`pendingLanguages`) — une seule canonicalisation, un seul ensemble.
- **Produit (Prisme, dimensions Performance + Complétude)** : moins de travail
  translator gaspillé sous forte diversité de variantes ; un lecteur région-tagué
  reçoit sa traduction sous la clé canonique que les cartes de traduction
  stockent.
- **Sécurité** : nulle (pas de fuite ; l'ensemble sortant se RESSERRE).

## Risque

Faible. `sendTranslationRequest` est un chokepoint pur d'un point de vue langues.
La canonicalisation ne fait que RESSERRER l'ensemble envoyé (moins de cibles,
jamais plus) et préserve l'ordre de première apparition (`Set`). Les codes déjà
canoniques sont idempotents sous `canonicalLanguage` (test existant
`['FR','fr','EN'] → ['fr','en']` inchangé). Le repli terminal
(`?? l.toLowerCase()`) préserve tout code non réductible plutôt que de le perdre.

## Amélioration livrée

Canonicaliser chaque cible AVANT le `Set`, et suivre exactement ce qui est
envoyé :

```ts
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(canonicalLanguage))];
// …
pendingLanguages: new Set(uniqueTargetLanguages)  // déjà canonique — même jeu qu'envoyé
```

## Bénéfices attendus

- Le translator ne reçoit que des codes NLLB canoniques (2-lettres lowercase),
  dédupliqués par LANGUE réelle.
- Le jeu envoyé et le jeu suivi (`pendingLanguages`) sont le MÊME ensemble.
- La canonicalisation d'un cran de plus du pipeline rejoint la SSOT partagée.

## Complexité d'implémentation

Triviale — 1 ligne de production changée (`l => l.toLowerCase()` →
`canonicalLanguage`), 1 ligne simplifiée (suivi), 2 nouveaux pins de comportement.

## Critères de validation

- `ZmqRequestSender.test.ts` : 2 nouveaux cas RED sur l'ancien code
  (`['fr','fr-FR','en-US','pt_BR'] → ['fr','en','pt']` ; envoi ⊆ suivi via
  `settleTranslationLanguage`), verts après le fix ; le pin existant
  `['FR','fr','EN'] → ['fr','en']` inchangé.
- 6 suites `zmq-translation` (206 tests) vertes.
- `tsc --noEmit` gateway : 0 erreur.
