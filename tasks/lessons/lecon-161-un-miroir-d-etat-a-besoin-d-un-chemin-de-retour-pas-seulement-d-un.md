## Leçon 161 — Un miroir d'état a besoin d'un chemin de retour, pas seulement d'un chemin d'aller

Cycle 15 temps réel (`ConnectionService.state.isConnected`, web).

Un handler `offline` mettait le miroir de connexion à `false` sans toucher au socket — geste
délibéré et correct : la bannière doit réagir à la seconde où le réseau tombe, sans attendre que
Socket.IO s'en aperçoive. Le défaut n'est pas là. Il est dans ce qui manquait **en face** : rien ne
pouvait remettre le miroir à `true` quand le socket, lui, n'était jamais tombé.

**Un miroir pessimiste est un pari sur l'existence d'un événement de retour.** Ici le pari était
faux par construction : le seul événement capable de relever le drapeau (`connect`) n'est JAMAIS
émis sur un socket déjà connecté, et la fonction censée le provoquer (`connect()`) sortait en
silence sur exactement cette condition. Le chemin d'aller était instantané, le chemin de retour
n'existait pas.

Deux règles à en tirer :

1. **Quand on écrit une mise à jour optimiste ou pessimiste d'un état MIROIR, écrire le chemin de
   retour dans le même geste.** Pas « ça se réparera au prochain événement » — il faut nommer
   l'événement et vérifier qu'il peut se produire dans l'état où le miroir vient d'être mis. Ici la
   mise à `false` rendait précisément impossible l'événement censé la défaire.

2. **La réconciliation va au POINT DE PASSAGE, pas au point de déclenchement.** La réparation était
   tentante dans le handler `online` — c'est là que le symptôme se voit. Mais `connect()` est
   traversé par tous les appelants (handler `online`, orchestrateur, `ensureConnection`) : réparer
   au point de déclenchement aurait laissé les deux autres sur la même impasse, c'est-à-dire aurait
   reproduit la configuration « un contrôle correct répété en N endroits dont l'un finit par
   manquer » (leçons des cycles 13 et 14).

**Le signal de recherche** : un booléen d'état écrit à `false` dans un handler qui ne touche pas la
ressource qu'il décrit. Chercher ensuite, explicitement, la ligne qui le remet à `true` — et vérifier
qu'elle est atteignable depuis l'état écrit. Si la remise à `true` vit derrière une garde que la mise
à `false` vient de rendre infranchissable, le miroir est piégé.

**Ce qui rendait la panne invisible** : le socket continuait à livrer les messages ENTRANTS. La seule
chose cassée était ce qui LISAIT le miroir — ici `useAutoRetryFailedMessages`, dont `isReady` est
l'unique déclencheur, donc la file des messages en échec silencieusement gelée. Un état miroir faux
ne se manifeste pas là où il est faux, mais chez ses lecteurs : recenser les lecteurs fait partie du
diagnostic, pas de la rédaction.

---
