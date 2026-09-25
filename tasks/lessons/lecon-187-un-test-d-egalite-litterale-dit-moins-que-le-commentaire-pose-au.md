## Leçon 187 — un test d'égalité littérale dit moins que le commentaire posé au-dessus de lui (2026-08-15, routine temps réel, cycle 36)

**Le défaut.** L'accusé de remise du drain filtrait
`(entry.eventType ?? 'new') === 'new'`, sous un commentaire qui énonçait la BONNE
règle — « seuls les VRAIS nouveaux messages » — et une justification qui ne
nommait que `edited`/`deleted`, les deux seules familles existant le jour où la
ligne a été écrite. `link-message` est arrivée plus tard. C'est une CRÉATION,
rejouée sous `message:new` autant que sous `link:message:new` ; l'égalité
littérale la lisait comme une mutation, et le message d'un invité de lien
n'accusait jamais réception au rejeu.

**Pourquoi c'était invisible.** Le commentaire et le code ne disaient pas la même
chose, mais rien ne les confrontait : un commentaire décrit une INTENTION, une
égalité teste une VALEUR, et l'écart entre les deux ne grandit qu'au moment où
quelqu'un ajoute une valeur — c'est-à-dire loin du commentaire, dans un autre
fichier, pour une autre raison. La suite était verte parce qu'elle testait les
familles nommées dans la justification, jamais celle qui n'existait pas encore.

**La règle.** *Quand un filtre trie une UNION, il doit énumérer, pas comparer.*
Une égalité littérale (`=== 'new'`) répond `false` par défaut à tout ce qu'elle ne
connaît pas : la famille suivante hérite du silence, et le silence a l'air d'une
décision. Un prédicat nommé, vivant en face du vocabulaire qu'il interroge, force
la question à être posée à chaque ajout. Le corollaire porte sur le TEST : la
seule garde qui tienne est une table EXHAUSTIVE sur l'union
(`Record<NonNullable<T['eventType']>, boolean>`), qui ne compile pas tant que la
nouvelle famille n'a pas sa réponse. Un compte d'entrées ne garde rien — il se met
à jour tout seul sous les doigts de celui qui ajoute la famille.

**Le signal qu'on aurait pu lire plus tôt, et qui vaut plus que le défaut.** La
justification du champ, dans le type, affirmait « no delivery receipt — the
share-link send path creates no read-status rows ». **Elle était fausse au commit
qui l'écrivait** : le même commit branchait `autoDeliverToOnlineRecipients` sur ce
même chemin, dont le cœur est `markMessagesAsReceived`. Une justification écrite
dans le même souffle que le code qui la contredit ne se relit jamais — elle a
l'air fraîche. *L'âge d'une note ne dit rien de sa véracité ; seule la relecture
du code cité le dit* (leçon 2 du run #2 IOS_DETTE, ré-attestée ici sur une note
vieille de zéro jour). Et le contre-indice était à portée : le fan-out du même
accusé porte un correctif dédié pour adresser les pairs SANS COMPTE « parce que
c'est peut-être l'AUTEUR qui attend son tic ». *Un effort fait pour servir un
acteur, à un cran donné, est la preuve qu'il doit être servi aux crans
au-dessus* — celui-ci était annulé par un filtre que l'entrée n'atteignait jamais.

**Le discriminant qui interdit la sur-correction.** Élargir aux arrivées ne doit
rien élargir d'autre : les huit familles de mutation restent muettes, parce que
leur accuser réception affirmerait une remise qui n'a pas eu lieu — et pour
`deleted`, celle d'un message qui n'existe plus. Le témoin qui l'exige s'écrit ;
il ne se déduit pas du prédicat.

Parente des leçons 173 (une audience ajoutée doit hériter des bornes de sa
voisine) et 181 (« qui l'appelle ? »), vue depuis l'autre bout : ici la famille
nouvelle n'a pas hérité des TRAITEMENTS EN AVAL de la famille dont elle est le
jumeau.
