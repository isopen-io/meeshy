## Une règle écrite sur ce qui SUIT une garantie ne dit rien de ce qui la PRÉCÈDE

**2026-11-08, cycle 147 (lot H), #17026.** Sept unités du gateway plaçaient une
émission vivante — `io.to(room).emit(...)` — en amont d'une mise en file hors
ligne, dans le même `try`, sous un `catch` de fin de méthode. Une diffusion
tombée annulait donc le rejeu de TOUS les absents, sur un message, une édition
ou une suppression DÉJÀ persistés et déjà acquittés.

Ce qui rend le constat cher, c'est que **la règle était écrite, deux fois, et aux
deux meilleurs endroits**. Le § « Sa PLACE fait partie de la garantie » de
`MessageHandler.broadcastNewMessage` et son jumeau de `postMessageSyncFanOut`
expliquent tous deux, sur dix lignes chacun, que l'enfilage a été REMONTÉ avant
les deux synchros cosmétiques précisément pour qu'un `emit` qui lève ne
l'emporte pas. Les deux citent `emitWithSeq` comme preuve que `emit` lève pour de
bon. Et les deux nomment ce qui vient **après** l'enfilage.

Aucun des deux n'a tiré la conséquence sur ce qui vient **avant** — alors que
c'est la même phrase, le même `try`, le même `catch`, et que l'émission vivante
est à trois lignes au-dessus.

### Pourquoi l'angle mort est mécanique, et pas une inattention

Le cycle 116 a formulé la règle comme un ORDRE : *charger la liste → enfiler
(durable) → diffuser la cosmétique*. Un ordre se vérifie en regardant ce qui
est **plus bas** que l'étape qu'on protège — c'est littéralement ce que le mot
veut dire. L'émission vivante, elle, est plus HAUT, et elle n'est pas
« cosmétique » : c'est la remise aux pairs en ligne, le canal principal. Elle ne
tombait donc sous aucun des deux mots par lesquels la règle se cherche.

> Devant une garantie durable, la question n'est pas « qu'est-ce qui vient après
> elle, et a-t-il le droit d'échouer ? » mais **« de quoi son EXÉCUTION dépend-elle,
> dans les deux sens ? »** — la portée d'un `try` grandit vers le haut aussi.

### Ce que la correction a mesuré, et dans quel ordre

| source | sites trouvés |
|---|---|
| l'issue #17026 (deux auditeurs, deux périmètres disjoints) | 4 |
| la relecture de ce que l'import partagé touchait | 1 (le transport socket de l'édition) |
| le CLIQUET, écrit en dernier | **2** (le résumé d'appel REST/ZMQ, la suppression socket) |

Les deux derniers sont le point. Ils vivaient dans des fichiers que l'issue
NOMMAIT, à quelques dizaines de lignes de sites qu'elle énumérait, et ni
l'issue ni ma relecture ne les a vus. **Un inventaire écrit à la main mesure ce
qu'on savait chercher ; seul un balayage mesure la propriété.** C'est la leçon
261 (« une énumération porte deux affirmations, et la seconde ne se vérifie
presque jamais ») avec son chiffre : 4 annoncés, 7 réels.

### Et le cliquet doit reconnaître sa propre RÉPARATION

Première version du balayage : 4 constats, dont 2 faux positifs — il matchait la
DÉCLARATION `private async _enqueueOfflineEventForParticipants(params: {` comme
un appel, et l'unité calculée depuis elle enjambait la méthode précédente.
Seconde version : 2 constats, tous deux réels, corrigés. Troisième lecture,
après correction : **les 2 constats étaient toujours là** — parce que l'émission
vivait désormais dans une fermeture passée à `emitLiveBestEffort`, qui n'est pas
un `try` textuel.

> Un cliquet qui ne connaît pas la forme du correctif **désigne le correctif
> comme le défaut**, et enseigne l'inverse de sa règle. Après avoir écrit le
> balayage, le relancer sur l'arbre RÉPARÉ, pas seulement sur l'arbre fautif :
> le vert est une assertion autant que le rouge.

### Un témoin qui décrit EXACTEMENT le défaut est vert, et il faut l'inverser

`MeeshySocketIOManager.test.ts` portait « increments stats.errors when io.to.emit
throws » sur ce chemin de traduction. Le témoin était juste, précis, et
attestait le défaut : atteindre le `catch` de fin de méthode EST la perte. Il a
été **inversé avec sa raison écrite** (une émission tombée ne remonte plus), et
la couverture du `catch` extérieur reprise sur un chemin qui y mène vraiment
(la normalisation de l'id de conversation). Ne pas le supprimer, ne pas le
sauter : un témoin de coverage qui gêne nomme souvent le contrat qu'on vient de
changer.

### Enfin : ne pas se créditer d'une perte qu'on n'a pas réparée

Le guard d'audience de `deliverTextTranslation` (`'unknown'` sur un plancher
irrésolvable) ne sauve AUCUN enfilage : sur `'unknown'` on retient les deux
canaux à dessein, et c'est déjà ce que la panne produisait par le `catch`. Ce
qu'il change est le DIAGNOSTIC — une décision nommée au lieu d'une exception
anonyme, et pas de `stats.errors++`. Le témoin pré-existant (« une lecture des
participants qui tombe n'émet RIEN ») était vert des deux côtés : il ne pouvait
pas distinguer « retenu à dessein » de « la méthode a explosé ». Le commentaire
de site le dit maintenant en autant de mots, parce que la première version que
j'avais écrite se lisait comme un correctif de durabilité, et ne l'était pas.

Détail : `services/gateway/src/__tests__/live-emission-before-enqueue-sweep.ts`,
et `safeBroadcast` dans `services/gateway/src/socketio/serverEmit.ts` — l'enrobage
est celui qui existait DÉJÀ. Le lot avait d'abord écrit un second helper
(`emitLiveBestEffort`) sans voir celui-ci ; il a été supprimé, et cette ligne
pointait encore son chemin. Un document qui dit vrai sur le principe et faux sur
le chemin est plus coûteux qu'un document absent (#4455).
