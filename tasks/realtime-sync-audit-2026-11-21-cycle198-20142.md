## Cycle 198 — l'empreinte du déposant est UNE valeur, et un invité peut enfin supprimer ce qu'il a transféré (#20142)

**Date** : 2026-11-21. **Base** : `dev` à `8090117283`. **Issue** : #20142.
**Origine** : une réserve de l'audit adversarial de #20113, non traitée par ce lot.

### Le défaut

`copiedAttachmentFields` posait **`isAnonymous: false`** sans condition et sans
un mot d'explication, pour les deux chemins de copie. La branche anonyme de
`DELETE /attachments/:id` exige les DEUX champs :

```ts
hasPermission = attachment.uploadedBy === userId && attachment.isAnonymous;
```

Pour un invité de lien partagé qui transfère un message portant une pièce :
`uploadedBy` appariait (son `Participant.id` EST son identité
d'authentification), `isAnonymous` refusait. **403 sur une pièce qu'il venait de
créer** — et le web OFFRE le bouton, qui ne regarde que `uploadedBy`. Une
affordance qui échoue, donc pire qu'une affordance absente.

### Pourquoi `false` était faux, et pas seulement incomplet

`isAnonymous` dit **qui a déposé la ligne**, pas d'où venaient ses octets : les
quatre écrivains de téléversement le posent depuis le contexte
d'authentification de l'appelant, à côté de `uploadedBy`. Écrire `false` pour
une copie revient à affirmer que tout transfert est fait par un inscrit — et le
dire était impossible depuis `copiedAttachmentFields`, qui **ne connaît pas le
copieur**.

### La forme : une EMPREINTE, pas deux champs

`uploadedBy` et `isAnonymous` répondent à la MÊME question — *qui a fait cette
ligne ?* — donc ils voyagent ensemble. `uploaderStampOf` /
`resolveUploaderStamp` rendent les deux, les deux écrivains de copie les
RÉPANDENT, et il n'y a plus d'endroit où l'un se pose sans l'autre. #20113 avait
unifié le premier ; laisser le second derrière aurait recréé la divergence
qu'on venait de fermer, un champ plus loin.

**Le repli n'invente jamais d'anonymat** : participant illisible ou absent ⇒
`{ uploadedBy: participantId, isAnonymous: false }`, exactement l'ancien
comportement. Affirmer l'anonymat d'une ligne dont on n'a pas LU le déposant
ouvrirait la branche anonyme du `DELETE` à quiconque porte cet identifiant — un
repli ne doit pas être plus permissif que la vérité.

`copiedAttachmentFields` garde `isAnonymous: false` comme **défaut recouvert**,
et le dit : `schema.prisma` déclare `@default(false)`, donc retirer le champ
sans le faire fournir par l'appelant rejouerait le bug en silence.

### La paire identité-seule est RETIRÉE

`uploaderIdentityOf` / `resolveUploaderIdentity`, créées la veille par #20113,
n'avaient plus d'écrivain de production dès que l'empreinte les remplaçait. Un
contrat déclaré sans écrivain est exactement ce que #20102 reproche à
`maxViewOnceCount` : elles partent avec leurs témoins, le même jour.

### Ce que la porte NE fait PAS, et c'est écrit

Une copie écrite avant ce lot porte `isAnonymous: false` et reste donc
indéléguable par son invité. **La porte ne s'élargit pas pour elle** :
`isAnonymous` est le second facteur qui dit que la ligne appartient à une
identité anonyme, et une session d'invité de lien partagé est éphémère — ces
lignes appartiennent à des sessions qui n'existent plus. Élargir une porte
d'accès pour rattraper des lignes sans propriétaire vivant serait payer cher une
faveur à personne. Un témoin fixe ce refus.

### Le ROUGE, prouvé par mutation

| mutation | témoins rouges |
|---|---|
| la copie (diffusion) ne répand que `uploadedBy` | **1** — « marque la copie d'un INVITÉ comme anonyme » |
| le transfert ne répand que `uploadedBy` | **2** — le témoin de l'invité **et** le cliquet, qui exige l'ÉPANDAGE de l'empreinte |

Trois témoins de la PORTE, indépendants des écrivains : l'invité efface sa
copie bien estampillée, la forme héritée est refusée, la pièce d'un AUTRE
invité est refusée.

### Le cliquet, adapté à une limite qu'il doit déclarer

L'épandage rend le nom du champ INVISIBLE à un balayage textuel : les deux
écrivains de copie quittent donc l'inventaire, et c'est le témoin « posent
l'empreinte du site unique » (import **et** épandage) qui les garde. En
échange, le SITE UNIQUE entre dans l'inventaire — un gain : la décision
d'espace de clés des copies se lit désormais à UN endroit, nommé. La limite est
la troisième que ce balayage déclare, après le nom calculé et la valeur hissée
dans une locale.
