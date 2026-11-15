## Une fuite de champ se qualifie chez ses LECTEURS, un par client (cycle 141)

**Date** : 2026-11-07 · **Cycle** : 141 · **Issues** : #16689, #16691, #16687

### Le constat

#16689 annonçait la conséquence d'une fuite de `clientMessageId` sur
`message:edited` en citant le web : « un pair peut prendre l'édition d'un autre
pour la confirmation de son propre envoi optimiste », preuve à l'appui
(`realtime-apply.ts:244-246`, qui pose l'invariant « la présence du cid PROUVE
que cet écho est le nôtre »).

**Mesuré : faux pour le web.** Le cid n'y est lu que sur le chemin
`message:new` ; le gestionnaire d'ÉDITION ne le lit pas. L'invariant était ARMÉ,
pas violé.

La conséquence VIVANTE était ailleurs, et l'issue ne la nommait pas : iOS route
`message:edited` vers `APIMessage`, et `APIMessageUpsert+Merge.swift:93` écrit
`next.servedClientMessageId = api.clientMessageId ?? next.servedClientMessageId`.
Le cid de l'auteur se GRAVAIT dans la ligne locale du pair, où il alimente le
verdict de couche appareil d'un hybride.

### La règle

> « Un pair pourrait se tromper » est une HYPOTHÈSE ; « ce décodeur-là l'écrit
> dans sa base » est une MESURE. Les deux justifient le même correctif et ne
> justifient pas le même récit.

Devant une fuite de champ, ne pas s'arrêter au premier client où l'on trouve un
lecteur plausible : **énumérer les lecteurs de ce champ sur les TROIS clients**,
et dire lequel l'AFFICHE, lequel le PERSISTE, et lequel l'ignore. Un invariant
client cité comme preuve se vérifie sur le CHEMIN concerné — un invariant vrai
de `message:new` ne dit rien de `message:edited`.

C'est la leçon 261 (« une énumération de sites porte deux affirmations ») et la
leçon du cycle 122 (« qui AFFICHE ce qu'il élit ? ») appliquées non au
correctif mais à son RÉCIT : annoncer une panne qu'on n'a pas mesurée coûte la
confiance dans les cycles où il y en a une.

### Corollaire — un témoin gelant a des JUMEAUX, et la suite ciblée ne les voit pas

Le lot #16691 a re-instruit le témoin qui gelait le gate `!senderId` dans
`emitUnreadCountsToRecipients.test.ts`. Un SECOND exemplaire du même gel vivait
dans `MessageHandler.core.test.ts` (« returns early when senderId is null »), et
**seule la suite COMPLÈTE l'a rendu** — les suites ciblées du lot, choisies par
le répertoire du module corrigé, ne l'atteignaient pas.

> Un correctif qui fait tomber un témoin gelant cherche ses jumeaux **par le nom
> du gate** (`grep senderId`), jamais par le répertoire du module. Et il passe
> la suite complète avant de se dire fini : le dépôt documente déjà « deux
> exemplaires du même témoin gelaient le symptôme ».

### Corollaire — une jumelle de TYPE se révèle au premier champ ajouté

`MeeshySocketIOManager.ts` déclarait son propre `SocketUser`, copie verbatim de
celui de `utils/socket-helpers.ts`. Ajouter un champ à l'un a fait tomber la
compilation sur l'autre : **c'est le compilateur qui a nommé la jumelle**, pas
une relecture.

> Deux déclarations identiques du même concept sont indistinguables d'une seule
> tant que personne n'en fait évoluer une — et celle qui comptait (celle qui
> type `connectedUsers`, donc celle que le gate lit) était la moins visible des
> deux. Devant un `type`/`interface` qu'on s'apprête à élargir :
> `grep -rn "interface <Nom>"` AVANT d'écrire le champ.

### Corollaire — retirer un gate n'est pas une opération locale

Le gate `!senderId` garantissait `senderId` non nul au code d'APRÈS, qui
filtrait `p.userId !== senderId`. Le retirer naïvement aurait fait satisfaire
`p.userId === senderId` à tout participant ANONYME (`userId: null`), excluant
exactement la population des liens de partage — la pastille retirée à ceux que
le correctif prétend servir.

> Avant de retirer un gate, relire ce que le code d'après faisait de la valeur
> que ce gate garantissait non nulle. Un correctif qui arme une régression
> silencieuse sur la population la plus exposée est pire que le défaut.
