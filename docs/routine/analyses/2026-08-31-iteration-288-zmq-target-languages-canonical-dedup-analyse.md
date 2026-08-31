# Itération 288 — `ZmqRequestSender` canonicalise les langues cibles ENVOYÉES, pas seulement le jeu ATTENDU

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). En balayant les
sites qui dédupliquent des codes de langue par `.toLowerCase()` brut plutôt que par
la SSOT de canonicalisation, un défaut a été trouvé à la porte UNIQUE avant ZMQ :
`ZmqRequestSender.sendTranslationRequest` canonicalisait le jeu qu'il ATTEND en
retour (`pendingLanguages`) mais envoyait au translator un jeu seulement
`.toLowerCase()`é — deux formes divergentes du même code.

## État actuel (avant ce lot)

```ts
// Dédupliquer les langues cibles (normalisation lowercase)
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
// ...
const requestMessage = { /* ... */ targetLanguages: uniqueTargetLanguages /* ← ENVOYÉ */ };
// ...
this.pendingRequests.set(taskId, {
  // ...
  pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))  // ← ATTENDU (canonique)
});
```

`canonicalLanguage = normalizeLanguageCode(l) ?? l.toLowerCase()` existait DÉJÀ, et
son doc-comment nommait exactement le risque — « sans forme commune, une langue
rendue ne se reconnaîtrait pas dans le jeu des langues attendues ». Il n'était
appliqué qu'au jeu ATTENDU, jamais au jeu ENVOYÉ.

## Problème identifié

Les appelants passent leurs cibles VERBATIM et aucune couche en amont ne les
normalise systématiquement :

- `admin/broadcast-translation.service.ts:35` — `targetLanguages.filter(l => l !== sourceLanguage)`, brut.
- `posts/PostTranslationService.ts:238` — `targetLanguages: [targetLanguage]`, la langue demandée par le client (`Locale.current`, ex. `'pt-BR'`).

Une cible région-taggée (`'pt-BR'`, `'fr-FR'`, `'en_US'`) atteignait donc ZMQ
telle quelle (`'pt-br'` après lowercase). Deux conséquences, toutes deux mesurées
par témoin RED :

1. **Cible NLLB invalide → traduction jamais produite.** Le translator résout la
   cible via sa table NLLB ; `'pt-br'` en est absent et y retombe silencieusement.
   La traduction portugaise n'est jamais rendue.

2. **Divergence ENVOYÉ / ATTENDU → deadman.** Le jeu envoyé portait `'pt-br'`, le
   jeu attendu `'pt'`. Même si le translator produisait une complétion, elle
   arriverait sous la forme canonique `'pt'` et solderait l'attente — mais la
   cible envoyée `'pt-br'` n'a aucun sens pour NLLB, donc aucune complétion
   n'arrive, et la requête expire au deadman timeout. Le lecteur portugais reste
   sur la langue de l'auteur.

3. **Travail ML dupliqué.** `['fr', 'fr-FR']` partait comme DEUX cibles distinctes
   (`'fr'`, `'fr-fr'`) — le translator faisait le travail deux fois (ou une fois
   pour une cible invalide), sur le poste le plus cher du pipeline.

## Cause racine

Le résolveur appliquait la SSOT `canonicalLanguage` à UNE des deux projections du
même jeu. La leçon 275 portée au Prisme (« qu'est-ce qui part À CÔTÉ de ce que je
viens de corriger ? ») a ici sa forme jumelle : deux projections d'un même jeu,
gardées différemment, dont seule la plus visible (le suivi interne) l'était.

## Impact métier

Absence de traduction pour tout destinataire dont la langue arrive région-taggée à
cette porte (diffusions admin, traduction à la demande de posts/commentaires), et
gaspillage de calcul ML par duplication de variantes régionales. Dimensions 2
(Performance), 13 (Complétude) et le Prisme Linguistique du `CLAUDE.md`.

## Impact technique

Surface minimale : une fonction pure déjà présente (`canonicalLanguage`) appliquée
à la projection ENVOYÉE ; le jeu ATTENDU devient `new Set(uniqueTargetLanguages)`
sans re-canonicalisation (les codes sont déjà canoniques). Aucun schéma, aucune
requête, aucune frontière réseau touchée.

## Évaluation du risque

Très faible. `canonicalLanguage` est idempotent sur un code déjà canonique, donc
tout appelant qui envoyait déjà des codes canoniques (le chemin principal
`MessageTranslationService._resolveTargetLanguages`) est inchangé. La détection ne
peut que CONVERGER (des variantes s'effondrent sur leur langue) ou RÉPARER (une
cible invalide devient valide) — jamais introduire une cible que l'ancien code
n'aurait pas produite pour une langue réelle.

## Améliorations proposées (implémentées)

- `sendTranslationRequest` canonicalise chaque cible via `canonicalLanguage` AVANT
  le `new Set` de déduplication ; le jeu ENVOYÉ au translator coïncide dès lors
  avec le jeu ATTENDU (`pendingLanguages`).
- Deux témoins ajoutés (`ZmqRequestSender.test.ts`) : canonicalisation +
  déduplication des cibles région-taggées/casse-mixte dans la charge envoyée
  (`['fr','fr-FR','PT-br','en_US']` → `['fr','pt','en']`), et coïncidence
  ENVOYÉ/ATTENDU prouvée par le soldé d'une cible région-taggée (`'pt-BR'` envoyé
  `'pt'`, soldé par une complétion `'pt'`).

## Critères de validation

- RED prouvé : les 2 nouveaux témoins échouent contre l'implémentation
  `.toLowerCase()` (envoi de `'pt-br'` / `'fr-fr'`), les 69 originaux passent.
- GREEN : 71/71 sur `ZmqRequestSender`, 250/250 sur les 7 suites
  `zmq-translation` + `ZmqRequestSender`.
- `tsc --noEmit` du gateway : EXIT=0.
