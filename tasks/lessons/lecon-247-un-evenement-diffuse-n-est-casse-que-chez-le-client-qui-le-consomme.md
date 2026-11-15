## Leçon 247 — Un événement DIFFUSÉ n'est cassé que chez le client qui le consomme comme une DONNÉE (2026-08-22, cycle 101)

`message:edited` a trois producteurs ; celui du transport WebSocket servait un
littéral écrit à la main dont manquaient `senderId`, `messageType` et
`createdAt` — trois des sept champs que `SocketIOMessage` rend obligatoires.
Toute édition faite depuis le web était silencieusement jetée par chaque client
iOS de la conversation, depuis toujours.

> **Le même défaut de forme produit trois issues selon ce que le client FAIT de
> la charge utile.** iOS la décode et l'applique (`try c.decode` sans repli) :
> le message entier est rejeté. Android la décode puis la JETTE, ne lisant que
> `conversationId` pour relire la conversation : intact. Le web la FUSIONNE dans
> sa ligne en cache, qui fournit les clés manquantes : intact.

Trois corollaires, et le troisième est le plus cher :

1. **Le client qui ÉMET sur un transport est rarement celui qui casse dessus.**
   Le web émet `message:edit` et sa fusion le protège ; iOS édite par REST et
   n'est que destinataire de ce transport-ci. Le côté d'où vient le geste ne
   voit jamais rien.
2. **Un client qui traite l'événement en SIGNAL est insensible aux défauts de
   forme — donc incapable de les révéler.** Sa verdeur n'atteste rien sur le
   contrat. Ne jamais lire « deux clients sur trois vont bien » comme « la
   charge utile est bonne » : compter les clients qui la LISENT.
3. **Relever les trois décodeurs fait partie du diagnostic, pas du rapport.**
   La question n'est pas « ce champ manque-t-il ? » mais « qui le lit, et que
   fait-il quand il est absent ? » — la même que la leçon du cycle 96 sur une
   preuve transportée mais jamais vérifiée.

Et la cause de l'invisibilité était structurelle, pas humaine : ce handler était
le DERNIER rendu au `Socket` nu de socket.io, parce que son payload `message:new`
était mué à travers un cast `Record<string, unknown>`. Un tel sac de clés ne
satisfait aucun champ requis, donc typer le socket aurait fait échouer les cinq
émissions voisines — et, l'objet restant non typé, l'émission `message:edited`
deux cents lignes plus haut n'était pas vérifiée non plus.

> **Un seam de blanchiment ne protège pas seulement l'expression qui le porte :
> il désarme le contrat de TOUT le fichier**, y compris des émissions qui n'ont
> rien à voir avec lui. Le coût d'un `Record<string, unknown>` ne se mesure pas
> à son site, mais au périmètre qu'il empêche de typer.

Corollaire de correctif, et il vaut à chaque fois : **réparer un décodage ne
doit pas installer une divergence de SENS.** `Message.senderId` est un
`Participant.id`, quand les clients comparent ce champ à leur `User.id`. Servir
la colonne brute aurait fait passer le décodage tout en cassant la
reconnaissance « c'est mon message » — une panne muette, strictement pire que
celle qu'on répare. La règle de résolution existait déjà chez le producteur
voisin ; elle est extraite (`wireSenderId.ts`) plutôt que retapée.
