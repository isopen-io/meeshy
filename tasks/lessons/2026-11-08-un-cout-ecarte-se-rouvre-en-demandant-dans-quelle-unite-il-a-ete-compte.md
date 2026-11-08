## Un coût écarté se rouvre en demandant dans quelle UNITÉ il a été compté (cycle 143, #16706)

L'issue #16706 instruisait quatre pistes dans un tableau de coûts. Celle qui
résolvait vraiment le problème — un index inverse `messageId` → clés de file —
y était chiffrée : « une écriture Redis de plus par destinataire hors ligne,
**sur le chemin le plus chaud** ».

C'est exact, et c'est ce qui la rendait discutable : le chemin d'enfilage fait
déjà une passe par destinataire hors ligne, et doubler ses écritures sur la
route chaude d'un envoi de message n'est pas anodin.

Sauf que la phrase compte des **COMMANDES**. Ce qui coûte est
l'**ALLER-RETOUR**. L'enfilage passe déjà par un `EVAL` : l'index s'y écrit
comme deux `redis.call` de plus **dans un script déjà en vol**, pour zéro
latence réseau supplémentaire. C'est un `sadd` SÉPARÉ qui aurait doublé les
allers-retours — et c'est cette forme-là, jamais écrite, que le chiffrage
décrivait.

**Pourquoi l'erreur est facile.** Les deux formulations sont vraies de la même
implémentation naïve, et elles se ressemblent dans une phrase. « Une écriture de
plus » est la façon naturelle de décrire l'ajout ; « un aller-retour de plus »
exige d'avoir déjà décidé **où** l'écriture se place. Le chiffrage a donc été
fait avant le choix qu'il devait éclairer, et il a présélectionné la mauvaise
implémentation.

> **Avant d'écarter une piste sur son coût, demander dans quelle UNITÉ le coût a
> été compté, et si cette unité est bien celle qui se paie.** Commandes vs
> allers-retours, lignes vs requêtes, octets vs clés, appels vs réveils : dans
> chaque paire, un ordre de grandeur sépare les deux, et seule la seconde est
> facturée.

Corollaire : **un tableau de coûts hérité se remesure, comme un compte, un tri
ou un suivi.** Il a été écrit avec une implémentation en tête — souvent la plus
simple — et il périme dès qu'on en imagine une autre. Ce n'est pas une erreur de
son auteur : c'est ce qu'un tableau de coûts peut dire au moment où on le pose.

Ce qui a servi à trancher : un `redis-server` réel était disponible dans le
conteneur (`/usr/bin/redis-server`), ce qu'aucun cycle précédent n'avait relevé.
La sonde a prouvé la sémantique du script modifié — y compris une collision de
préfixe qui aurait arrêté le nettoyage de toutes les files, invisible à la
lecture. **Vérifier ce que l'environnement offre avant de décider qu'une classe
de preuve est hors de portée.**
