## Leçon — une charge utile non gouvernée ne se trompe jamais (2026-08-22, cycle 94)

`FROZEN_INVENTORY` ne portait plus qu'une ligne, laissée en place par trois
cycles avec une raison écrite et juste : aligner ce schéma « est un lot en soi,
sans quoi la déclaration tronquerait ce qui passe aujourd'hui ».

Le lot fait, deux défauts sont apparus **dans le même geste** — et aucun des
deux n'était nouveau. `translations` sortait en CARTE Mongo là où les trois
clients décodent un TABLEAU ; `encryptionMode` était absent de `messageSchema`,
donc supprimé de chaque message de chaque page de la liste, pour des clients
E2EE qui recevaient le chiffré sans savoir sous quel régime déchiffrer.

Ils vivaient depuis longtemps derrière un 200 vert et des témoins verts. La
raison est structurelle, pas accidentelle :

> **Tant qu'une réponse n'est gouvernée par aucun schéma, aucune forme n'y est
> fausse — il n'y a pas de contrat à contredire.** Gouverner, c'est créer la
> possibilité même du désaccord. Les désaccords étaient là depuis le début ;
> c'est l'absence de contrat qui les rendait inobservables.

Corollaire de méthode, et c'est le seul qui protège :

> **Les clés servies se relèvent MÉCANIQUEMENT, puis se passent au vrai
> sérialiseur.** La réutilisation naïve du schéma partagé perdait ici CINQ
> choses. Aucune lecture attentive du schéma ne l'aurait dit — quatre cycles de
> suite (84, 89, 91, 94), la « bonne forme d'à côté » était fausse contre le
> producteur de la route qu'on réparait.

Et sur l'endroit où un tel défaut se manifeste :

> **Le silence d'un défaut ne mesure pas sa gravité, il mesure qui le regarde.**
> Le seul consommateur de cette route est une extension de notification iOS.
> Son décodeur échouait, supprimait le blob, et laissait une ligne de log dans
> un processus qui meurt en quelques secondes. Pour l'utilisateur : un écran
> qui met un peu plus longtemps à se remplir. Aucun signal ne remonte jamais
> d'un chemin pareil — il faut aller l'y chercher.

Enfin, ce qui a bien fonctionné et qu'il faut garder : **le piège armé par le
cycle 88 a tenu son rôle.** `message-detail-sender-presence.test.ts` portait un
témoin qui disait explicitement garder contre « une future *correction* du
schéma qui, elle, tronquerait pour de bon ». Il est resté vert — et c'est ce
vert-là qui prouve que `sender` et son `user` imbriqué ont survécu au lot. Un
témoin posé sur une non-fuite ACCIDENTELLE vaut exactement ce que le cycle 84
promettait qu'il vaudrait.
