# Itération 288 — `ZmqRequestSender.sendTranslationRequest` canonicalise ses langues cibles au point de passage UNIQUE du travail ML

Suite directe de la campagne « une source de vérité par règle de langue »
(cycles 118→287 ; Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`
+ `PostService.audienceLanguages` au cycle 287). En balayant les sites qui
DÉDUPLIQUENT des codes de langue avec un `.toLowerCase()` brut — l'anti-patron que
la SSOT `normalizeLanguageForDedup` nomme explicitement (« un `.toLowerCase()`
brut compterait `'en'` et `'en-US'` comme deux langues distinctes ») — le point
de passage UNIQUE de TOUT travail de traduction ML en était un :
`ZmqRequestSender.sendTranslationRequest`.

## État actuel (avant ce lot)

```ts
// Dédupliquer les langues cibles (normalisation lowercase)
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
// ...
this.pendingRequests.set(taskId, {
  request,
  timestamp: Date.now(),
  pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))  // ← canonique
});
```

Cette méthode est le choke point ZMQ traversé par TOUTE requête de traduction
texte (message, post/story, audio, pièce jointe, appel temps réel) : c'est la
dernière ligne avant le pool ML, le poste le plus cher du pipeline.

`canonicalLanguage` (défini localement, délègue à la SSOT `normalizeLanguageCode`)
est déjà employé DEUX fois dans le même fichier — pour bâtir le jeu
`pendingLanguages` (ligne 121) et pour solder une langue rendue
(`settleTranslationLanguage`, ligne 467). Le seul endroit qui NE l'employait
pas : la ligne qui compose la liste **ENVOYÉE au translator**.

## Problème identifié

Deux réductions DIFFÉRENTES sur la même donnée, dans le même objet littéral :

1. **La liste ENVOYÉE échappe à la canonicalisation.** `.toLowerCase()` dédupliquait
   `['fr', 'fr-FR']` en `['fr', 'fr-fr']` — deux cibles NLLB. Le pool ML traduisait
   la même langue DEUX FOIS, et `'fr-fr'` n'est pas une cible NLLB valide (mapping
   2-lettres / code supporté). Mesuré par témoin RED : `['pt-BR', 'en-US', 'es_ES']`
   partait tel quel au lieu de `['pt', 'en', 'es']`.

2. **La liste ENVOYÉE diverge de la liste SUIVIE.** `pendingLanguages` (ligne 121)
   canonicalise, donc `{'fr'}` (taille 1) ; la liste envoyée portait `['fr', 'fr-fr']`
   (taille 2). Le jeu attendu ne pouvait donc pas correspondre au jeu émis.

3. **Le premier envoi diverge du RENVOI.** Sur timeout, `ZmqTranslationClient`
   reconstruit `targetLanguages` depuis le jeu `pendingLanguages` CANONIQUE
   (`{ ...request, targetLanguages: pendingLanguages }`). Le premier envoi d'une
   requête employait donc `.toLowerCase()`, ses renvois `canonicalLanguage` : deux
   envois de la MÊME requête sous deux réductions.

## Cause racine

Le site n'appelait pas la forme canonique que le RESTE du même fichier emploie
déjà. `canonicalLanguage` était à trois lignes, importé, testé, utilisé deux fois
— et la ligne de composition de la charge ENVOYÉE en divergeait en silence. Même
classe exacte que le cycle 287 (`audienceLanguages`), une couche plus proche du
fil : là un résolveur d'audience, ici le choke point d'émission ML.

## Impact métier

Requêtes de traduction dupliquées et cibles invalides envoyées au translator
chaque fois qu'un appelant fournit une variante région-taguée ou en casse mixte :
gaspillage de calcul ML (le poste le plus cher) et une clé de traduction
potentiellement non valide. Les résolveurs applicatifs amont (`resolveUserLanguage`)
canonicalisent aujourd'hui leur sortie, donc le défaut n'est pas une panne mesurée
sur les chemins tracés — mais le choke point est la seule garde qui rend la
propriété VRAIE indépendamment de tout appelant présent ou futur. Dimension 2
(Performance) et 11 (Maintenabilité — UNE source de vérité) du `CLAUDE.md`.

## Impact technique

Surface minimale : une ligne de canonicalisation (`.map(l => l.toLowerCase())` →
`.map(canonicalLanguage)`) et une simplification (la re-canonicalisation de
`pendingLanguages` devient un `new Set(uniqueTargetLanguages)`, rendant explicite
l'invariant « ENVOYÉ == SUIVI »). Aucun schéma, aucune requête, aucune frontière
réseau touchée.

## Évaluation du risque

Très faible. `canonicalLanguage` = `normalizeLanguageCode(l) ?? l.toLowerCase()` :
il ne rend jamais `undefined`, donc aucune cible réelle n'est retirée — la
détection ne peut que CONVERGER (des variantes s'effondrent sur leur langue),
jamais introduire une cible que l'ancien code n'aurait pas produite pour une
langue réelle. Même profil de risque que le cycle 287. Les assertions existantes
(codes région-libres `['FR','fr','EN'] → ['fr','en']`, `['ES'] → ['es']`) restent
vraies verbatim.

## Améliorations proposées (implémentées)

- `sendTranslationRequest` canonicalise chaque langue cible via `canonicalLanguage`
  AVANT le `new Set`, alignant la liste ENVOYÉE sur la SSOT et sur le jeu
  `pendingLanguages`.
- `pendingLanguages` devient `new Set(uniqueTargetLanguages)` (déjà canonique),
  rendant l'invariant « ENVOYÉ == basis SUIVI » explicite au lieu d'implicite.
- Trois témoins ajoutés (`ZmqRequestSender.test.ts`) : effondrement des variantes
  région-taguées en une cible, émission de codes canoniques uniquement, et parité
  entre le premier envoi et le jeu de renvoi du timeout.

## Critères de validation

- RED prouvé : les 3 nouveaux témoins échouent contre l'implémentation `.toLowerCase()`
  (`de-de` envoyé, `de` suivi), les 69 originaux passent.
- GREEN : 72/72 de la suite `ZmqRequestSender`, 177/177 sur les suites ZMQ liées,
  267/267 sur `MessageTranslationService`.
- `tsc --noEmit` du gateway : EXIT=0, 0 erreur (Prisma client généré + shared bâti).
