# MeeshyLens v1 — le contrat d'une lens

Statut : contrat v1 (schema 1), issue #11270. Source de vérité : `packages/shared/types/lens-format.ts`.
Miroir Swift généré : `packages/MeeshySDK/Sources/MeeshySDK/Lens/` (jamais édité à la main).
Vecteurs partagés : `packages/shared/fixtures/lens-v1/vectors.json`.

Une lens est un petit document déclaratif qu'un partenaire propose, que la modération publie et que le
peintre de chaque plateforme rend sur l'aperçu caméra, la photo, la vidéo, la retouche et l'appel. Le
document ne contient ni code ni adresse : il ne fait que **déclarer** ce qui se peint.

## Les trois lois de lecture

`parseLens(entrée)` (TypeScript) et `LensFormat.parse(…)` (Swift) rendent l'une de quatre issues, dans cet ordre.

1. **`update-required`** : le champ `schema` est un entier supérieur à celui que le client connaît (ici 1). Le
   document n'est pas lu — son format a pu changer — et l'application invite à **mettre à jour**. Jamais « invalide ».
2. **`forbidden`** : v1 n'exécute rien et n'ouvre rien. Sont interdits : le **shader**, le **script**, toute **URL**,
   tout accès **réseau**, toute **3D**. Un document qui en porte est refusé en bloc, avec la liste triée des raisons
   (`key:<clé>`, `layer:<genre>`, `url`). On ne lit jamais « la lens moins ce qu'on ne sait pas faire ».
3. **`ok`** : tolérant. Une couche ou un déclencheur de genre inconnu, ou illisible, est **ignoré** et compté
   (`ignoredLayers`, `ignoredTriggers`) ; les autres restent. Une clé inconnue est ignorée. Un client publié avant
   une sixième primitive lit donc une lens récente en la jouant sans elle.

Tout le reste est **`invalid`** : pas un objet, `schema` absent ou non entier, enveloppe illisible, plus de 12 couches
lisibles, plus de 8 déclencheurs lisibles, identifiants de couche en double, document imbriqué au-delà de 16 niveaux.

## Le document

| Champ | Règle |
|---|---|
| `schema` | entier, 1 pour v1 |
| `id` | identifiant court (slug, 24 caractères au plus) |
| `name` | nom en français, 1 à 80 ; `names` : traductions `en`, `es`, `pt`, `it`, `de`, `ar` (optionnelles) |
| `credits` | `{ author, createdAt, updatedAt? }`, dates `AAAA-MM-JJ` (calendrier vérifié) |
| `surfaces` | `capture` et/ou `live`, sans doublon (mêmes listes que les cadres d'appel) |
| `cost` | `light`, `standard` ou `rich` |
| `window` | `{ startsAt, endsAt, geo?: { countries }, communities? }` — dates UTC `AAAA-MM-JJThh:mm:ssZ`, `endsAt` après `startsAt` ; pays en deux majuscules (50 au plus) ; communautés en identifiants de 24 hexadécimaux (20 au plus) |
| `layers` | 1 à 12 couches lisibles (32 déclarées au plus) |
| `triggers` | 8 au plus (24 déclarés) |
| `fallbacks` | `{ reduced?: { hide }, minimal?: { hide } }` : couches masquées aux paliers de dégradation |

`window.geo` et `window.communities` sont des filtres **déclarés** par la lens. Le contrat ne demande ni ne transporte
aucune position de l'appareil : aucun champ du document ne repart vers le serveur.

### Les cinq primitives (`layers`)

Chaque couche porte un `id` unique. Les fichiers (`asset`) sont adressés par leur contenu (`16 hexadécimaux.webp|png|json`),
jamais par un chemin ni une URL.

| `kind` | Champs |
|---|---|
| `lut` | `asset`, `intensity?` (0 à 1) |
| `frame` | `motif` (identifiant d'un cadre du catalogue, `ambiance.motif`), `opacity?` |
| `sticker` | `asset`, `anchor`, `size` (0,02 à 2), `rotation?` (−180 à 180) |
| `text` | `text` par langue (`fr` obligatoire, puis `en`, `es`, `pt`, `it`, `de`, `ar`), `font` (liste fermée des polices des cadres), `color` (`#RRGGBB` ou `#RRGGBBAA`), `size` (0,02 à 0,3), `anchor` |
| `particles` | `preset` (`sparkles`, `confetti`, `hearts`, `stars`, `snow`, `petals`, `bubbles`, `fireflies`), `density` (`low`, `mid`, `high`), `anchor?` |

**Ancres.** `{ type: "screen", x, y }` (fractions de l'écran) ou `{ type: "face", point, dx?, dy? }` où `point` est
un point nommé du visage (`top-of-head`, `forehead`, `left-eyebrow`, `right-eyebrow`, `left-eye`, `right-eye`,
`nose-tip`, `mouth`, `chin`, `left-cheek`, `right-cheek`, `left-ear`, `right-ear`) et `dx`/`dy` un décalage en largeurs de
visage (−1 à 1). Chaque plateforme fait correspondre ces noms à ses propres repères.

### Les déclencheurs (`triggers`)

`{ on, action, target, delay? }` — `on` ∈ `onTap`, `onSmile`, `onMouthOpen`, `onBrowRaise`, `onBlink`, `onTime`,
`onSpeaking` ; `action` ∈ `show`, `hide`, `burst`, `play`, `stop` ; `target` est l'`id` d'une couche **lue** (un
déclencheur vers une couche absente ou ignorée est ignoré) ; `delay` en secondes (0 à 60).

## Prisme linguistique

Tout texte affiché par une lens est donné par langue, dans les sept langues du Prisme (`fr`, `en`, `es`, `pt`, `it`,
`de`, `ar`). Le français est obligatoire : c'est le repli. Le rendu résout la langue du lecteur comme partout ailleurs
(`resolveUserLanguage`) et retombe sur `fr`. Les longueurs se mesurent en unités UTF-16, des deux côtés.

## Rétrocompatibilité (#9223)

Le schéma ne se retire jamais : un ancien client lit une lens récente en ignorant ce qu'il ignore, ou demande la mise
à jour si le `schema` a changé. Une nouvelle primitive est une nouvelle valeur de `kind` ; elle n'impose pas de
nouveau `schema`. Un nouveau `schema` n'est réservé qu'aux changements qui ne se lisent pas en ignorant.

## Miroir Swift et vecteurs

`bun run generate:lens-format` (dans `packages/shared`) régénère les six fichiers de `packages/MeeshySDK/Sources/MeeshySDK/Lens/` : les vocabulaires
fermés et les bornes déduits de `lens-format.ts`, puis le lecteur tolérant. Un test vitest exige que les fichiers
committés soient égaux à la sortie du générateur et qu'aucun fichier périmé ne traîne.

`fixtures/lens-v1/vectors.json` est rejoué par `types/__tests__/lens-format.test.ts` (vitest) ET par
`LensFormatVectorsTests.swift` (le même fichier, lu, jamais copié). Un vecteur est un document et le résumé attendu :
issue, identifiants des couches lues, nombre de déclencheurs, couches et déclencheurs ignorés, raisons d'un refus.
Ajouter un cas de contrat, c'est ajouter un vecteur : les deux langages le jouent.

## Hors v1

Rien de ce qui suit n'est dans le contrat, et le contrat ne le rendra pas silencieusement : shader, script, 3D, URL,
réseau. Le jour où l'un d'eux entre, il entre par un nouveau `schema`, après un audit, jamais par une clé « optionnelle ».
