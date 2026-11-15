## Leçon 243 — un outil trouve la forme qu'on lui a décrite ; l'autre moitié du défaut n'en a aucune (2026-08-22, routine messagerie, cycle 91)

Le cycle 86 a nommé la règle « un objet de réponse sans `properties` EFFACE »,
le cycle 87 l'a outillée, et le cliquet a bien fait son travail : 38 sites
trouvés, 10 restants à reprendre au cycle 91.

En les réparant, trois défauts sont apparus que l'outil ne pouvait PAS voir —
et l'un d'eux tenait la connexion à deux facteurs fermée en production.

> **La règle outillée décrivait la moitié RECONNAISSABLE du défaut.** Un objet
> nu se repère : il lui manque quelque chose. Un bloc `data` qui déclare
> proprement ses propriétés — mais celles d'une AUTRE charge utile que celle du
> handler — n'a aucune forme suspecte. Il vide tout aussi complètement, et
> aucun balayage cherchant l'absence de `properties` ne le distinguera jamais
> d'un schéma juste.

`POST /auth/login` déclarait `{user, token, sessionToken, session, expiresIn}`
et sa branche 2FA envoyait `{requires2FA, twoFactorToken, …}` : le client ne
recevait ni le drapeau ni le jeton, et aucun compte protégé par un second
facteur ne pouvait terminer sa connexion. `DELETE /…/messages/:id` déclarait
`message` en STRING et envoyait `{messageId, deleted, meta}` : `data: {}`.

Le geste, et c'est le seul qui marche :

> **Le discriminant est l'ÉMETTEUR, jamais le schéma seul.** On ne peut pas
> juger un contrat de réponse en le lisant : il faut lire ce que `sendSuccess`
> reçoit, ligne par ligne, et comparer les jeux de clés. C'est mécanisable —
> `response-payload-mismatch.ts` le fait — mais ça ne se déduit d'aucune forme.

Et la raison pour laquelle ces trois-là ont vécu si longtemps, qui est la
partie la plus désagréable :

> **Un témoin qui n'assert que `statusCode` couvre une route morte sans jamais
> rougir.** Le témoin 2FA existait, il passait, il s'appelait « returns 200
> when 2FA is required ». Il n'a jamais regardé la charge utile.

Pire que l'absence d'assertion — l'observation ÉRIGÉE en attendu :

> ```ts
> // 2FA case returns 200 (response schema strips requires2FA from serialized output)
> ```
>
> Quelqu'un a VU le retrait, l'a compris assez pour l'écrire exactement, et
> l'a inscrit comme une propriété du système au lieu d'une panne. **Un
> commentaire qui explique une perte de données la scelle** : il retire au
> lecteur suivant la seule chose qui l'aurait fait creuser — la surprise. La
> question à se poser devant toute phrase de cette forme (« le schéma retire
> X », « ce champ ne sort pas ») est : *et c'est bien ?*

Corollaire, déjà croisé au cycle 84 et confirmé ici sous sa forme la plus nette :

> **Réparer un schéma peut OUVRIR ce que la panne retenait.** La charge utile du
> conflit de numéro portait le mot de passe EN CLAIR ; il ne sortait pas, parce
> que le schéma le retirait avec tout le reste. Déclarer la branche « pour que
> le client reçoive enfin ses données » aurait publié le secret, sans qu'aucun
> témoin ne tombe. Le retrait se fait à la SOURCE — compter sur une omission de
> schéma pour retenir un secret, c'est un piège armé, pas une protection.
