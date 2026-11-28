## 2026-11-28 : Le débannissement et l'entrée par lien ne paient pas le budget des ajouts (#20740)

**Contexte.** Le budget des ajouts sans accord (#19812, `utils/community-addition-budget.ts`) borne
les gestes qui font entrer QUELQU'UN D'AUTRE dans une communauté sans lui demander son avis. Depuis
#20703 et #20740, toutes les entrées une par une dans un salon d'une communauté privée le paient :
`POST /conversations/:id/participants`, `POST /conversations/:id/invite` et l'invitation dans un
appel (`call:invite-participant`). L'audit de #20703 avait laissé deux portes « à instruire » : le
débannissement (`participant-ban-core.ts`) et l'entrée par lien (`link-admission.ts`). Toutes deux
passent par `planSalonEntry`, donc peuvent écrire une ligne `CommunityMember`.

**Décision.** Ni l'une ni l'autre ne paie le budget.

1. **L'entrée par lien est VOLONTAIRE.** C'est la personne qui entre qui clique, s'identifie et
   rejoint : le geste a son accord par construction, et le budget ne compte que les ajouts SANS
   accord. Ce qui la borne est ailleurs et déjà écrit : la loi de `planSalonEntry` appliquée à
   l'AUTEUR du lien (#16695 — un lien ne fait entrer que ce que son auteur pourrait faire entrer
   aujourd'hui), les plafonds et l'expiration du lien, et le plafond global par IP.
2. **Le débannissement RESTITUE, il n'ajoute pas.** `resolveUnbanWrite` ne rend l'appartenance que
   si le bannissement l'avait retirée (la personne était présente quand elle a été bannie) ; un
   départ antérieur au bannissement ne lève que le bannissement. La personne était donc occupante
   du salon, et à ce titre membre de la communauté, au moment où on l'en a exclue. Le geste exige
   le rang MODERATOR et la même loi que le bannissement (`participantActionRefusal`), et il ne
   pousse aucune notification `community_invite`. Le faire payer créerait un état pire que celui
   qu'il prévient : un débannissement refusé par le budget lèverait le bannissement sans rendre
   l'appartenance (l'issue de `liftBanOnly`), ce qu'aucun modérateur ne demande.

**Ce qui pourrait la rouvrir.** Un débannissement qui ferait entrer quelqu'un qui n'a JAMAIS été
membre (une ligne bannie créée sans admission préalable), ou un lien qui ferait entrer une autre
personne que celle qui clique. Aucun des deux n'existe aujourd'hui ; un lot qui en ouvre un reprend
cette décision.

**Liée.** #19812 (le budget), #20703 (les entrées une par une), #20740 (l'appel, le débit rendu
quand rien n'est écrit), #16695 (la loi de l'auteur du lien), #16703 (le débannissement dans une
communauté privée).
