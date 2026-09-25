## Leçon 195 — un champ qu'on charge n'est pas un champ qu'on sert : le sérialiseur est une frontière, et elle est muette (2026-08-16, routine temps réel, cycle 43)

**La piste héritée était fausse, et c'est la vérification qui a payé.** Le cycle
42 affirmait que les deux émetteurs socket de `read-status:updated` ne
consultaient pas `showReadReceipts`. Les deux la consultent. La consigne qu'il
s'était donnée — « établir laquelle des deux avant d'écrire quoi que ce soit » —
a évité d'écrire un correctif pour un défaut inexistant. *Une piste laissée en
fin de cycle est une hypothèse, pas un constat : elle se relit dans le code
avant de servir de point de départ, même — surtout — quand c'est soi qui l'a
écrite.*

**Le sérialiseur retire en silence, donc « la donnée est chargée » ne prouve
jamais « la donnée est servie ».** `fast-json-stringify` ne sérialise que les
champs déclarés au schéma. Trois `select` ramenaient `statusEntries` ; aucun des
deux `messageSchema` ne le déclare ; le tableau était construit, parfois recopié,
puis jeté. Le coût, lui, était bien réel : une requête de relation par page,
jusqu'à `messages × participants` documents, sur le chemin de lecture le plus
chaud du produit — et deux des trois sites la payaient sans opt-in. *Entre le
`select` et le client il y a une frontière qui ne journalise rien ; tant qu'on ne
l'a pas traversée sur un vrai serveur, on ne sait pas ce qui arrive.*

**Une fuite hypothétique peut être un piège réel.** L'hypothèse de départ —
accusés nominatifs exposés sans le gate d'opt-out — était fausse *aujourd'hui*,
uniquement parce que le schéma retire le champ. Déclarer `statusEntries` pour
« réparer » l'absence publierait d'un coup identité, horodatage, durée de lecture
et appareil, sans gate. *Quand ce qui protège est un effet de bord et non une
règle, le correctif n'est pas seulement de supprimer la dépense : c'est d'écrire
la raison à l'endroit exact où quelqu'un voudra la rétablir.*

**Troisième cycle consécutif : un double qui décrit un autre programme.** Deux
témoins affirmaient la dépense comme un acquis (« adds statusEntries to select »,
« statusEntries field mapped ») — ils passaient parce que leur faux Fastify n'a
pas de sérialiseur. Après les cycles 41 et 42, le motif est établi. *Un double
allégé n'est pas un double neutre : chaque pièce qu'on lui retire est une
propriété du programme livré qu'il cesse de pouvoir constater. Pour un contrat de
sortie, la garde se monte sur un vrai serveur, ou elle ne garde rien.*

**Corollaire de garde.** La garde utile verrouille les deux moitiés séparément —
le champ n'est pas servi, ET il n'est pas chargé. La première est verte avant
comme après : c'est elle qui établit la prémisse. *Un témoin vert d'emblée n'est
pas un témoin inutile quand c'est lui qui porte la raison du correctif.*
