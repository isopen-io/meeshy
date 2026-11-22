# Cycle 216 — quatre producteurs de `message:edited`, trois qui signent leur file (#20305)

*Routine « amélioration continue du temps réel », même session que le cycle 215
(#20304). Les deux lots voyagent sur la même PR, la CI des PR étant gelée et les
runners saturés.*

## Le défaut

`broadcastMessageMutation` — le transport REST de `message:edited` — calcule un
plan de signature par lecteur et **ne s'en sert que pour l'émission EN DIRECT**.
L'enfilage hors ligne, cent lignes plus bas et dans un `try` SÉPARÉ, ne
référençait jamais `plan` : il passait `...queuedVariant(params)`, la charge
GÉNÉRIQUE, plus le seul crochet de scellement de citation.

Ses trois frères composent tous `offlineSignedEdit` + `queueSigningFields` :
`MessageHandler` (socket), `callSummaryEditedDelivery`, et les producteurs de
`message:new` / `attachment-updated`. `editedOfflineSigning.ts:17-19` NOMMAIT le
manque — « `offlineSignedPayload` (#18619) énonce la règle ; elle avait quatre
consommateurs, et aucun transport d'édition ».

**Second trou, au même site.** `readerSignedPlanForMessageId` est la variante
NON best-effort : son erreur REMONTE, parce que « sans les destinataires on ne
sait adresser personne ». Elle vivait dans le `try` de l'émission directe, dont
le `catch` ne fait qu'`onError`. Sur un échec de lecture, l'émission directe
était donc correctement sautée — **et l'enfilage, qui vit dans le `try` suivant,
s'exécutait quand même**, écrivant dans Redis pour 48 h
(`DELIVERY_QUEUE_TTL_SECONDS`) une charge qu'on venait de déclarer non
adressable. C'est exactement la décision `PLAN_UNAVAILABLE ⇒ withhold` que
`offlineSignedPayload` existe pour faire respecter sur les DEUX canaux.

## Piège ARMÉ, pas panne — et la mesure qui le dit

`readerSignedPlanForMessageId` rend `null` dès que `attachments` est vide
(il sort sur `asAttachments(...).length === 0`). Les trois routes REST d'édition
ne mettent aucune pièce jointe dans leur charge (`messages-writes.ts`,
`conversations/messages-advanced-edit.ts` et son jumeau) : aujourd'hui `plan` est
donc toujours `null` sur ce chemin et rien ne fuit. **Le chemin SOCKET, lui, les
porte.**

Le jour où quelqu'un ajoute `attachments` à une charge d'édition REST — une
ligne, pour la parité avec le chemin socket — le défaut s'arme : l'émission
directe signe l'adresse pour le lecteur, l'entrée enfilée stocke le `fileUrl` NU
pour 48 h, et le rejeu remet une adresse non signée. Sous
`ATTACHMENT_URL_SIGNATURE_ENFORCE` actif, le même rejeu rend une pièce
définitivement cassée ; pour une conversation chiffrée `server`/`hybrid`, la clé
nue est refusée sans condition. Règle du cycle 84 : **on ne laisse pas un piège
armé au motif que personne n'a encore marché dessus.**

## Ce que le lot écrit

- **Le plan vit HORS du `try` d'émission, et en BEST-EFFORT**
  (`readerSignedPlanForMessageIdBestEffort`) : c'est ce qui le rend visible de
  l'enfilage, et ce qui remplace l'exception par le verdict à trois valeurs que
  `planOutcome.ts` déclare. `emitEditedToReaders` accepte déjà
  `PlanOutcome<EditedReaderPlan>` — aucune signature à changer.
- **`offlineSignedPayload` compose la base PUIS la signature**, avec
  `base: (key) => sealedVariant(payload, sealed, key)` et
  `basePerReader: sealed.size > 0`. L'ordre n'est pas indifférent : la base porte
  le scellement de citation, donc signer d'abord laisserait une adresse valide
  pointant sur ce qu'on vient de retirer.
- **UN seul crochet par lecteur.** `queueSigningFields(signed)` remplace le
  `resolvePayloadForReader` du scellement, au lieu de cohabiter avec lui — deux
  crochets s'excluraient au site d'appel, et le premier posé gagnerait. C'est la
  raison d'être du drapeau `basePerReader`, écrite dans son doc-comment.
- **`withhold` ferme les deux canaux** : `if (signed?.kind === 'withhold')
  return;`, à côté du `readership.kind === 'unknown'` qui gardait déjà la même
  décision pour l'autre inconnu.

## La preuve de ROUGE, et ce que le premier témoin a appris

Quatre témoins neufs (`broadcastMessageMutation.queuedSigned.test.ts`) ;
**trois rouges** sur le code d'avant, le quatrième vert des deux côtés — c'est le
témoin de non-régression du cas que les trois routes REST exercent aujourd'hui
(aucune pièce ⇒ charge générique, aucun crochet).

| témoin | ce qu'il attrape |
|---|---|
| la charge enfilée porte les adresses signées de SON destinataire | le `fileUrl` NU écrit 48 h dans Redis |
| le SCELLEMENT compose AVANT la signature, un seul crochet | deux crochets qui s'excluent ; une citation signée non scellée |
| le plan indisponible n'enfile RIEN | l'enfilage qui tournait après une émission sautée |
| sans pièce, charge générique inchangée | (non-régression : vert avant comme après) |

**Le troisième témoin a d'abord rendu VERT sur une prémisse fausse.** Il faisait
lever `conversationShareLink.findMany` — mais `withoutExpiredShareLinks` ne
l'interroge que si une ligne porte un `shareLinkId`, et les deux participants du
harnais ont `shareLinkId: null` : la requête n'avait jamais lieu, donc rien ne
tombait. Le discriminant retenu est la PROJECTION — `readerSignedTargets` est le
seul lecteur de `Participant` à ne demander que `id`, `userId`, `shareLinkId` :

```ts
Object.keys(select).sort().join(',') === 'id,shareLinkId,userId'
```

C'est ce qui fait tomber la lecture du PLAN **sans** faire tomber celle de
l'AUDIENCE. Sans lui, le témoin passerait par la branche `'unknown'` de
`messageReadership`, qui retient déjà l'enfilage — il serait vert pour une raison
qu'il ne nomme pas. `planReadFailure.test.ts` documente exactement ce piège sur
son dernier témoin, dans une « note d'honnêteté » ; ce lot a failli le rejouer.

> **Un témoin qui ne rougit pas accuse d'abord sa PRÉMISSE.** Ici elle portait
> sur ce qu'une lecture interroge, pas sur ce que le code fait — et la réponse
> était dans une garde conditionnelle qu'aucune lecture du site d'appel ne
> montre. Même famille que le cycle 214, où une mutation incomplète avait révélé
> un second site d'annonce.

## Gates

| gate | résultat |
|---|---|
| `jest src/socketio/__tests__/broadcastMessageMutation` | **56 verts / 0 rouge** |
| le même, production revertie | **3 rouges / 1 vert** (le non-régression) |
| `jest src/socketio` | **188 suites, 2 914 verts / 0 rouge** |
| `tsc --noEmit` (passerelle) | **0** |
