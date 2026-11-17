# `e2ee-content/` et `e2ee-signal/` — ce que libsignal chiffre, à l'octet près (#18940)

Dans une conversation `e2ee`, libsignal ne chiffre pas un texte nu mais un JSON applicatif.
Ces vecteurs fixent ce JSON pour les **trois clients** — iOS, Android et le web — et pour la
déclaration TypeScript qui en est la source (`packages/shared/types/e2ee-content.ts`).

| fichier | ce qu'il fixe |
|---|---|
| `content.vectors.json` | le contenu d'un message, `E2EEContent` v1 (version sous la clé `v`) |
| `../e2ee-signal/signal.vectors.json` | un signal, `E2EESignal` v1 (version sous la clé `s`) : `reaction`, `typing`, `receipt`, `read-progress`, `edit`, `delete-for-everyone`, `view-once-opened`, `pin` |
| `padding.vectors.json` | le remplissage du clair avant libsignal (espaces `0x20`, paliers 256 / 1 024 / 4 096 / 16 384 puis multiples de 16 384, plafond `min(64 Kio, 512 Kio / n) − 2 048`) |

**La référence est ce que l'iPhone écrit et accepte aujourd'hui** (`packages/MeeshySDK/Sources/MeeshyE2EE/E2EEContent.swift`,
`E2EESignal.swift`, `E2EEMessageSealer.swift`, `E2EEEnvelopeOpener.swift`). Les `canonicalJson` sont **écrits à la main**
d'après ces sources et leurs témoins (`E2EEContentTests.swift`, `E2EESignalTests.swift`, et leurs recopies Kotlin) : jamais
générés par l'encodeur TS qu'ils mesurent. `canonicalBase64` et `padded` n'en sont que la dérivation mécanique.

## Forme d'un cas d'aller-retour (`cases[]`)

```json
{
  "name": "reply-with-every-field",
  "object": { "v": 1, "text": "…", "authorUserId": "…", "authorDeviceId": 3, "…": "…" },
  "canonicalJson": "{\"authorDeviceId\":3,…,\"v\":1}",
  "canonicalBase64": "eyJhdXRob3JEZXZpY2VJZCI6My…",
  "canonicalLength": 273,
  "envelope": { "conversationId": "…", "senderUserId": "…", "senderDeviceId": 3 },
  "padded": { "recipients": 2, "length": 1024, "base64": "…" }
}
```

- `object` : le contenu, clé par clé (l'ordre des clés n'y compte pas).
- `canonicalJson` / `canonicalBase64` : les octets UTF-8 que l'encodeur DOIT écrire (base64 standard RFC 4648 § 4, **avec**
  remplissage, comme le fil). Règles : clés triées, aucune clé absente écrite (jamais `null`), aucun espace, `/` non échappé,
  échappements `\" \\ \b \f \n \r \t`, les autres contrôles en `\u00xx` **minuscules**, tout le reste brut en UTF-8 (accents,
  emoji hors BMP, DEL, U+2028). Un `Double` entier s'écrit sans `.0` (`"position":30`).
- `padded` : le clair que libsignal chiffre pour `recipients` enveloppes — `canonicalJson` suivi d'espaces jusqu'à `length`
  octets. Le palier se choisit sur les OCTETS UTF-8, jamais sur les caractères.
- `envelope` : ce que la passerelle sert avec l'enveloppe ; le clair rempli, ouvert sous cette enveloppe, rend `admitted`.

## Forme d'un cas de verdict (`verdicts[]`)

```json
{
  "name": "future-version-same-shape",
  "plaintextBase64": "…",
  "plaintextJson": "{…}",
  "envelope": { "conversationId": "…", "senderUserId": "…", "senderDeviceId": 3 },
  "payload": "message",
  "verdict": "future-version",
  "version": 2
}
```

- `plaintextBase64` : le clair tel que libsignal le rend (parfois rempli, parfois non, parfois de l'UTF-8 invalide).
- `plaintextJson` : le même, lisible, quand c'est du texte (le témoin TS vérifie qu'ils coïncident).
- `payload` : ce que la sonde doit dire — `signal` si et seulement si `s` est un ENTIER JSON, `message` sinon (y compris un
  clair illisible).
- `verdict` : l'issue de l'ouverture (sonde, puis lecture, puis confrontation à l'enveloppe, la conversation AVANT l'auteur).
  `version` accompagne `future-version`, `kind` accompagne `admitted-unknown-kind`, `expected` (le contenu ou le signal lu)
  accompagne `admitted` et `admitted-unauthored`.

## Les verdicts

