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
- `plaintextJson` : le même, lisible, quand c'est du texte, privé de ses blancs JSON de fin (le témoin TS vérifie qu'ils
  coïncident). Pour `future-version`, c'est aussi le JSON que le verdict GARDE (`json`).
- `payload` : ce que la sonde doit dire — `signal` si et seulement si `s` est un ENTIER JSON, `message` sinon (y compris un
  clair illisible).
- `verdict` : l'issue de l'ouverture (sonde, puis lecture, puis confrontation à l'enveloppe, la conversation AVANT l'auteur).
  `version` accompagne `future-version`, `kind` accompagne `admitted-unknown-kind`, `expected` (le contenu ou le signal lu)
  accompagne `admitted` et `admitted-unauthored`, `reason` accompagne `unreadable` quand la raison fait partie du contrat
  (aujourd'hui la profondeur, `not-json` : § « La profondeur d'imbrication »).

## Les verdicts

| verdict | sens | iOS aujourd'hui | Android aujourd'hui |
|---|---|---|---|
| `admitted` | lu, à sa place | `.opened` / `.signal` | `Opened` / `Signal` |
| `admitted-unauthored` | contenu sans aucun auteur (client antérieur à #12976) | `.opened` (`isAuthored` vrai pour deux absents) | `Opened` |
| `admitted-unknown-kind` | signal d'une action inconnue : rangé, jamais appliqué | `.signal` (`.unknown(kind:)`) | `Signal` |
| `future-version` | version que l'appareil ne lit pas encore : **le clair se GARDE**, scellé (son JSON privé de ses blancs de fin), et se relit après la mise à jour | `unsupportedVersion` ⇒ illisible ET acquitté : perdu (IOS-04) | `UnsupportedVersion` ⇒ illisible ET acquitté : perdu (AND-04) |
| `unreadable` | pas de l'UTF-8, pas du JSON (dont une demi-paire de substitution, où qu'elle soit, et une imbrication de plus de 64 niveaux), pas un objet, clé requise absente ou du mauvais type | `DecodingError` ⇒ `.undecryptable` | `Malformed` ⇒ `Undecryptable` |
| `misattributed-conversation` | le serveur range le clair dans une autre conversation | `E2EEContentError.misattributed` | `Misattributed` |
| `misattributed-author` | le serveur le présente sous un autre auteur (ou un auteur à moitié, ou un signal sans auteur) | `.misattributedAuthor` | `MisattributedAuthor` |

`future-version` est la seule règle où le contrat **devance** l'iPhone : la version se juge AVANT toute autre clé, pour qu'une
version future de forme différente (`future-version-new-shape`) reste une version future et non « illisible ». Un appareil
n'acquitte une enveloppe que sur un verdict qui la juge (`unreadable`, `misattributed-*`) ou qui l'a rangée (`admitted*`).

## Ce qui suit le remplissage, et les demi-paires (WEBX-06)

**Le remplissage est fait d'espaces U+0020, mais un clair peut finir par d'autres blancs.** L'iPhone ne retire rien avant de
lire : `JSONDecoder` décode le clair rempli ENTIER, et admet en fin tout blanc JSON (RFC 8259 § 2 : U+0020, U+0009, U+000A,
U+000D). Un émetteur peut donc faire suivre le remplissage d'un `\n` : le clair reste lisible (`padding-then-newline-still-reads`).
Le JSON qu'une `future-version` GARDE est le clair privé de TOUS ses blancs JSON de fin (`future-version-padding-then-newline`,
contenu et signal), retirés par un parcours **linéaire** depuis la fin. Jamais une expression ancrée sur `$` : `/ +$/` retentait
chaque départ dans la suite d'espaces et échouait au `\n` final, soit 0,8 s pour 48 Ko sous JavaScriptCore comme sous V8, sous le
verrou du coffre de l'appareil. Témoin TS : 64 Kio d'espaces puis `\n` s'ouvrent en moins de 5 ms (mesuré : 0,4 ms au mieux de
cinq, contre 1,7 s avant). Le jour où iOS et Android garderont une version future (IOS-04, AND-04), ils retireront les mêmes
quatre octets, en temps linéaire.

