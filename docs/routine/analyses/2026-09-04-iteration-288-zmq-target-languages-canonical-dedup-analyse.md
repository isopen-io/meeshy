# Itération 288 — `ZmqRequestSender` canonicalise ses langues cibles avant l'envoi au translator

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). En balayant les
résolveurs/agrégateurs de langue serveur NON couverts par la SSOT de
canonicalisation, un site du chemin ZMQ dédupliquait ses langues cibles par un
`.toLowerCase()` **brut** — l'anti-patron que le doc-comment de
`normalizeLanguageForDedup` nomme explicitement — juste avant de les envoyer au
translator (le poste ML le plus cher du pipeline).

> Continuité : issue #5143 (milestone #18 « Traduction : toutes les langues
> promises, plus vite, mesurée »), sœur de #4598 (langue source des sous-titres
> d'appel). Le suivi « Améliorations futures » du plan itération 287 pointait les
> agrégateurs `systemLanguage` en base (`broadcast-recipients.ts`,
> `admin/broadcasts.ts`, `admin/languages.ts`) : ceux-là comparent en base contre
> des valeurs persistées **verbatim**, si bien que canonicaliser la seule requête
> ne les répare pas (il faudrait normaliser à l'écriture ou élargir la requête) —
> nature différente, gardés pour une passe dédiée. Ce lot prend le résolveur PUR
> restant, à parité avec #287.

## État actuel (avant ce lot)

`ZmqRequestSender.sendTranslationRequest`
(`services/gateway/src/services/zmq-translation/ZmqRequestSender.ts`) portait DEUX
normalisations différentes dans la même méthode :

```ts
// Ligne 85 — la liste ENVOYÉE au translator
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
// Ligne 121 — le jeu de SUIVI (soldé par translationCompleted)
pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))
// Ligne 467 — le SOLDE d'une langue rendue
entry.pendingLanguages.delete(canonicalLanguage(targetLanguage));
```

`canonicalLanguage = normalizeLanguageCode(l) ?? l.toLowerCase()` (déjà défini dans
le fichier). Le SUIVI et le SOLDE sont donc canoniques de bout en bout ; la liste
ENVOYÉE ne l'était pas.

## Problème identifié

Les langues cibles atteignent ce sender depuis des chemins qui n'ont pas toujours
canonicalisé (préférences in-app persistées verbatim, locale appareil rang 4,
`participant.language` de lignes héritées). Trois conséquences, toutes mesurées par
témoin RED :

1. **Travail ML dupliqué.** `['EN', 'en', 'en-US']` → la ligne 85 rendait
   `['en', 'en-us']` : DEUX cibles pour l'anglais envoyées au translator, alors que
   `pendingLanguages` n'en comptait qu'UNE (`{'en'}`). Le translator traduisait
   deux fois la même langue.

2. **Cibles non mappables NLLB.** `'en-us'`, `'pt-br'` partaient tels quels ;
   NLLB mappe `'en' → 'eng_Latn'`, `'pt' → 'por_Latn'` — la variante région-taguée
   n'a pas d'entrée. Un code legacy (`'iw'` pour l'hébreu, émis par un client
   Android sur locale hébraïque) partait aussi verbatim au lieu de `'he'`.

3. **La liste envoyée divergeait de son propre suivi.** Le doc-comment de
   `canonicalLanguage` (lignes 31-38) énonce pourtant l'invariant — « sans forme
   commune, une langue rendue ne se reconnaîtrait pas dans le jeu attendu » — mais
   la ligne 85 ne l'appliquait pas. Dès qu'un code région-tagué / ISO-639-3 /
   legacy apparaissait, l'envoi et le suivi portaient des jeux différents.

## Cause racine

Le résolveur n'appelait pas la forme canonique du fichier (`canonicalLanguage`,
elle-même adossée à `normalizeLanguageCode`) pour la liste ENVOYÉE, alors que ses
deux voisins immédiats (suivi + solde) l'employaient déjà. Divergence en silence
d'une seule ligne, sous un doc-comment qui décrivait précisément la contrainte
violée — même famille que « un commentaire qui énonce un invariant ne garde que
l'exemplaire qui le porte » (cycle 97).

## Impact métier

Traductions dupliquées et cibles invalides au poste ML le plus cher : gaspillage
de calcul GPU/CPU (dimension 2, Performance) et, dans le pire cas, une cible
région-taguée que le translator ne sait pas honorer — un lecteur privé de sa
traduction (dimension 13, Complétude). La divergence envoi/suivi n'a AUCUN témoin
naturel — elle ne se voit qu'à la comptabilité interne des `translationCompleted`.

## Impact technique

Surface minimale : une ligne (`.map(l => l.toLowerCase())` → `.map(canonicalLanguage)`)
et la simplification du jeu de suivi (`new Set(uniqueTargetLanguages)`, la liste
étant désormais déjà canonique — l'invariant « envoi == suivi » devient explicite).
Aucun schéma, aucune requête, aucune frontière réseau modifiée.

## Évaluation du risque

Très faible. `canonicalLanguage` est déjà la forme employée par le suivi et le
solde du MÊME fichier ; l'utiliser pour l'envoi ne peut que CONVERGER (des variantes
s'effondrent sur leur langue canonique) — jamais introduire une cible qu'un code
canonique n'aurait pas produite. `canonicalLanguage` est idempotente sur un code
déjà canonique, donc `new Set(uniqueTargetLanguages)` équivaut désormais au
`.map(canonicalLanguage)` retiré. Les cas primaires existants (`['FR','fr','EN'] →
['fr','en']`) restent inchangés (témoins de non-régression verts).

## Améliorations proposées (implémentées)

- `sendTranslationRequest` déduplique ses langues cibles via `canonicalLanguage`
  AVANT le `new Set` et l'envoi ; le jeu `pendingLanguages` EST exactement la liste
  envoyée.
- Cinq témoins (`ZmqRequestSender.test.ts`) : dédup région-tagué
  (`['en-US','en'] → ['en']`), casse-mixte + région
  (`['EN-US','En','en','pt-BR'] → ['en','pt']`), alias legacy (`['iw'] → ['he']`),
  solde par la forme canonique d'un code région-tagué, et non-régression du cas
  primaire existant (titre corrigé « canonicalizes »).

## Critères de validation

- RED prouvé : 3 nouveaux témoins échouent contre l'implémentation `.toLowerCase()`
  (`'en-us'`, `'pt-br'`, `'iw'` fuitent), les cas primaires + le solde passent.
- GREEN : 73/73 sur `ZmqRequestSender`, 285/285 sur
  `ZmqRequestSender|ZmqTranslationClient|multiLanguageSettle`.
- Gateway `tsc --noEmit` : EXIT=0.
