## Leçon — un angle mort DOCUMENTÉ reste un angle mort (2026-08-22, cycle 95)

Le cycle 95 devait donner un contrat de réponse à `GET /sync`. Il l'a fait, et
la mesure a trouvé trois défauts. Le plus large ne concernait pas `/sync`.

`messageAttachmentSchema.metadata` — un schéma PARTAGÉ, donc servi par toutes
les routes qui l'importent, la liste de messages comprise — était un objet NU :
`{ type: 'object', nullable: true }`. Le champ étant LISTÉ, fast-json-stringify
applique `additionalProperties: false` et le vide. **L'omettre l'aurait mieux
servi.** Sa jumelle, l'attachement inline de `messageSchema`, portait le même
défaut avec une description qui NOMMAIT `audioEffectsTimeline` pendant qu'elle
le supprimait. Côté web,
`message-formatting.tsx` lit `attachment.metadata?.audioEffectsTimeline` : la
timeline d'effets d'une note vocale n'a jamais atteint un client.

Ce que ce défaut a d'instructif n'est pas sa nature — le dépôt a un balayage
outillé et en cliquet pour exactement cette famille depuis le cycle 87 bis.
C'est qu'il vivait dans la limite ÉCRITE de cet outil, dans le CLAUDE.md du
service, dans la section même qui explique le défaut :

> Le balayage ne lit que `services/gateway/src/routes` : les schémas de
> `packages/shared`, dont un défaut se propage le plus loin, lui échappent.

Huit cycles ont lu cette phrase sans que rien n'en sorte.

> **Écrire une limite ne la garde pas ; seul un cliquet la garde.** Une limite
> documentée se lit comme une excuse recevable, pas comme du travail restant —
> et plus elle est bien écrite, mieux elle se lit ainsi. C'est le même
> mécanisme que le commentaire qui scellait la connexion 2FA en la décrivant
> (cycle 91 bis) : dire un défaut à voix haute peut le rendre permanent.

Corollaire, et c'est la mesure du lot :

> **Gouverner une route en révèle plus que ce qu'elle contient.** Le contrat
> d'une route est un instrument de mesure braqué sur tout ce qu'elle importe.
> Ce défaut-ci n'est apparu que parce qu'une charge utile de `/sync` est passée
> au vrai sérialiseur ; il vivait sur des routes qui, elles, marchaient.

### Corollaire de méthode — le double Prisma rend le `select` INOBSERVABLE

La mutation la plus utile du cycle est celle qui est restée VERTE. Retirer
`id: true` du `select` des appartenances n'a fait tomber aucun témoin : le
double rend sa ligne quel que soit le `select`, donc `id` y était présent même
une fois la requête amputée.

> **Un témoin de VALEUR ne peut jamais garder un `select`.** Entre les deux il y
> a un double qui ignore la projection. La garde d'un champ chargé assert sur la
> REQUÊTE (`findMany.mock.calls[0][0].select`), et c'est un témoin SÉPARÉ — le
> dépôt portait déjà l'idiome dans le fichier même (« DEMANDE ces champs à
> Prisma — une charge utile vide ne prouve rien »).

Et sur la forme des rangées de témoin, deux fois dans le même lot :

> **Une rangée de témoin doit rendre ce que la REQUÊTE rend, pas ce qui suffit à
> l'assertion.** Les rangées de la suite omettaient `attachments` (une relation
> sélectionnée revient en tableau VIDE, jamais `undefined`) parce que rien ne
> les lisait tant que la charge traversait non gouvernée. Et une traduction de
> pièce jointe INVENTÉE (`{ url, segments }`) a fait rendre 500 à la route :
> `messageAttachmentSchema` déclare `type`/`transcription`/`createdAt`
> **`required`**. Le schéma partagé faisait son travail ; c'est la fiction qui a
> cédé — en 500, pas en assertion, donc bien plus tard qu'il n'aurait fallu.
