## Un cliquet se mesure SITE PAR SITE, jamais sur l'arbre réparé — son vert est une assertion

**2026-11-08, cycle 147 (lot H), #17026, trouvé par l'audit adversarial.** J'ai
livré un cliquet censé garder une famille de neuf sites. Mesuré en annulant un
site à la fois, il en voyait **trois sur sept**. Il certifiait propres quatre des
sites que le lot venait de corriger, plus un huitième qu'il n'avait pas trouvé.

Ce qui m'a trompé est la mesure que j'avais faite, et elle n'était pas fausse —
elle était insuffisante :

| ce que j'ai mesuré | ce que ça prouve |
|---|---|
| l'inventaire est VIDE sur l'arbre réparé | rien sur la portée |
| il tombe quand j'annule **le site 6 ou 7** | qu'il voit **ces deux-là** |

J'avais même écrit, dans la revue de la PR : « retirer l'enrobage de n'importe
lequel des sept sites doit le faire tomber ». Je ne l'avais vérifié que sur deux
— ceux que j'avais sous la main au moment d'écrire la preuve, et par
construction ceux de la forme la plus simple.

> **La question n'est pas « le cliquet est-il vert sur l'arbre réparé ? » mais
> « tombe-t-il sur CHAQUE site, un à la fois ? »** La première est gratuite et
> ne dit rien ; la seconde coûte une boucle de mutations et est la seule qui
> mesure la portée. Un cliquet qui SURDÉCLARE sa portée coûte plus qu'un cliquet
> absent, parce qu'on cesse de chercher.

### Les trois causes, et la première est celle qu'un doc-comment ne peut pas sauver

1. **La forme DOMINANTE du dépôt était invisible à l'outil.** Le balayage ne
   cherchait que `.emit(` TEXTUEL ; or l'émission passe presque toujours par un
   helper (`emitServerEvent`, `emitMessageNew`, `emitEditedToReaders`,
   `emitToConversationParticipants`) qui n'en porte aucun au site d'appel. Mon
   doc-comment déclarait bien une limite — et elle ne parlait que de
   l'ENFILAGE. **La limite la plus coûteuse n'était pas écrite**, et déclarer
   l'autre donnait l'impression que la question avait été instruite.
2. **La fenêtre d'inspection s'arrêtait à la mauvaise accolade.** `unitStart`
   remontait à la première accolade ouvrante, pas à une frontière de FONCTION :
   un enfilage placé dans un `if (…) { … }` voyait sa fenêtre commencer à
   l'accolade du `if`, donc l'émission située au-dessus du `if` sortait du
   périmètre. L'erreur était systématique dans un sens — des manques, jamais de
   faux positifs — donc invisible à toute vérification par échantillon.
3. **L'inventaire des noms affirmait faux.** `ENQUEUE_CALLS` portait quatre noms
   sous le commentaire « les quatre du dépôt au 2026-11-08 ». Il y en a onze,
   relevés mécaniquement en une commande. C'est la leçon 261 appliquée à mon
   propre cliquet, **dans le cycle qui publiait cette leçon**.

### Corollaire : un cliquet doit reconnaître la forme de sa propre RÉPARATION

Mesuré deux fois dans le même lot. Après avoir corrigé deux sites, le balayage
les rendait **encore** — l'émission vivait désormais dans une fermeture passée à
l'enrobage, qui n'est pas un `try` textuel. Un cliquet qui ignore la forme du
correctif **désigne le correctif comme le défaut**, et enseigne l'inverse de sa
règle. Après l'avoir écrit, le relancer sur l'arbre réparé *et* sur chaque arbre
muté.

### Corollaire : un témoin de couverture doit interroger le MÊME code

Mon témoin « le balayage BALAIE » assertait `>= 10` sur une liste obtenue par une
AUTRE regex, un AUTRE prédicat de fichier, sans dépouiller les commentaires — il
comptait sept fichiers où le nom n'apparaît que dans un commentaire. Il ne
pouvait donc pas tomber le jour où le balayage cesse d'atteindre quoi que ce
soit : **exactement le piège dont son propre intitulé se prévalait.** La
réparation est une fonction exportée par le balayage lui-même, qui rend ce qu'il
a réellement inspecté.

### Et la jumelle que je n'ai pas cherchée

Le helper d'enrobage que j'ai écrit existait déjà — `safeBroadcast`
(`socketio/serverEmit.ts`), même corps, six appelants, né d'un incident de
production de 2026-08-25. Les deux raisons (protéger la RÉPONSE de l'appelant /
protéger ce qui SUIT dans l'unité) n'ont jamais justifié deux helpers.

> « Cette entité a-t-elle une JUMELLE ? » se pose **au moment où l'on écrit**. Je
> l'ai posée sur les sites que je corrigeais, et pas sur le helper que je
> créais — alors que c'est le helper, pas les sites, qu'un cliquet doit
> reconnaître. Deux noms d'enrobage, et il en aurait manqué un.

Détail : `tasks/realtime-sync-audit-2026-11-08-cycle147.md` § « Sixième tour ».
