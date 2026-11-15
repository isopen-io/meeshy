## Leçon 163 — Une valeur passée à une couche qui la REJOUERA est une copie, pas une référence

Cycle 16 temps réel (`ConnectionService`, `auth` du socket, web).

`io(url, { auth: { token } })` se lit comme « connecte-toi avec ce jeton ». Ce que la bibliothèque
en fait est autre chose : elle **garde la charge et la rejoue à chaque tentative de reconnexion**,
pour toute la vie du socket. Le jeton n'était donc pas un paramètre d'appel, c'était une copie
gelée d'un état qui, lui, continuait de tourner — rafraîchissement silencieux sur 401, pré-contrôle
d'expiration, rotation de session anonyme. Le socket rejouait un jeton mort à chaque essai, et
notre propre boucle de backoff le rejouait après lui : verrouillage complet sur une session dont
les identifiants valides étaient en stockage depuis le début.

**La règle** : quand une configuration est remise à une couche qui la RÉUTILISERA sans nous
redemander, une valeur littérale est un instantané. Si la source de cette valeur peut changer avant
la prochaine réutilisation, il faut passer le moyen de la relire — un callback, un getter — et pas
son contenu du moment. La plupart des bibliothèques offrent les deux formes ; la forme littérale est
celle des exemples de documentation, donc celle qu'on copie, donc celle qui se retrouve en
production alors que le cas d'usage réel exigeait l'autre.

**Le signal de recherche** : chercher les options passées à une construction (`io(...)`,
`SocketManager(config:)`, un client HTTP avec en-têtes par défaut, un intercepteur monté une fois)
qui contiennent un jeton, une URL signée, un identifiant de session. Puis demander : cette valeur
peut-elle changer pendant que l'objet vit ? Si oui, l'objet est déjà scellé sur une version périmée.

**Le rustinage impératif est le fossile du bug.** Le code contenait déjà
`socket.auth = { token: newToken }` dans un handler — quelqu'un avait vu le symptôme et repoussé la
valeur à la main. Un tel geste ne couvre que le chemin où il est écrit ; ici celui où la passerelle
avait PU émettre `auth:token-expired`, donc où le socket était encore connecté, tandis que les
rotations REST n'y passaient jamais. **Quand on trouve une ligne qui repousse manuellement une
valeur dans un objet déjà construit, on a trouvé la trace d'un état gelé — et le correctif n'est pas
d'ajouter le même geste aux autres chemins, c'est de dégeler la source.** Corollaire à verrouiller
par un test : une fois la source dégelée, ce rustinage devient *nuisible* — réassigner la valeur
remplace le résolveur et restaure exactement la panne d'origine.

**Deuxième moitié, même famille que la leçon 161** : le rafraîchissement réussissait, et rien ne
prévenait la couche temps réel. Un démarrage à jeton expiré ne crée aucun socket ; les seuls
réveils restants étaient les actions SORTANTES de l'utilisateur (envoyer, rejoindre). **Un lecteur
passif ne déclenche rien** — et sur une messagerie, l'écran d'accueil est un écran de lecture pure.
Quand on se repose sur « une action de l'utilisateur finira par relancer ça », nommer l'action, puis
vérifier qu'elle existe sur l'écran où le défaut se produit.
