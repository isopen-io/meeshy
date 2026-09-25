## Leçon 451 — Un refus qui arrive AVANT la lecture de ce que le lecteur détient tranche à sa place

**Le fait (2026-09-02, revue croisée de `join`, #4522).** `/chat/:lien`
lisait le cookie de la place APRÈS l'aperçu du lien, parce que c'est l'aperçu
qui rend la clé canonique (`linkId`) dont le cookie porte le nom. Or l'aperçu
refuse 410 un lien inactif, échu ou PLEIN (`routes/anonymous.ts:602-613`),
et un lien plein l'est PAR son dernier admis — dont la place est active, et
que le battement (qui ne connaît pas `maxUses`) aurait servie. Le refus
court-circuitait donc la lecture du cookie : le dernier admis recevait son
201, son cookie, puis la modale du visiteur ; tout invité d'un lien fermé
pendant sa lecture était renvoyé à « anonyme ou compte ? » au rechargement.
L'état G du § 6.3, DOCUMENTÉ dans le docblock de la route, était inatteignable
pour deux de ses trois codes. Le témoin jest le certifiait pourtant vert :
il réglait l'aperçu à 200 et le battement à 410 `LINK_DEACTIVATED` — une
combinaison que la passerelle ne produit jamais, puisque les deux routes
lisent la même ligne (`isActive`, `expiresAt`).

> **Quand une réponse de REFUS ne porte pas la clé qui nommerait ce que le
> lecteur détient, l'ordre « demander d'abord, lire le cookie ensuite » fait
> du refus le juge de la place.** La question à poser à tout écran gouverné
> par « ce que le lecteur DÉTIENT » : à quel appel la route apprend-elle la
> clé de ce qu'il détient — et cet appel peut-il refuser AVANT de la rendre ?
> Si oui, il faut une porte qui reconnaisse ce qu'il présente sans juger
> l'objet (`GET /links/:identifier` : « ce jeton tient-il une place ici ? »),
> et le bouchon d'un tel écran se règle par l'ÉTAT partagé, jamais par
> endpoint — c'est la leçon 422 vue du client : un mock par route certifie
> des chemins que le serveur ne produit pas.

Trois voisines du même lot, de la même famille « la charge a un effet que la
provenance ne justifie pas » : un `GET` qui JOINT (état MEMBRE) répondait
aussi à un préchargement du navigateur ; un `POST` sans regard sur `Origin`
posait une place — et son cookie — dans le navigateur de qui n'avait rien
soumis ; un second `POST` du même formulaire prenait une seconde place parce
que le cookie de la première était lu APRÈS le champ `pseudo`. La question
qui attrape les trois : **avant d'agir, la requête a-t-elle dit d'où elle
vient (`Sec-Purpose`, `Sec-Fetch-Site`) et ce qu'elle tient déjà (le cookie)
— et la route les lit-elle AVANT de lire ce qu'elle demande ?** Sites :
`apps/web-v3/app/provenance.ts`, `app/(public)/chat/[lien]/route.ts` ›
`situeLInvite` / `rejonction`.
