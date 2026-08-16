# Cycle 44 — Un lien partagé ne pouvait montrer ni nom d'invité, ni pièce jointe, ni réponse citée

Routine « temps réel », 2026-08-16. Point de départ : la piste PRIORITAIRE
laissée par le cycle 43 sur `GET /links/:identifier/messages`.

## 0. Vérification de la piste héritée

Leçon 278 : *une piste laissée en fin de cycle est une hypothèse, pas un
constat.* Relue dans le code avant toute écriture — **elle est exacte**.
`messageSchema` (`routes/links/types.ts`) déclarait sept propriétés là où
`formatMessageWithSeparateSenders` en produit quinze.

Mesuré sur un VRAI Fastify, avec le VRAI schéma et le VRAI formateur :

```
PRODUCED KEYS : anonymousSender,attachments,content,createdAt,deletedAt,editedAt,id,
                isEdited,messageType,originalLanguage,reactions,replyTo,replyToId,
                sender,translations,updatedAt
SERVED KEYS   : content,createdAt,id,messageType,originalLanguage,sender,translations
DROPPED       : isEdited,editedAt,deletedAt,replyToId,updatedAt,anonymousSender,
                attachments,replyTo,reactions

ANON MESSAGE AS SERVED : {"id":"m1","content":"Bonjour","originalLanguage":"fr",
  "messageType":"text","createdAt":"…","sender":null,"translations":[]}
```

## 1. Le défaut, et pourquoi il est fonctionnel avant d'être une dépense

`formatMessageWithSeparateSenders` mettait `sender: null` pour un auteur
anonyme et rangeait son nom dans `anonymousSender` — champ que le schéma ne
déclarait pas, donc retiré à la sérialisation.

**Un message d'invité arrivait donc sans aucune identité.** Sur un lien
partagé, les invités sont la population majoritaire. Les bulles web lisent
`message.sender?.username` (`MessageNameDate.tsx`, `MessageHeader.tsx`) : sans
`sender`, aucun nom ne s'affiche.

Trois autres capacités étaient muettes pour la même raison : **pièces jointes**,
**réactions**, **réponse citée**. Un lien peut pourtant autoriser explicitement
les envois anonymes de fichiers et d'images (`allowAnonymousFiles`,
`allowAnonymousImages`) — reçus, stockés, jamais affichables dans l'historique.

La description OpenAPI de la route promettait déjà tout cela. Le schéma de
sortie la contredisait en silence.

## 2. Ce que les clients lisent réellement — établi avant de trancher

Le cycle 43 exigeait d'établir le besoin client avant de déclarer quoi que ce
soit. Relevé :

| Champ | Chargé | Lecteur web | Lecteur iOS | Décision |
|---|---|---|---|---|
| `sender` | oui | **oui** (`sender?.username`) | — | **porte l'identité des DEUX types d'auteurs** |
| `anonymousSender` | dérivé | **0** | **0** | **non déclaré** — voir § 3 |
| `attachments` | oui (select imbriqué) | oui | — | déclaré (schéma canonique partagé) |
| `reactions` | oui | oui | — | déclaré |
| `replyTo` / `replyToId` | oui | oui | — | déclarés |
| `isEdited` / `editedAt` / `updatedAt` | scalaires | oui | — | déclarés |
| `deletedAt` | scalaire | — | — | **non déclaré** — la requête filtre `deletedAt: null`, valeur constante |
| `sender.systemLanguage` | oui | **0** | — | plus recopié — jamais servi, jamais lu |

Aucune route de lien n'a de consommateur iOS : `MeeshySDK` et `apps/ios`
n'appellent aucun `/links/…/messages` et ne mentionnent `anonymousSender` nulle
part.

## 3. Pourquoi `sender` et non `anonymousSender`

Déclarer `anonymousSender` aurait ouvert une **seconde voie nominative** vers
une donnée que `sender` sert déjà — exactement la configuration que le cycle 43
a refusée, et pour un champ que personne ne lit : le défaut d'affichage serait
resté entier.

Servir l'identité par `sender` **n'expose rien de nouveau** : `GET
/links/:identifier` sert DÉJÀ le nom des invités dans `sender`, sur le même lien
et pour la même conversation, via `formatMessageWithUnifiedSender`. La route
`/messages` était la seule à ne pas le faire. `isMeeshyer` distingue les deux
cas — il était déjà déclaré au schéma, simplement jamais produit par ce
formateur.

