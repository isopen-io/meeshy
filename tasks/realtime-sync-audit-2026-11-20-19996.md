# L'identité du réacteur franchit le sérialiseur (#19996)

> Journal daté. Il raconte ce qui était vrai le 2026-11-20 ; l'état de la tâche
> vit dans l'issue #19996, qui a raison en cas d'écart.
>
> **Pas de numéro de cycle dans ce nom de fichier, et c'est délibéré.** Le
> 2026-11-20, `tasks/` portait déjà `cycle188-19943`, `cycle188-19956`,
> `cycle189-19960` et `cycle189-20007`, écrits par quatre sessions parallèles :
> le numéro de cycle est un espace de noms PARTAGÉ que personne n'alloue, donc
> il collisionne (leçon #5102 — « un identifiant qui ne s'alloue pas ne
> collisionne pas »). Le numéro d'ISSUE, lui, est unique par construction.

## Le défaut

`GET /api/v1/reactions/:messageId` déclarait, pour chaque réacteur, une identité
nommée `userId` (`packages/shared/types/api-schemas/reaction.ts`). Son unique
producteur, `ReactionService.getMessageReactions`, en pose une nommée
`participantId`. L'agrégat est servi tel quel (`sendSuccess(reply, reactions)`),
et `fast-json-stringify` applique `additionalProperties: false` par défaut : il
supprimait la clé servie et ne fabriquait pas la clé déclarée.

**Aucune identité ne franchissait le sérialiseur.** Mesuré sur la réponse réelle :

```
users[0] = { username: "Alice", avatar: null, createdAt: "…" }
         → userId: undefined, participantId: undefined
```

### Ce que ça coûtait

| client | déclaration | effet |
|---|---|---|
| iOS | `ReactionUserDetail.userId: String`, `Codable` synthétisé | `keyNotFound(userId)` ⇒ décodage de la réponse ENTIÈRE échoué ⇒ `MessageReactionsDetailView` garde son seed local : **« Inconnu » pour tout le monde sauf soi, définitivement** |
| Android | `val userId: String` — le SEUL des quatre champs sans défaut | `MissingFieldException` ⇒ `fetchDetails` rend `null` ⇒ `refreshOwnReactions` n'allume jamais « ma réaction » depuis le serveur, donc **aucune reprise multi-appareil** |
| web | lit `username`/`avatar` seuls, parsing tolérant | **non affecté** |

La seule plateforme saine est la plus observée. C'est ce qui a tenu le défaut en
vie, et c'est un motif à retenir : **une panne qui épargne la plateforme de
développement ne produit aucun signal.**

## Le correctif

Les deux clés sont servies ET déclarées, parce qu'elles ne disent pas la même
chose :

- `participantId` — TOUJOURS servi. C'est la colonne que `Reaction` porte, et la
  seule identité qu'un invité de lien possède.
- `userId` — NULLABLE, servi pour un réacteur inscrit. Le `select` du producteur
  chargeait `participant.userId` depuis toujours : **le vrai `User.id` était en
  main et n'était pas posé.**

Le repli est `?? null`, **jamais `?? pid`**. Le `CLAUDE.md` de la passerelle
l'interdit explicitement — « ces champs déclarent un `User.id` » — et un
`userId: userId ?? participantId` servirait un id de la mauvaise ESPÈCE sous un
nom qui promet l'autre. Un témoin garde cette frontière et tomberait sur ce
raccourci.

`userIds`, déclaré au même schéma, est **retiré** : aucun producteur du dépôt ne
le composait et aucun client ne le lisait. Le déclarer n'avait aucun effet, et le
garder entretenait la fiction d'un champ servi.

## Pourquoi aucun cliquet ni aucun témoin ne le voyait

**Les trois cliquets de schéma sont à inventaire VIDE et aucun ne couvre cette
forme.** `response-schema-sweep` cherche une déclaration ABSENTE (un objet nu
sans `properties`) ; `response-payload-mismatch` une clé déclarée que la charge
ne porte pas — or `users` EST portée, c'est une clé **PETITE-FILLE** qui diverge,
un niveau où le balayage ne descend pas ; `error-schema-sweep` ne regarde que les
refus. C'est la QUATRIÈME famille que `services/gateway/CLAUDE.md` déclare
lui-même non outillée : une déclaration **présente, bien formée, et fausse contre
son producteur**.

**Et le témoin qui couvrait déjà la route ne pouvait pas tomber.**
`reactions-get-admission.test.ts` mocke l'enveloppe
(`mockSendSuccess` ⇒ `reply._body = data`) : aucune sérialisation n'a lieu, et
`participantId` y est bien présent. Son doc-comment assume ce choix et le
justifie — « le témoin assert donc sur la REQUÊTE » — ce qui est **exact pour la
garde d'ADMISSION qu'il couvre**, et c'est précisément ce qui le rend aveugle
ici. Le défaut vit dans l'espace entre ce que le handler compose et ce que le
sérialiseur laisse sortir, et aucun témoin du dépôt n'occupait cet espace.

Le témoin neuf (`reactions-reactor-identity-served.test.ts`) l'occupe : vrai
Fastify, route montée par son spécificateur de production, **vrai
`ReactionService`** (pour que ce soit le producteur réel qui compose, pas une
fixture qui réciterait la forme attendue), **vrais schémas partagés** — doubler
`@meeshy/shared/types/api-schemas` désarmerait `fast-json-stringify`, la couche
même où le défaut vit, et le dépôt a payé trois fois le double partiel de ce
module. Assertion sur `res.json()`.

## Trois sites portaient la même affirmation fausse

Et c'est la part la plus instructive du lot. Aucun n'avait jamais été confronté
au producteur :

1. le schéma (`reaction.ts`) — il DÉCLARAIT `userId` ;
2. le commentaire du handler (`routes/reactions.ts`) — « le
   `displayName`/`avatar`/`userId` de chaque réacteur » ;
3. le doc-comment du témoin d'admission — « son `displayName`, son `avatar`, son
   `userId` ».

Les trois sont corrigés dans le même lot. **Un commentaire qui survit à son
correctif redevient la source du prochain défaut** — c'est la raison pour
laquelle on ne répare pas seulement le code.

## Preuve

- ROUGE prouvé sur les trois témoins avant correctif (identité `undefined` dans
  la réponse SERVIE, sur un 200 dont le `username` sortait bien).
- VERT après : 3/3.
- `tsc --noEmit` EXIT=0 (après `prisma generate` — la seconde fusion de `dev`
  avait ajouté `User.fallAlertConsentedAt`, et un client Prisma périmé fait
  échouer `tsc` sur un fichier étranger au lot).
- 16 suites / 287 tests (réactions), 142 suites / 1 586 tests (conversations +
  talkie + socketio), 43 suites / 333 tests (`ci` + `security`), 77/78 cliquets
  racine.

### Le 78e cliquet est ROUGE, et c'est HÉRITÉ

`gateway-file-size-budget` règle 3 :
`socketio/handlers/MessageHandler.ts : 2269 → 2281`. Prouvé mécaniquement
étranger à ce lot — le fichier est identique dans `origin/dev` et ici (2281
lignes des deux côtés), et le gel de `dev` lui-même porte 2269. Introduit par la
PR #20022 (#20007), fusionnée quelques minutes plus tôt.

La réparation n'est PAS de regeler le nombre : le `CLAUDE.md` racine dit qu'un
fichier déjà hors budget est **interdit d'ajout** et qu'« on extrait d'abord, on
ajoute ensuite ». Elle appartient à son lot, et fait l'objet d'une issue à part.
