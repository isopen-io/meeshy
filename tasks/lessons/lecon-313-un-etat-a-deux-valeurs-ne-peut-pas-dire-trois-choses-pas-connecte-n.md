## Leçon 313 — un état à DEUX valeurs ne peut pas dire trois choses : « pas connecté » n'est pas « décroché » (2026-08-28, cycle 134)

Le cycle 133 a réparé le TRAJET de l'annonce de préférence ; le cycle 134 a posé
la question que la leçon 310 laissait ouverte sur le web — **« que se passe-t-il
pour celui qui n'a rien reçu ? »** — et a trouvé la réponse attendue : les trois
routes exigent toutes que l'onglet soit PRÉSENT pour entendre, et rien ne rejoue
l'annonce manquée.

Le déclencheur PÉRENNE qui manque est la connexion. C'est en l'écrivant que le
piège apparaît.

> **Un diagnostic booléen `isConnected` porte TROIS situations et n'en distingue
> que deux** : « je n'ai jamais été connecté » (on ouvre la connexion), « j'étais
> connecté et j'ai décroché », « je suis connecté ». Mesuré :
> `ConnectionService.connect()` émet `isConnected: false` sur le chemin même qui
> OUVRE la connexion, et `connect_error` en émet un autre. **Un démarrage à froid
> voit donc au moins un `false` avant son premier `true`.**

Lire ce `false` comme une coupure fait payer à CHAQUE chargement de page une
relecture pour zéro fraîcheur de plus. La troisième situation ne se lit nulle
part dans la charge : elle se RECONSTRUIT chez l'abonné, parce qu'une coupure ne
s'observe qu'APRÈS une connexion.

La question à poser à tout abonnement à un état de connexion n'est donc pas
« sait-il quand ça revient ? » mais **« sait-il distinguer un RETOUR d'une
PREMIÈRE fois ? »** — et si la réponse est non, le rattrapage devient une taxe
au démarrage.

### Le corollaire qui a été trouvé en relisant, pas en écrivant

Le déclencheur a une seconde clause : relire aussi quand aucune hydratation n'a
eu lieu, pour l'onglet ouvert hors ligne. Écrite, elle avait l'air juste. Relue,
elle était **fausse pour la raison qu'elle invoquait** :

- `syncAll()` **ne peut pas échouer** — chacun de ses quatre `GET` porte son
  propre `catch` et résout `void` ;
- `initialize()` pose donc `lastSyncedAt` même quand AUCUNE lecture n'a abouti ;
- et `partialize` le **persiste**, si bien qu'au chargement suivant le champ
  restauré déclare une fraîcheur qui n'a jamais existé.

> **Un champ d'horodatage de synchronisation mesure « une passe s'est
> terminée », pas « des données ont été lues »** — dès que les erreurs sont
> absorbées un cran plus bas. Le nom dit l'autre chose, et c'est le nom que les
> lecteurs croient.

Devant tout champ dont on s'apprête à faire une CONDITION, la question n'est pas
« que vaut-il ? » mais **« qui l'écrit, et sous quelles conditions ne
l'écrit-il PAS ? »**. Ici, la réponse était « personne ne s'abstient jamais » —
donc la condition ne discriminait rien. Même famille que la leçon 311 (« quel
PIXEL change ? ») portée d'un lecteur d'événement à un prédicat : dans les deux
cas le code est correct, et ce qu'il *signifie* ne l'est pas.

---
