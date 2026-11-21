## La jumelle a-t-elle un DÉCLENCHEUR que je n'ai pas ?

**Date** : 2026-11-21. **Lot** : #20224 (cycle 204 de la routine temps réel).
**Famille** : « cette entité a-t-elle une JUMELLE ? » (cycle 85) et « on reprend
une jumelle en cherchant la réponse à SA PROPRE question » (cycle 128).

**Le constat**

Les deux files d'envoi de `apps/web` ne se vidaient que sur trois déclencheurs :
lancement, `window 'online'`, changement de compte. `online` suit
`navigator.onLine`, donc le réseau de l'APPAREIL — et quand c'est la PASSERELLE
qui redémarre, le réseau de l'appareil ne bouge pas : `navigator.onLine` reste
`true` du début à la fin, et aucun `online` ne se lève jamais. Un message
composé pendant cette fenêtre restait « Réessayer » jusqu'à un geste de
l'utilisateur, pendant que le fil recevait les messages des autres normalement.

iOS porte ce déclencheur, **avec sa raison écrite dans le code** :

> « OutboxRetryScheduler covers the network-reconnect path (NWPathMonitor) but a
> socket reconnect without a NW path change (e.g. server restart) would leave
> queued outbox records stranded until the next foreground. »

Et le signal n'était même pas à choisir : `AUTHENTICATED` est déjà celui que la
file des gestes de rangée emploie, dont le doc-comment dit « rejeu au retour du
réseau, à chaque (ré)authentification du temps réel ». Le cycle de vie était
choisi par le dépôt ; une seule file l'ignorait.

**La règle**

Un DÉCLENCHEUR manquant n'apparaît dans aucune comparaison de code, par
construction : il n'y a rien à comparer. Deux implémentations jumelles peuvent
avoir la même structure, les mêmes types, les mêmes témoins verts, et différer
sur ce qui les RÉVEILLE — et c'est invisible à toute lecture qui part du code
présent.

La question du cycle 85 se complète donc d'une forme qui ne se répond pas en
lisant les fonctions : **énumérer ce qui APPELLE chaque exemplaire, et comparer
les listes.** Pour une file, un cache, un planificateur, un rejeu, c'est la
liste qui décide s'il sert à quelque chose.

**Le corollaire**

Quand la jumelle porte la RAISON en commentaire, le coût de ne pas l'avoir lue
se mesure en fonctionnalité absente, pas en divergence de style. Un commentaire
qui explique pourquoi un déclencheur existe est la documentation du défaut qu'il
ferme — et donc la description exacte du défaut que l'autre exemplaire a encore.
