## 2026-11-28 : L'entrée par lien ne paie pas le budget des ajouts ; le débannissement le paie quand il fait rentrer dans la communauté (#20740)

**Contexte.** Le budget des ajouts sans accord (#19812, `utils/community-addition-budget.ts`) borne
les gestes qui font entrer QUELQU'UN D'AUTRE dans une communauté sans lui demander son avis. Depuis
#20703 et #20740, toutes les entrées une par une dans un salon d'une communauté privée le paient :
`POST /conversations/:id/participants`, `POST /conversations/:id/invite` et l'invitation dans un
appel (`call:invite-participant`). L'audit de #20703 avait laissé deux portes « à instruire » : le
débannissement (`participant-ban-core.ts`) et l'entrée par lien (`link-admission.ts`). Toutes deux
passent par `planSalonEntry`, donc peuvent écrire une ligne `CommunityMember`.

**Décision 1 — l'entrée par lien ne paie pas : elle est VOLONTAIRE.** L'entrant est l'identité qui
appelle (`link-admission.ts`) : c'est la personne qui clique, s'identifie et rejoint, donc le geste a
son accord par construction, et le budget ne compte que les ajouts SANS accord. Ce qui la borne est
déjà écrit : la loi de `planSalonEntry` appliquée à l'AUTEUR du lien (#16695 — un lien ne fait
entrer que ce que son auteur pourrait faire entrer aujourd'hui), les plafonds et l'expiration du
lien, et le plafond global par IP.

**Décision 2 — le débannissement paie quand il fait RENTRER dans la communauté.** Le premier jet de
cette décision le dispensait, sur la prémisse que la personne débannie était forcément encore
membre de la communauté. L'audit adversarial du lot l'a mesurée fausse : un membre banni d'un salon
peut ensuite QUITTER la communauté (ou en être retiré) — `exitCommunitySalons` ne touche que les
lignes actives, la ligne bannie garde `leftAt == bannedAt` — et le débannissement le faisait alors
rentrer dans une communauté qu'il avait quittée, sans son accord et sans débit.

Donc :
- une cible restée membre active de la communauté n'y entre pas : le plan n'a aucun entrant, et le
  geste ne coûte rien ;
- une cible qui n'en est plus membre y rentre par un ajout du modérateur : il paie le budget
  (`communityBudget`, par défaut le serveur posé au montage de Socket.IO), et le débit se rend si
  l'écriture lève ;
- refusé par le budget, le bannissement est LEVÉ sans rendre l'appartenance (`liftBanOnly`),
  exactement comme un refus de la communauté (#16703). Le modérateur peut ensuite ajouter la
  personne par `POST …/participants`, qui paie le même budget. Le geste ne répond pas 429 : lever
  un bannissement n'est pas un ajout, seul le retour l'est.

**Ce qui reste ouvert.** Faire rentrer quelqu'un qui a quitté une communauté de lui-même reste
possible pour un modérateur (dans le budget) ; le refuser tout à fait serait une décision produit,
pas une borne d'abus.

**Liée.** #19812 (le budget), #20703 (les entrées une par une), #20740 (l'appel, le débit rendu
quand rien n'est écrit), #16695 (la loi de l'auteur du lien), #16703 (le débannissement dans une
communauté privée).