Le formateur est renommé `formatLinkMessageWithDetails` : « separate senders »
nommait précisément la séparation qui produisait le défaut.

## 4. La dépense, elle, est retirée

`getConversationMessagesWithDetails` chargeait `replyTo.attachments` et
`replyTo.reactions` — une jointure imbriquée par page — alors que
`formatReplyToMessage` ne les a **jamais** recopiées : une citation ne rend que
son texte et son auteur. Ces données n'atteignaient même pas le sérialiseur.
Includes retirés.

Tout le reste de ce que la requête charge est désormais servi : `DROPPED` est
vide après correctif.

## 5. Après correctif — même mesure, même serveur

```
PRODUCED KEYS : attachments,content,createdAt,editedAt,id,isEdited,messageType,
                originalLanguage,reactions,replyTo,replyToId,sender,translations,updatedAt
SERVED KEYS   : attachments,content,createdAt,editedAt,id,isEdited,messageType,
                originalLanguage,reactions,replyTo,replyToId,sender,translations,updatedAt
DROPPED       :

ANON MESSAGE AS SERVED : {… "sender":{"id":"p_anon_1","username":"Invitée Camille",
  "displayName":"Invitée Camille","avatar":"https://cdn/x.png","isMeeshyer":false},
  "replyTo":{…}, "attachments":[…], "reactions":[…] …}
```

## 6. Quatrième cycle consécutif — le double qui décrit un autre programme

`messages-retrieval.test.ts` remplace `messageSchema` par
`{ type: 'object', properties: {} }` et le formateur par l'identité. Aucun de
ses témoins ne pouvait constater la troncature : son Fastify n'a pas le schéma
de la route.

La garde ajoutée (`messages-retrieval-serialization.test.ts`) monte le VRAI
schéma sur un VRAI Fastify et y fait passer la sortie du VRAI formateur. C'est
la seule forme qui observe un contrat de sortie.

## Gates

- [x] 6 témoins vus ROUGES avant correctif (2 gardes vertes d'emblée : elles
      portent la raison — `anonymousSender` et `deletedAt` non servis)
- [x] `npx tsc --noEmit` gateway : 0
- [x] Suite `routes/links` : 22 suites, **421 tests**, vert
- [x] Suite gateway complète : **728 suites, 17 787 tests, tout vert**
      (cycle 43 : 727 / 17 776 — +1 suite, +11 tests)
- [x] Description OpenAPI de la route corrigée (elle décrivait `anonymousSender`)
- [x] Garde de non-régression sur la route JUMELLE : le schéma élargi est
      partagé avec `GET /links/:identifier`, dont le formateur est plus maigre —
      un témoin vérifie qu'aucun champ fantôme n'y apparaît (aucune propriété
      ajoutée ne porte de `default`, qui serait matérialisé)
- [x] CHANGELOG + journal de cycle + leçon 280

## Écarté délibérément

**Réutiliser le `messageSchema` canonique de `@meeshy/shared`.** Il déclare une
cinquantaine de champs (chiffrement, view-once, épinglage, compteurs de
livraison) que ni la requête ni le formateur de cette route ne produisent.
Déclarer en bloc est précisément le piège nommé par le cycle 43. Seul le
`messageAttachmentSchema` canonique est réutilisé — il porte les champs Prisme
(`transcription`, `translations`) sans lesquels un vocal d'invité resterait
non transcrit.

**Retirer `anonymousSender` du type partagé `GatewayMessage`.** Hors sujet ici,
et même raisonnement qu'au cycle 43 : une surface de type publique mérite sa
propre dépréciation.

## Piste pour le cycle 45 — repérée, NON livrée

`GET /links/:identifier` (`retrieval.ts`) partage le `messageSchema` désormais
élargi, mais son formateur `formatMessageWithUnifiedSender` ne produit que sept
champs — dont un `status: message.status || []` que `getConversationMessages` ne
charge pas (constante `[]`) et que le schéma ne déclare pas. À établir avant
d'écrire : cette route sert-elle un aperçu délibérément réduit (auquel cas le
`status` mort se retire), ou doit-elle rendre le même fil que `/messages` ?
Vérifier `link-conversation.service.ts` côté web, qui l'appelle.
