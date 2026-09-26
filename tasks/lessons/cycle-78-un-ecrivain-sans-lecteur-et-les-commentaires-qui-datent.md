## Cycle 78 — Un écrivain sans lecteur, et les commentaires qui datent

La leçon du 77-bis prise par l'autre bout. Là-bas : un état d'interface avec un
lecteur et aucun écrivain. Ici : un producteur soigneusement alimenté dont
**personne ne lit la sortie**.

Le web battait `heartbeat` toutes les 90 s pour tenir la présence dans Redis.
Cette charge avait migré vers le serveur (`handleEnginePong`, pong ENGINE toutes
les 25 s, tous clients) — les deux chemins appelant la MÊME méthode étranglée à
60 s. Le battement web ne pouvait donc rien produire de neuf, et il partait NU
(sans `clientTime`), donc sans même obtenir le RTT qui est la seule chose que le
canal applicatif offre en plus. L'ack repartait vers un client sans écouteur.

> **Symétrique de la leçon 77-bis : demander d'un producteur QUI LE LIT.** Un
> `Subject`/émetteur alimenté, typé, mocké dans les tests et abonné nulle part
> coûte le même travail qu'un vrai — sans jamais rien rendre. Le grep utile n'est
> pas « qui écrit ça ? » mais « qui s'y abonne ? », et il se termine souvent sur
> les seuls mocks.

Et la cause de fond, qui n'est pas dans le code :

> **Un commentaire qui nomme des FAITS devient faux en silence quand les faits
> bougent.** L'en-tête du hook web affirmait encore sa raison d'être (« maintenir
> la presence dans Redis ») des mois après que le serveur l'eut reprise ; le
> commentaire serveur, lui, énumérait ses émetteurs applicatifs (« web (90s) and
> iOS (30s) »). Aucun test ne les tenait. Quand un correctif déplace une
> responsabilité, chercher les phrases qui la décrivaient — elles ne sont pas de
> la décoration, ce sont elles qu'on lira au prochain audit pour décider si le
> code sert encore.

Enfin, sur la forme d'un inventaire :

> **Toute matrice ne devient pas une garde.** Le croisement « contrat × clients
> qui écoutent » a trois classes de sortie — légitime, écart produit, défaut —
> que seul un jugement sépare. Rendue verte à la hâte, elle serait devenue une
> table d'exemptions. Certaines vérifications valent comme PASSE à refaire, pas
> comme gate.

---
