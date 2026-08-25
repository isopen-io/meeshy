# Itération 267 — Analyse : quatre gardes MIME sur six ignoraient les paramètres, à une frontière de validation

## État courant

`packages/shared/types/attachment.ts` expose six type-guards de classification
MIME, agrégés par `isAcceptedMimeType` — la **porte accept/reject** des types
MIME de pièces jointes — et consommés par `getAttachmentType` (routage vers
`image` / `audio` / `video` / `text` / `code` / `document`).

Deux gardes sur six **nettoient** les paramètres MIME avant de comparer :

```ts
export function isAudioMimeType(mimeType: string): mimeType is AudioMimeType {
  const cleanMimeType = (mimeType.split(';')[0] || mimeType).trim();
  return (ACCEPTED_MIME_TYPES.AUDIO as unknown as string[]).includes(cleanMimeType);
}
// idem isVideoMimeType
```

Les quatre autres — `isImageMimeType`, `isTextMimeType`, `isDocumentMimeType`,
`isCodeMimeType` — font une comparaison exacte **sans** nettoyage :

```ts
export function isTextMimeType(mimeType: string): mimeType is TextMimeType {
  return (ACCEPTED_MIME_TYPES.TEXT as unknown as string[]).includes(mimeType);
}
```

## Problèmes identifiés

Un type MIME portant un paramètre standard (`; charset=utf-8`, le plus courant
de tous) est classé de manière **incohérente selon la seule famille média** à
laquelle il appartient :

| entrée | verdict actuel | correct |
|---|---|---|
| `audio/webm;codecs=opus` | `isAudioMimeType` → **true** | true |
| `text/plain; charset=utf-8` | `isTextMimeType` → **false** | true |
| `application/json; charset=utf-8` | `isCodeMimeType` → **false** | true |
| `image/png; qs=0.9` | `isImageMimeType` → **false** | true |

Conséquences directes :

1. **`isAcceptedMimeType('text/plain; charset=utf-8')` → `false`** alors que
   `isAcceptedMimeType('audio/webm;codecs=opus')` → `true`. Même forme
   d'entrée, verdict opposé, à la frontière accept/reject.
2. **`getAttachmentType('application/json; charset=utf-8')` → `'document'`**
   (défaut ligne 741) au lieu de `'code'` : le garde `isCodeMimeType` échoue,
   la fonction tombe au défaut. Mauvais routage de type.

`fetch`, `axios` et la plupart des serveurs HTTP ajoutent `; charset=utf-8`
automatiquement à un `Content-Type` texte/JSON : l'entrée est **nominale**, pas
adversariale.

## Causes racines

Le nettoyage a été ajouté aux gardes AUDIO/VIDEO (là où `MediaRecorder`
émet `audio/webm;codecs=opus`) et **jamais généralisé** aux quatre autres. La
logique de nettoyage est de plus **dupliquée in-line** dans deux gardes — un
seul site aurait été plus difficile à laisser diverger.

C'est la forme, à une frontière de validation, de la règle du dépôt : *une
protection (ici une classification) se mesure sur tout ce que la charge
TRANSPORTE* — l'ensemble des formes d'entrée (avec/sans paramètre), pas la
seule qu'on avait en tête. Jumelle directe de l'itération 266 (`isPrivateIp`
ne connaissait que l'IPv4) et 260 (`isIpInRange` hors plage).

## Impact métier

Un upload légitime de texte / JSON / code / image dont le `Content-Type` porte
un `charset` (cas courant) est **rejeté** par `isAcceptedMimeType`, alors que
l'équivalent audio/vidéo passe. L'utilisateur voit un refus d'attachement
arbitraire ; le routage `getAttachmentType` classe un fichier JSON en
`document`, faussant l'icône, la limite de taille (`getSizeLimit`) et le rendu.

## Impact technique

- Incohérence silencieuse à la SSOT de classification MIME (`@meeshy/shared`),
  consommée par gateway et web.
- Duplication de la logique de nettoyage (deux copies in-line).
- Aucune couverture de test sur le cas paramétré pour image/text/document/code
  (les tests audio/vidéo, EUX, l'exercent — lignes 92-98, 117-123 — ce qui
  **prouve l'intention** du dépôt : tolérer les paramètres).

## Évaluation du risque

**Faible.** Le nettoyage ne peut qu'**élargir l'acceptation à des types dont
la base est déjà dans la liste acceptée** : un type paramétré dont la base
n'est pas acceptée (`image/svg+xml; charset=utf-8` → `image/svg+xml`, absent de
`IMAGE`) reste rejeté. Aucun élargissement de la surface acceptée aux types de
base non listés. Le comportement AUDIO/VIDEO ne change pas (ils nettoyaient
déjà). Seuls les 4 gardes non-nettoyants changent, dans le sens correct.

## Améliorations proposées

1. Extraire un helper unique `stripMimeParameters(mimeType)` (une seule
   définition de la logique `(m.split(';')[0] || m).trim()`).
2. L'appliquer aux SIX gardes (image/audio/video/text/document/code), en
   remplaçant les deux copies in-line.

## Bénéfices attendus

- Classification MIME cohérente sur toutes les familles.
- Uploads texte/JSON/code/image paramétrés acceptés et routés correctement.
- Une seule définition de la règle de nettoyage (fin de la duplication).

## Complexité d'implémentation

Triviale — ~1 ligne par garde + un helper de 1 ligne. Aucune signature
publique modifiée.

## Critères de validation

- RED prouvé : nouveaux témoins sur `isTextMimeType`/`isCodeMimeType`/
  `isImageMimeType`/`isDocumentMimeType`/`isAcceptedMimeType`/
  `getAttachmentType` avec `; charset=utf-8` échouent AVANT le correctif.
- GREEN : tous verts APRÈS.
- Non-régression : suite `attachment.test.ts` entière verte ; `tsc --noEmit`
  du package shared à 0 erreur ; un type de base non listé + paramètre reste
  rejeté (témoin explicite `image/svg+xml; charset=utf-8` → false).
