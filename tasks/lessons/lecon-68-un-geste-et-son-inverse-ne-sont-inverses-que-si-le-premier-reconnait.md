## Leçon 68 — Un geste et son inverse ne sont inverses que si le premier RECONNAÎT ce qu'il n'a pas pris (2026-08-10, routine messaging, cycle 49)

`ban` écrivait `{ bannedAt, isActive: false, leftAt: now }`, `unban` écrivait
`{ bannedAt: null, isActive: true, leftAt: null }`. Lues côte à côte, les deux lignes ont l'air
d'être exactement l'inverse l'une de l'autre — c'est même ce qui les a fait survivre : elles se
relisent l'une l'autre et se rassurent.

Elles ne le sont que si le premier geste prend TOUJOURS la même chose. Dès qu'une entrée du domaine
peut être déjà dans l'état cible — ici, une personne déjà partie de la conversation — le premier
geste devient conditionnel sans le dire, et le second reste inconditionnel. Le second ne défait
alors plus : **il fabrique.** Débannir quelqu'un que le bannissement n'avait pas sorti ne rendait
pas une appartenance, ça en créait une, avec son rang périmé, ses sockets rebranchées de force et
une conversation qui réapparaît chez quelqu'un qui l'avait quittée.

**Le test qui manque à ce genre de paire n'est pas « A puis B rend l'état initial » sur le cas
nominal — il est vrai, c'est le piège.** C'est « A puis B rend l'état initial » sur l'entrée qui
était DÉJÀ dans l'état que A vise. Écrire la composition comme une involution, sur les deux classes
d'entrée, est ce qui rend le défaut visible en une ligne d'assertion.

**Corollaire sur la trace.** Le second geste ne peut être exact que si le premier lui a laissé de
quoi distinguer les deux cas. Ici le premier faisait pire que ne rien laisser : il ÉCRASAIT
`leftAt`, détruisant la preuve dont le second avait besoin — un défaut qui rendait l'autre
irréparable après coup. Avant d'ajouter une colonne pour porter cette information, regarder ce que
le geste écrit déjà : cesser d'écraser `leftAt` suffisait à faire de l'égalité `leftAt === bannedAt`
une trace exacte par construction (même objet `Date`, jamais deux lectures d'horloge), et à laisser
toutes les lignes déjà en base se lire comme le comportement qu'elles ont toujours eu — donc **zéro
script de réparation**, pour la première fois de cette famille depuis le cycle 27.

**Corollaire sur les clients.** Un événement qui annonce un geste conditionnel doit porter sa
condition. `participant-banned` ne disait pas s'il avait retiré quelqu'un ; web et iOS
décrémentaient à la réception, et iOS persistait la valeur fausse. Le champ ajouté est optionnel et
son ABSENCE se lit comme l'ancien comportement (`true`), jamais comme « pas d'effet » : lire le
silence d'un serveur plus ancien comme un refus fait ignorer tous ses gestes.
