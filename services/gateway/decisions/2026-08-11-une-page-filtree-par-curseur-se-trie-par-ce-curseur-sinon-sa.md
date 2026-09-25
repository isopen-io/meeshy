## 2026-08-11 : Une page filtrée par curseur se trie PAR ce curseur — sinon sa troncature est une perte

**Contexte** : `GET /conversations?updatedSince=` plafonne à 100 lignes et triait par `lastMessageAt`
décroissant — l'ordre hérité de l'écran de liste, sans rapport avec le filtre. Les lignes coupées
n'étaient donc pas « les moins récemment mises à jour », alors que les deux clients avancent leur
watermark au max des `updatedAt` REÇUS : elles étaient enjambées jusqu'à la réconciliation complète
(1×/24 h sur iOS), la liste affichant entre-temps des compteurs et des aperçus périmés sans signal.

**Décision** : une page DELTA est triée par `updatedAt` croissant, `id` en départage. Les lignes
coupées sont alors exactement celles d'`updatedAt` supérieur à la dernière rendue : le watermark
pointe dessus et l'appel suivant les rend. La troncature devient une pagination, sans aucun
changement client. Une page ordinaire garde `lastMessageAt` décroissant, et le curseur `before`
(qui borne sur `lastMessageAt`) garde la main sur l'ordre.

**Alternatives rejetées** :
- **Câbler la détection côté client** (page pleine ⇒ relecture complète, ce que le web fait déjà) :
  traite le symptôme, doit être réécrit sur chaque plateforme, et fait payer une relecture complète
  là où l'ordre serveur rend la page suivante suffisante.
- **Relever le plafond à 500** (ce que le client iOS demande déjà sans l'obtenir) : déplace le seuil
  sans supprimer le cas, et alourdit une route déjà lourde.

**Conséquences** :
- Un client delta reçoit ses conversations de la moins récemment modifiée à la plus récente. Les deux
  consommateurs fusionnent par id, aucun ne dépend de l'ordre.
- Résidu assumé : plus de 100 conversations portant la MÊME milliseconde d'`updatedAt` débordent
  d'une page que la borne stricte `gt` ne peut pas reprendre. La détection de page pleine reste donc
  utile côté client — le web la garde, iOS ne l'a pas encore.

---