| verdict | sens | iOS aujourd'hui | Android aujourd'hui |
|---|---|---|---|
| `admitted` | lu, à sa place | `.opened` / `.signal` | `Opened` / `Signal` |
| `admitted-unauthored` | contenu sans aucun auteur (client antérieur à #12976) | `.opened` (`isAuthored` vrai pour deux absents) | `Opened` |
| `admitted-unknown-kind` | signal d'une action inconnue : rangé, jamais appliqué | `.signal` (`.unknown(kind:)`) | `Signal` |
| `future-version` | version que l'appareil ne lit pas encore : **le clair se GARDE**, scellé, et se relit après la mise à jour | `unsupportedVersion` ⇒ illisible ET acquitté : perdu (IOS-04) | `UnsupportedVersion` ⇒ illisible ET acquitté : perdu (AND-04) |
| `unreadable` | pas de l'UTF-8, pas du JSON, pas un objet, clé requise absente ou du mauvais type | `DecodingError` ⇒ `.undecryptable` | `Malformed` ⇒ `Undecryptable` |
| `misattributed-conversation` | le serveur range le clair dans une autre conversation | `E2EEContentError.misattributed` | `Misattributed` |
| `misattributed-author` | le serveur le présente sous un autre auteur (ou un auteur à moitié, ou un signal sans auteur) | `.misattributedAuthor` | `MisattributedAuthor` |

`future-version` est la seule règle où le contrat **devance** l'iPhone : la version se juge AVANT toute autre clé, pour qu'une
version future de forme différente (`future-version-new-shape`) reste une version future et non « illisible ». Un appareil
n'acquitte une enveloppe que sur un verdict qui la juge (`unreadable`, `misattributed-*`) ou qui l'a rangée (`admitted*`).

## Rejouer ces fichiers

Chaque banc lit les fichiers du dépôt par chemin relatif (aucune copie) et rejoue, pour chaque cas :
1. **encodage** — `object` → encodeur → octets identiques à `canonicalBase64` ;
2. **remplissage** — octets canoniques + `recipients` → octets identiques à `padded.base64` ; et chaque ligne de
   `padding.vectors.json` (`lengths`, `ceilings`) contre la fonction de palier ;
3. **ouverture** — `padded.base64` (ou `plaintextBase64`) → sonde → lecteur → confrontation à `envelope` → `payload`, `verdict`
   et, s'il y a lieu, `expected`, `version`, `kind`.

| plateforme | banc | comment |
|---|---|---|
| shared (TS) et web | `packages/shared/__tests__/e2ee-content.test.ts` (vitest, **rejoué aujourd'hui**) | le web n'écrit pas de troisième jumelle : il consomme `@meeshy/shared/types/e2ee-content` (`encodeE2EEContent`, `encodeE2EESignal`, `padE2EEPlaintext`, `openE2EEPlaintext`) |
| iOS | Swift Testing dans `packages/MeeshySDK/Tests/MeeshySDKTests/E2EE/`, fichier lu depuis `#filePath` (six dossiers parents, comme `LibsignalCrossPlatformVectorTests`) | `object` se décode en `E2EEContent` / `E2EESignal` par `JSONDecoder`, puis `encoded()` ; `E2EEPadding.padded(_:recipients:)` ; ouverture = `E2EEPayloadKind.of`, `E2EEContent.decoded(from:)` ou `E2EESignal.decoded(from:)`, `belongs(to:)`, `isAuthored(by:deviceId:)` |
| Android | JUnit dans `:core:e2ee`, fichier trouvé en remontant les dossiers (`repositoryFile(…)` de `LibsignalCrossPlatformVectorsTest`) | même chaîne avec `E2eeContent.decoded`, `E2eePadding.padded`, `E2eePayloadKind.of`, `belongsTo`, `isAuthoredBy` ; les signaux, tant qu'Android n'a pas de décodeur (#13202), par la vérification de `E2eeEnvelopeOpener.checkSignal` |

### Écarts attendus au premier rejeu natif (relevés à la lecture du code, non exécutés ici)

- iOS et Android : `future-version` est aujourd'hui une perte (verdict puis acquittement), et iOS juge `future-version-new-shape`
  illisible (il décode tout avant de regarder `v`).
- Android : la sonde classe signal tout `s` non nul (`s-not-an-integer-is-a-message`, `version-fractional-is-a-message`) ;
  `authorDeviceId` est un `Int` (`author-device-negative`) ; le décodage UTF-8 remplace les octets invalides au lieu de refuser
  (`invalid-utf8`) ; kotlinx.serialization peut accepter un nombre entre guillemets (`sent-at-as-string`) ; un signal n'est
  vérifié que sur `s`, la conversation et l'auteur (`reaction-missing-emoji`, `receipt-unknown-value`…).
- Android : `Double.toString` écrit `30.0` ; le jour où il émettra `read-progress`, il devra écrire `30`.

Chaque écart qui tombe au rejeu se corrige dans le client, jamais dans le fichier : le fichier est le contrat.

## Faire évoluer le contrat

- Ajouter un cas ne coûte rien et ne change aucun client.
- Changer un `canonicalJson` existant change le format : c'est un lot sur les trois plateformes, jamais une retouche du fichier.
- Une version 2 du contenu ou des signaux vit dans un NOUVEAU fichier (`content.v2.vectors.json`) ; le fichier v1 reste, parce
  qu'un client v1 continue d'en recevoir (#9223), et un appareil n'écrit pas une version que ses destinataires ne lisent pas
  (#13048).