**Une demi-paire de substitution rend le clair illisible, où qu'elle soit.** `JSON.parse` admet l'échappement d'une moitié
isolée (`"\ud800"`, `"\udc00"`, ou deux moitiés dans le mauvais ordre) ; l'encodeur refuse d'en écrire une. Le lecteur TS
s'aligne sur l'encodeur : une clé ou une valeur qui porte une demi-paire, même sous une clé que la version 1 ignore, rend
`unreadable` (raison `not-json`), et la sonde range le clair parmi les messages, comme tout JSON illisible. Une demi-paire
encodée en octets (`ED A0 80`) n'est pas de l'UTF-8 (`surrogate-encoded-in-utf8`). Une paire échappée COMPLÈTE
(`"\ud83d\ude00"`) est un point de code et se lit (`escaped-surrogate-pair-reads`).

- **Swift** (lu dans les sources, **non exécuté** : aucune chaîne Swift dans ce conteneur). Jusqu'à iOS 16, `JSONDecoder`
  analyse tout le document avant de décoder, et refuse une demi-paire échappée où qu'elle soit (`JSONSerialization` :
  « Unable to convert hex escape sequence (no low character) to UTF8-encoded character »). C'est le verdict de ces vecteurs, sonde
  comprise. À partir d'iOS 17, le `JSONDecoder` de swift-foundation ne déséchappe une chaîne que lorsqu'il la décode. Il refuse
  donc une demi-paire dans un champ lu (`text`, `emoji`…), avec le même verdict. Mais il ne voit pas celle d'une clé ignorée
  (`lone-surrogate-in-an-ignored-key` : admis). Et sa sonde, qui ne décode que `s`, classe signal la réaction de
  `lone-surrogate-escape-is-an-unreadable-message` avant de la juger illisible. Ce sont deux écarts attendus au rejeu iOS
  (#18943). Ils ne donnent à l'émetteur aucune capacité : Sesame lui permet déjà de sceller un clair différent par appareil.
- **Kotlin** : kotlinx.serialization déséchappe `\ud800` en une `String` qui porte la demi-paire, puisque les chaînes JVM
  l'admettent. Android admet donc aujourd'hui ces clairs. C'est un écart attendu (#18944).

**À l'écriture, l'encodeur TS LÈVE sur une demi-paire** (`encodeE2EEContent`, `encodeE2EESignal`) : il n'écrit pas ce
qu'aucun appareil ne lirait. Aucun émetteur honnête n'en produit sur l'iPhone (une `String` Swift est toujours bien formée)
ni sur Android (l'encodeur UTF-8 de la JVM la remplace par `?`). **Un texte web, si** : copier-coller, emoji tronqué au
milieu de sa paire. Le web passe donc tout texte saisi par `wellFormedE2EEText` AVANT d'encoder : chaque demi-paire isolée
devient U+FFFD, comme `String.prototype.toWellFormed`, et l'envoi part au lieu d'être perdu (audit de #19080, E7).

## Les entiers : `sentAt` et l'intervalle sûr

Le contrat TS lit un entier JSON comme `Number.isSafeInteger` (zod `.int()`) : `sentAt` (un `Int64` Swift, un `Long`
Kotlin) se lit entre −(2^53 − 1) et 2^53 − 1. Au-delà, un nombre JavaScript ne représente plus chaque entier, et la lecture
TS rend `unreadable` (`invalid-fields`). L'iPhone (`Int64`) et Android (`Long`) admettent aujourd'hui jusqu'à
2^63 − 1 : un `sentAt` de 2^60 est lu sur mobile et illisible sur le web. Seul un émetteur hostile y arrive (un `sentAt`
honnête vaut environ 1,79 × 10^12, loin de 2^53 ≈ 9,0 × 10^15) ; il ne gagne rien que Sesame ne lui donne déjà (sceller un
clair différent par appareil). La borne du contrat est l'intervalle sûr : iOS et Android s'y alignent au rejeu (#18943,
#18944).

## La profondeur d'imbrication (#19112)

**Un clair a au plus 64 niveaux d'imbrication** (`E2EE_MAX_DEPTH`). Un contenu en a 1 (l'objet), un signal 2 au plus : aucun
clair légitime n'approche la borne. Elle existe pour qu'un clair hostile (30 000 `[` tiennent sous le plafond d'une enveloppe)
rende le même verdict partout. Sans elle, un analyseur récursif déborde (kotlinx-serialization sur Android), un autre lit
(`JSON.parse` analyse sans récursion ; seul son `reviver` déborde, au-delà de plusieurs milliers de niveaux), un troisième
s'arrête à sa propre borne (le `JSONDecoder` de l'iPhone, vraisemblablement 512, **non vérifié**) : un clair de profondeur 65 à
512 était lisible sur une plateforme et pas sur une autre.

La règle, que chaque client applique **à l'identique** :

1. le clair se décode en UTF-8 strict d'abord : un octet invalide rend `unreadable` (`not-utf8`), quelle que soit la profondeur ;
2. puis un parcours **linéaire**, sans analyse, compte la profondeur. Hors d'une chaîne, `[` et `{` ouvrent un niveau, `]` et `}`
   le ferment, `"` ouvre une chaîne. Dans une chaîne, `\` échappe l'unité qui le suit (`\"` ne ferme pas la chaîne ; dans
   `"\\"`, le second guillemet la ferme) et `"` la ferme. Dès qu'un niveau dépasse 64, le clair est `unreadable` (`not-json`),
   **avant toute analyse**, quelle que soit sa version (aucune `future-version` au-delà de la borne) et quoi qu'il porte (la sonde
   le range parmi les messages, comme tout JSON illisible) ;
3. sinon, l'analyse et la lecture habituelles.

Les délimiteurs sont ASCII : compter sur les octets UTF-8, les unités UTF-16 ou les points de code donne le même nombre. Pour un
JSON valide, le compte est sa profondeur. Un texte qui ferme plus qu'il n'ouvre n'est pas du JSON : la borne le laisse passer,
l'analyse le refuse, et le verdict (`not-json`) ne dépend pas de la manière dont un client compte un niveau négatif.

Les vecteurs portent `reason` : `depth-at-the-limit-reads` (64, contenu et signal : admis), `depth-beyond-the-limit-is-unreadable`
et `depth-beyond-the-limit-is-an-unreadable-message` (65), `future-version-beyond-the-limit-is-unreadable` et
`future-version-beyond-the-limit-is-an-unreadable-message` (illisibles, jamais gardés), `brackets-inside-strings-do-not-count`
(400 ouvrants dans une chaîne, après `\"` et avant `\\` : admis), `escaped-backslash-closes-the-string` (`"\\"` ferme la
chaîne : les 64 tableaux qui suivent comptent) et `deep-array-is-not-json` (1 000 niveaux : `not-json`, avant `not-an-object`).

- **web** : il consomme `openE2EEPlaintext` ; la borne lui est acquise.
- **Android** : 64 depuis #19077 (`E2eePlaintextReader.MAX_DEPTH`, même parcours) ; il lira la constante du contrat (#19112).
- **iOS** : la borne se pose AVANT `JSONDecoder` (#19112). D'ici là, le rejeu iOS admet les clairs de profondeur 65 à 512.

## Ce que ce contrat ne lie pas encore

- **Le clair n'est pas lié à SON message** (WEB-15, #18984). `E2EEEnvelopeOrigin` ne porte que la conversation et l'auteur.
  L'enveloppe servie (`E2EEServedEnvelope`) n'a pas de `clientMessageId`, que le contenu écrit pourtant. Un serveur compromis
  peut donc PERMUTER les corps de deux messages d'un même auteur dans une même conversation : chaque ouverture rend `admitted`.
  La liaison passe par la passerelle, qui servira `clientMessageId` sur l'enveloppe, et par ce module, qui étendra
  `E2EEEnvelopeOrigin`, pour les trois clients à la fois.
- **Un contenu sans auteur reste admis** (`admitted-unauthored`, #18985). L'iPhone n'écrit `authorUserId` et `authorDeviceId`
  dans le contenu que depuis le 2026-11-15 (`6e02cd892a`). Les iPhone publiés avant n'en écrivent pas : refuser leurs messages
  les perdrait. Sans auteur, un serveur compromis peut réattribuer un premier message (type 3) à un appareil fantôme d'un autre
  compte, que la confiance au premier usage accepte (WEB-18). Le verdict est distinct pour être compté, puis refusé sur les trois
  clients à usage mesuré nul.

Ce contrat ne fait que lier le clair à sa conversation et à son auteur. L'authenticité vient de libsignal. La composition Meeshy
autour de libsignal n'a reçu aucune revue externe : une revue cryptographique tierce reste requise (#3710).

## Rejouer ces fichiers

Chaque banc lit les fichiers du dépôt par chemin relatif (aucune copie) et rejoue, pour chaque cas :
1. **encodage** — `object` → encodeur → octets identiques à `canonicalBase64` ;
2. **remplissage** — octets canoniques + `recipients` → octets identiques à `padded.base64` ; et chaque ligne de
   `padding.vectors.json` (`lengths`, `ceilings`) contre la fonction de palier ;
3. **ouverture** — `padded.base64` (ou `plaintextBase64`) → sonde → lecteur → confrontation à `envelope` → `payload`, `verdict`
   et, s'il y a lieu, `expected`, `version`, `kind`, `reason`.

| plateforme | banc | comment |
|---|---|---|
| shared (TS) et web | `packages/shared/__tests__/e2ee-content.test.ts` (vitest, **rejoué aujourd'hui**) | le web n'écrit pas de troisième jumelle : il consomme `@meeshy/shared/types/e2ee-content` (`encodeE2EEContent`, `encodeE2EESignal`, `padE2EEPlaintext`, `openE2EEPlaintext`) |
| iOS | Swift Testing dans `packages/MeeshySDK/Tests/MeeshySDKTests/E2EE/`, fichier lu depuis `#filePath` (six dossiers parents, comme `LibsignalCrossPlatformVectorTests`) | `object` se décode en `E2EEContent` / `E2EESignal` par `JSONDecoder`, puis `encoded()` ; `E2EEPadding.padded(_:recipients:)` ; ouverture = `E2EEPayloadKind.of`, `E2EEContent.decoded(from:)` ou `E2EESignal.decoded(from:)`, `belongs(to:)`, `isAuthored(by:deviceId:)` |
| Android | JUnit dans `:core:e2ee`, fichier trouvé en remontant les dossiers (`repositoryFile(…)` de `LibsignalCrossPlatformVectorsTest`) | même chaîne avec `E2eeContent.decoded`, `E2eePadding.padded`, `E2eePayloadKind.of`, `belongsTo`, `isAuthoredBy` ; les signaux, tant qu'Android n'a pas de décodeur (#13202), par la vérification de `E2eeEnvelopeOpener.checkSignal` |

### Écarts attendus au premier rejeu natif (relevés à la lecture du code, non exécutés ici)

- iOS et Android : `future-version` est aujourd'hui une perte (verdict puis acquittement), et iOS juge `future-version-new-shape`
  illisible (il décode tout avant de regarder `v`).
- iOS 17 et plus : `lone-surrogate-in-an-ignored-key` admis, et la sonde de `lone-surrogate-escape-is-an-unreadable-message`
  dit `signal` (voir § « Ce qui suit le remplissage, et les demi-paires »).
- Android : les demi-paires échappées sont admises (`lone-high-surrogate-escape`, `lone-low-surrogate-escape`,
  `reversed-surrogate-escapes`, `lone-surrogate-in-an-ignored-key`).
- Android : la sonde classe signal tout `s` non nul (`s-not-an-integer-is-a-message`, `version-fractional-is-a-message`) ;
  `authorDeviceId` est un `Int` (`author-device-negative`) ; le décodage UTF-8 remplace les octets invalides au lieu de refuser
  (`invalid-utf8`) ; kotlinx.serialization peut accepter un nombre entre guillemets (`sent-at-as-string`) ; un signal n'est
  vérifié que sur `s`, la conversation et l'auteur (`reaction-missing-emoji`, `receipt-unknown-value`…).
- Android : `Double.toString` écrit `30.0` ; le jour où il émettra `read-progress`, il devra écrire `30`.
- iOS et Android : un `sentAt` hors de l'intervalle sûr (au-delà de 2^53 − 1) est admis (`Int64`, `Long`) là où le contrat
  le juge `invalid-fields` (§ « Les entiers »).
- iOS : tant que la borne de profondeur n'est pas posée avant `JSONDecoder` (#19112), `depth-beyond-the-limit-is-unreadable`,
  `escaped-backslash-closes-the-string` et leurs jumeaux de signal sont admis, et les deux `future-version-beyond-the-limit-*`
  gardés.

Chaque écart qui tombe au rejeu se corrige dans le client, jamais dans le fichier : le fichier est le contrat.

## Faire évoluer le contrat

- Ajouter un cas ne coûte rien et ne change aucun client.
- Changer un `canonicalJson` existant change le format : c'est un lot sur les trois plateformes, jamais une retouche du fichier.
- Une version 2 du contenu ou des signaux vit dans un NOUVEAU fichier (`content.v2.vectors.json`) ; le fichier v1 reste, parce
  qu'un client v1 continue d'en recevoir (#9223), et un appareil n'écrit pas une version que ses destinataires ne lisent pas
  (#13048).
