## Leçon 228 — quand un client s'avère IMMUNISÉ contre le défaut du cycle précédent, demander ce que l'immunité lui coûte (2026-08-17, routine messagerie, cycle 61)

**Le contexte.** Le cycle 60 a fermé une garde monotone manquante côté web, et a
posé la question de suite qui allait de soi : « le troisième client la
porte-t-il ? ». Réponse pour Android : **non, et il n'en a pas besoin** —
`ConversationListViewModel` n'applique aucun payload au cache de liste, ses
abonnements temps réel relisent le serveur. Aucun désordre de diffusion ne peut
faire reculer une ligne que le serveur réécrit en entier.

C'est une réponse correcte, et c'est là que le piège se referme : **elle invite
à classer le client « sain » et à passer au suivant.**

**Le défaut que la question suivante a rendu.** La propriété qui immunise
Android est exactement celle qui le ruine. Relire tout, c'est répondre à chaque
trame par un `GET /conversations` COMPLET plus une transaction Room
`upsertAll` + `deleteNotIn`. Or un message entrant ne vaut pas une trame mais
**TROIS** — `message:new`, `conversation:updated`,
`conversation:unread-updated`, toutes émises par le même
`MessageHandler.broadcastNewMessage`, pour le même message. Trois collecteurs
indépendants, aucune coordination : **×3 en réseau, base et recompositions, par
message reçu**, pour un résultat que la première relecture portait déjà en
entier.

**La forme à retenir.** Immunité et coût étaient la MÊME ligne de code. Il n'y
avait pas de bon côté à choisir. Un audit qui demande seulement « ce client
a-t-il le défaut X ? » rend un tableau de conformité et rate ce genre de chose
par construction : la question qui paie est « **par quel mécanisme y
échappe-t-il, et que ce mécanisme coûte-t-il ailleurs ?** ». Un client sain par
accident d'architecture est un client à examiner, pas à cocher.

**Le corollaire de correctif — fusionner n'est pas retarder.** Le réflexe devant
une rafale est le `debounce`, et il aurait divisé le trafic tout aussi bien —
en payant CHAQUE message d'un retard d'affichage, ce que les principes Instant
App interdisent. Un `Channel(CONFLATED)` + une pompe séquentielle donne la
fusion sans la latence : canal vide au repos ⇒ la trame isolée part
immédiatement ; rafale pendant une relecture en vol ⇒ **une** relecture de
queue. Les deux bornes se prouvent séparément, et le témoin « une trame isolée
ne subit AUCUN délai » est celui qui barre la route à la régression par
`debounce` — sans lui, la suite reste verte quand quelqu'un « simplifie ».

**Et la garde qui change de statut sans changer de code.** Trois collecteurs
portaient chacun leur `try/catch`. Une pompe unique en fait un point de
défaillance unique : la même garde, inchangée, protège désormais TOUTES les
relectures au lieu d'une famille. **Une refactorisation qui sérialise des
chemins jusque-là indépendants promeut leurs gardes existantes en gardes
critiques** — il faut alors leur donner un témoin, même si aucune ligne de la
garde n'a bougé.
### Un champ optionnel devient obligatoire le jour où un client le lit autoritairement

`bridge` est OPTIONNEL sur `conversation:unread-updated`. Les deux clients le
recopient inconditionnellement, `undefined`/`nil` compris — donc un émetteur qui
l'omet n'est pas muet : il ORDONNE UN EFFACEMENT. Le cycle qui a rendu le champ
autoritatif côté web n'a instruit qu'UN des quatre émetteurs serveur ; les trois
autres se sont mis à effacer sans qu'une seule de leurs lignes ne change, et sans
qu'un seul témoin ne rougisse — chaque émetteur a ses propres tests, et aucun ne
connaît la règle de l'autre.

Règle : **quand on rend un champ wire autoritatif côté client, on énumère TOUS les
émetteurs serveur du même événement dans le MÊME lot**, et on statue explicitement
sur chacun (attache / n'attache pas, et pourquoi). Un `grep` sur la constante
d'événement suffit à produire la liste ; ne pas la produire, c'est livrer un
défaut par émetteur non instruit.

Corollaire sur les témoins : un `toHaveBeenCalledWith` sur le payload ENTIER gèle
la forme courte comme un acquis. Quand la forme longue existe ailleurs pour le
même événement, ce témoin ne protège plus — il garantit la divergence.
