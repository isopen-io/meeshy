# Cycle 187 — le lot a été RETIRÉ : la réparation était au mauvais endroit

*2026-11-20, à la suite du cycle 186 (#19865, fusionné par `5c5983e759`).
Branche `claude/exciting-planck-dr9e11`, PR **#19958 fermée sans fusion**.
Instruisait **#19917**, que l'audit adversarial du cycle 186 avait relevé.*

---

## Ce que le lot faisait, et pourquoi il ne fusionne pas

Le dédoublonnage précoce de `MessagingService.handleMessage` rend la ligne
existante AVANT `handleAttachments` : les `attachmentIds` d'un rejeu, pourtant
admis par les deux transports, n'étaient liés par personne. Le lot les liait
depuis le bloc `earlyHit`.

**Le diagnostic est juste. Le LIEU était faux.** L'audit adversarial a rendu
BLOQUANT ; j'ai vérifié ses trois constats décisifs dans le code avant de
trancher, et les trois tiennent.

### 1. Un trou de contrôle d'accès, ouvert par ma main

`MessagingService.ts:217` — `where: { conversationId, clientMessageId }` :
**aucun `senderId`**. Et `clientMessageId` est servi à CHAQUE participant par
la liste REST (`messages-list-query.ts:255` et `:511`), alors que le chemin
socket le retire des pairs par doctrine (`stripClientMessageId`, #16689).

Bob lit le `clientMessageId` d'Alice, téléverse son fichier, poste avec ce
`clientMessageId` : **ma liaison l'attache au message d'Alice**, et
`associateAttachmentsToMessage(ids, hit.id, hit)` lui fait hériter des drapeaux
de protection du message d'Alice. La pièce apparaît sous la signature d'Alice.

> La lecture était sûre SANS filtre d'auteur — rendre à quelqu'un un message
> qu'il peut déjà lire ne révèle rien. L'écriture ne l'est pas. **Une condition
> suffisante pour LIRE ne l'est jamais pour ÉCRIRE, et c'est la même ligne de
> `where` qui porte les deux.**

### 2. Ma garde centrale était MORTE, et mon témoin ne pouvait pas tomber

`if ((hit.attachments?.length ?? 0) > 0) return null;` — la lecture de dédup
n'`include` que `sender`. **`attachments` n'est jamais chargé.** La garde ne
retenait donc rien, et un rejeu portant des ids DIFFÉRENTS aurait AJOUTÉ une
seconde copie au message qui portait déjà la sienne.

Mon harnais fabriquait `attachments` sur l'objet que `findFirst` rend — une
forme que la production ne produit pas. Mis à la forme réelle, le témoin du
« rejeu nominal » **tombe**. Et le `as never` du site d'appel étouffait le
`TS2741` qui l'aurait dit : `tsc` passe EXIT=0 **sans** ce cast.

> Dans le lot dont le journal préche contre les témoins qui ne peuvent pas
> tomber. La règle de méthode ne se transporte pas d'un cycle au suivant : elle
> se réapplique, sur SON harnais.

### 3. La liaison courait avant les gardes d'admission

Le dédoublonnage passe avant §3.6 (état du conteneur), §3.7 (droit d'écriture)
et §3.8 (`attachmentSendRefusal`) — et le commentaire de §3.6 justifie cet
ordre par le fait que cette branche **ne fait que LIRE**. J'y ai posé une
écriture. §3.8 existe mot pour mot pour ce geste : « `upload.ts` ne garde que
le TÉLÉVERSEMENT du fichier, jamais son admission au moment où il est RATTACHÉ
à un message » (#5151).

## Et le constat qui condamne l'APPROCHE, pas la rédaction

La liaison nominale entraîne trois gestes que le raccourci n'exécutait pas :

| geste | ce que son absence laisse |
|---|---|
| scellement au repos | le fichier en CLAIR sur disque en conversation `server` ; le balayage de rattrapage est ancré sur `message.createdAt`, donc un rejeu à plus de 48 h ne sera jamais rattrapé |
| `processAudioAttachments` | un vocal **jamais transcrit** — donc ni traduction, ni TTS, ni Prisme, pour toujours : cette fonction n'a qu'un appelant et aucun rattrapage |
| `deriveMessageTypeForAttachments` | la colonne reste `'text'` sur un message qui porte une image |

Plus la relecture sans `select`, qui servait la ligne BRUTE — `filePath`,
`encryptionIv`, `encryptionAuthTag`, `serverKeyId`… — ce que
`attachmentIncludes.ts` interdit nommément.

> **Le lot remplaçait un échec BRUYANT — la pièce manque, l'utilisateur
> renvoie — par un état à moitié réparé, SILENCIEUX et DÉFINITIF.** C'est un
> plus mauvais produit que le défaut qu'il corrigeait. Un correctif ne se juge
> pas à ce qu'il répare, mais à l'état qu'il laisse.

## Où la réparation doit aller

À la RACINE, **#19956** : laisser l'échec de liaison faire ÉCHOUER l'envoi et
libérer le `clientMessageId`, pour que la reprise reconstruise un message
COMPLET par le chemin nominal — avec son scellement, son audio, son type et ses
gardes. C'est exactement ce que la branche COPIE voisine fait déjà, et son
commentaire le dit depuis toujours.

Le cycle 186 avait lu ce commentaire et en avait tiré la bonne jumelle ; le
cycle 187 l'a lu et a quand même réparé ailleurs, parce que le symptôme se
voyait là. **Le lieu où un défaut se VOIT n'est pas le lieu où il se répare.**

## Ce que le cycle laisse

- **#19917** rouvert et redirigé vers #19956, avec les quatre états que la
  réparation doit traverser (droits, auteur, scellement/audio/type, ligne déjà
  pourvue) ;
- **#19956** — la cause racine, inchangée ;
- **#19957** — le verdict sur un message supprimé (décision produit), toujours
  valable : le dédoublonnage rend un message supprimé avec `success: true`,
  mesuré ;
- **#19959** — le `clientMessageId` d'autrui servi par la liste REST, que le
  chemin socket retire : préexistant, sans conséquence tant que rien ne l'écrit,
  et c'est précisément ce qui a rendu ce lot exploitable.

## Preuve de ce qui est dit ici

Les trois constats décisifs sont vérifiés par ma propre lecture du dépôt
(`MessagingService.ts:214-241` pour l'`include` et le `where`,
`messages-list-query.ts:255` et `:511` pour l'exposition), et les mutations de
l'audit sont reproductibles : harnais mis à la forme de production ⇒ le témoin
du rejeu nominal tombe ; `as never` retiré ⇒ `tsc` EXIT=0.

Le code du lot est RÉVERTÉ sur la branche ; son histoire reste lisible
(`7420969dbc`, puis son revert), pour que le prochain qui ouvre #19917 voie ce
qui a été essayé et pourquoi ça ne tenait pas.
