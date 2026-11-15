## Leçon 165 — Quand une démolition est inconditionnelle, la reconstruction doit rendre compte

Cycle 17 temps réel (`MessageSocketManager`, `SocialSocketManager`, iOS).

`forceReconnect()` s'écrivait en deux lignes qui se lisent comme un tout : `suspendTransport()`
puis `connect()`. Démolir, rebâtir. Mais les deux gestes n'ont pas la même force : le premier
réussit **toujours**, le second peut sortir sans rien faire — trois `guard`/`return` précoces
(jeton absent, jeton expiré, URL nulle). Et comme `connect()` rendait `Void`, l'appelant ne pouvait
pas distinguer « rebâti » de « rien fait ».

**Ce qui rend l'écart mortel, ce n'est pas la démolition du socket, c'est ce qu'elle emporte
AVEC lui.** `suspendTransport()` met `manager = nil` — et le `manager` portait la boucle de retry
interne de Socket.IO (`reconnectAttempts(-1)`), c'est-à-dire le mécanisme qui, jusqu'à cette ligne,
garantissait qu'on finirait par revenir. Tant que ce filet existait, un `connect()` stérile n'était
qu'un délai. Une fois le filet détruit, le même `connect()` stérile est un **état terminal**.

**La règle** : quand un chemin détruit une ressource de reprise avant d'en installer une nouvelle,
l'installation doit rapporter son succès, et l'appelant doit posséder le cas d'échec. Un `Void` sur
une fonction de reconstruction est le point aveugle — il fait passer « je n'ai rien pu faire » pour
« c'est fait ».

**Le signal de recherche** : chercher les paires `teardown(); rebuild()` où `rebuild` contient des
`guard ... else { return }`. Puis demander : que possédait l'objet détruit, en plus de lui-même ?
Un timer, une boucle de retry, un observateur, une souscription ? C'est cela qu'on perd, et c'est
rarement ce que le nom de la fonction laisse croire.

**Corollaire — une suppression défensive doit dire à quelle condition elle est sûre.** Le garde
« ne pas reconnecter pendant un appel » protégeait un socket de signalisation **vivant**. Écrit
comme un `return` sec, il s'appliquait aussi quand ce socket était déjà tombé — c'est-à-dire
exactement au cas où l'appel avait le plus besoin qu'on le rebâtisse. Une garde qui préserve
quelque chose doit vérifier que ce quelque chose est encore là.

**Deuxième moitié — le backoff exponentiel mesure la santé du SERVEUR, jamais celle du lien.**
L'échelle grimpait une fois par retour de réseau et ne retombait que sur connexion réussie. Or
`offline → online` est une information **neuve et positive** : le lien vient de revenir. La traiter
comme une preuve à charge, c'est facturer à l'utilisateur la qualité de sa couverture — après
quelques tunnels, il émerge en réseau stable avec la reconnexion suivante repoussée d'une minute,
au moment précis où elle deviendrait possible. **Un backoff compte les tentatives infructueuses,
pas le temps passé hors ligne**, et tout signal positif le remet au plancher.

**Troisième point, sur la méthode — vérifier la bibliothèque AVANT d'écrire le filet de sécurité.**
La piste initiale de ce cycle était un chien de garde sur les `heartbeat:ack` manquants, pour
détecter un socket zombie (transport mort sans événement `disconnect`). Le fichier lui-même
documentait le danger. La source de socket.io-client-swift 16.1.1 dit autre chose :
`SocketEngine.checkPings()` réarme un contrôle toutes les `pingInterval + pingTimeout` et appelle
`closeOutEngine(reason: "Ping timeout")` — le cas était déjà couvert, et le correctif aurait été du
code mort sophistiqué. **Quand un correctif consiste à surveiller ce qu'une dépendance surveille
peut-être déjà, aller lire sa source est moins cher que de livrer le doublon.** Une dépendance
épinglée (`exact: "16.1.1"`) se lit en une requête ; c'est le prix d'une hypothèse non vérifiée.

---
