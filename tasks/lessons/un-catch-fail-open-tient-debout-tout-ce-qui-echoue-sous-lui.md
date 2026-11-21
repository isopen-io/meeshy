## Un `catch` fail-open tient debout tout ce qui échoue sous lui — y compris des témoins (cycle 188, #19956)

`MessageProcessor.handleAttachments` liait les pièces pré-téléversées sous un
`try { … } catch (error) { logger.error(…) }`. La ligne `Message` étant créée
AVANT, un échec de liaison rendait l'envoi « réussi » sur une bulle VIDE — que
le rejeu au même `clientMessageId` confirmait ensuite en dédup, le
dédoublonnage retournant avant la liaison. L'état était définitif.

Retirer ce `catch` n'a pas seulement corrigé l'envoi : **il a révélé tout ce
que le `catch` tenait debout.**

> **Retirer une absorption large est une MESURE avant d'être un correctif.**
> Chaque chose qui échoue sous un `catch` fail-open se met à parler le jour où
> on le retire, et on ne sait pas à l'avance combien elles sont. Avant d'écrire
> « ce `catch` ne cache rien », le retirer et compter.

Deux choses ont parlé, et aucune des deux n'était cherchée :

- **Deux doubles Prisma n'avaient JAMAIS déclaré `messageAttachment.updateMany`**
  (`MessagingService.attachmentRights.test.ts`, `.guestAttachmentKinds.test.ts`).
  Ces suites font tourner le VRAI `AttachmentService` : la liaison y levait
  `TypeError` à CHAQUE envoi, et le `catch` rendait l'envoi réussi par-dessus.
  Trente-six témoins verts sur des envois dont la liaison échouait. Le dépôt
  connaissait « un double qui rend `[]` rend tout témoin de contenu
  trivialement vert » et « un double ment aussi par ce qu'il ACCEPTE » ; voici
  la troisième forme — **un double ment par ce qu'il n'A PAS, quand une
  absorption se charge de l'excuser.** Le double n'est pas le coupable : il est
  incomplet, ce qui arrive. C'est l'absorption qui le rend indétectable.

- **Un témoin attestait le défaut**, nommé « swallows
  associateAttachmentsToMessage errors (handleAttachments catch) », et son
  commentaire disait pourquoi : il avait été posé pour couvrir la LIGNE du
  `catch`. **Un témoin écrit pour couvrir une BRANCHE atteste ce que la branche
  fait, jamais ce qu'elle devrait faire** — il ne peut pas tomber sur le défaut,
  il EST le défaut transcrit en assertion et gelé par la couverture. Devant tout
  intitulé qui commence par « swallows », « ignores », « tolerates » ou
  « gracefully », poser la question du cycle 91 bis : *et c'est bien ?*

### Deux gestes sous le même `catch` partagent son verdict, pas leur réversibilité

Le scellement au repos vivait sous le même `try` que le départ de l'audio. Son
échec est rattrapable — `sealMessageAttachments.ts` le déclare, la migration
est idempotente — mais il sautait `processAudioAttachments`, qui n'a **qu'un
appelant et aucun rattrapage** : un vocal restait à jamais non transcrit, donc
sans traduction, sans TTS et sans Prisme.

> **Avant d'absorber une erreur, demander ce qui vit APRÈS elle dans le bloc, et
> si ce quelque chose a, lui, un rattrapage.** Un échec réparable qui emporte un
> échec définitif coûte plus cher que ce qu'il économise. C'est la forme « une
> étiquette de `catch` ne qualifie que ce que son auteur avait en tête »
> (cycle 116), vue depuis la PORTÉE plutôt que depuis l'étiquette.

### Reprendre une jumelle, c'est reprendre sa QUESTION, pas sa réponse

La branche COPIE, vingt lignes plus haut, tranchait déjà l'inverse et avait
écrit sa raison en commentaire — « supprimer la ligne avant de propager
l'erreur fait échouer l'envoi ET libère le `clientMessageId` ». Copier ce corps
sur la branche voisine aurait été FAUX.

`associateAttachmentsToMessage` ne relie qu'un `messageId` nul ou absent
(`unsetOrNull`) et écrit **une pièce par requête** : un échec au milieu du lot
laisse les premières LIÉES, donc inéligibles au rejeu. Supprimer sans les
LIBÉRER aurait fait reconstruire un message AMPUTÉ, en silence — le reproche
exact fait au lot retiré du cycle 187. La jumelle n'a pas ce geste parce
qu'elle n'a rien à rendre : ses lignes naissent avec le message.

> Le corollaire « on reprend une jumelle en entier » (cycle 85) ne dit pas de
> copier son corps. **Ce qui se transporte d'une jumelle est la question qu'elle
> a résolue ; la réponse se ré-instruit contre ce que le site présent a de
> différent.**
