## Leçon 107 — l'ORDRE d'une page décide si sa troncature est une perte ou une pagination (2026-08-11, routine messaging, cycle 77)

`GET /conversations?updatedSince=` plafonne à 100 lignes et triait par `lastMessageAt`
décroissant. Le tri venait de l'écran de liste, où il est juste ; appliqué à une page
FILTRÉE par `updatedAt`, il n'a aucun rapport avec le filtre.

Conséquence : les lignes coupées ne sont pas « les moins récemment mises à jour », donc un
client qui avance son watermark au max des `updatedAt` reçus les enjambe — définitivement,
jusqu'à sa prochaine réconciliation complète (24 h). Le web avait traité le symptôme côté
client (page pleine ⇒ relecture complète) ; la cause était un `orderBy` à quatre mots.

**Règle : quand une page est filtrée par un curseur, elle doit être TRIÉE par ce même
curseur, croissant.** Alors les lignes coupées sont exactement celles que le curseur
suivant demandera, et la troncature devient une pagination naturelle — sans une ligne de
code client. Un tri hérité d'un autre usage de la même route est le premier endroit où
regarder quand un delta « perd » des lignes.

Deux bornes à écrire noir sur blanc :

- **Le résidu des ÉGALITÉS survit.** Avec une borne stricte (`gt`), plus de `limit` lignes
  portant la même milliseconde débordent d'une page qu'on ne sait pas reprendre. Le dire
  dans le code, et laisser au client la détection de la page pleine plutôt que la
  supprimer en croyant le défaut clos.
- **L'ordre est conditionnel au filtre.** Une page ordinaire garde la récence : la même
  route sert deux besoins, et trier par `updatedAt` un écran de liste lui rendrait ses
  conversations les plus vieilles en tête.
