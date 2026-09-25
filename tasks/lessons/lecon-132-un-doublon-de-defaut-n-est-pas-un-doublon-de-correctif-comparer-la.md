## Leçon 132 — un doublon de DÉFAUT n'est pas un doublon de CORRECTIF : comparer la couverture, pas l'intitulé (2026-08-12, routine messaging, cycle 91)

Quatrième occurrence de la collision décrite par les leçons 132, 137 et 142 : le cycle 91 a
implémenté les deux priorités de la tête du cycle 90 pendant qu'une session parallèle livrait le
cycle 90. Le `fetch` d'avant-PR l'a révélé, comme la fois précédente.

Ce que la leçon 131 dit du grain du `git fetch` reste juste, et n'a une fois de plus pas été
appliqué. Mais elle prescrit aussi ce qu'il faut faire APRÈS la collision — « comparer les
couvertures, et si l'autre version domine, jeter sans regret » — et le cycle 90 en avait tiré le
raccourci « le salvage est intégralement négatif, c'est le résultat normal ». **Ce raccourci est
faux, et l'appliquer ici aurait coûté un correctif que personne d'autre n'avait écrit.**

Les deux moitiés du travail doublonné ont eu des verdicts opposés :

| Moitié | Verdict | Raison |
|---|---|---|
| pastille de non-lus sur la suppression REST | jetée | même défaut, même site, et leur union discriminée (`authorId` requis sur `'deleted'`, absent de `'edited'`) fait tenir la règle par le TYPE là où le champ optionnel écrit ici ne faisait que la rattraper |
| rattrapage des accusés après coupure socket | **conservée** | même défaut, **couverture disjointe** : leur correctif vit dans `use-conversation-messages-rq.ts`, donc web-only ; celui-ci vit sur `conversation:join`, donc les trois clients |

**Règle : sur une collision, ne pas comparer les intitulés de défaut — comparer la SURFACE
réparée.** « Les accusés ne se rattrapent pas après une coupure » nomme le même défaut dans les
deux sessions ; il était réparé pour un client sur trois d'un côté et pour trois sur trois de
l'autre. Deux clients n'étaient réparés par personne, et l'auraient encore été si le doublon avait
été jeté sur son titre.

**Corollaire — le grain de la couverture est presque toujours « quel client / quel transport ».**
C'est la question qui a servi à trancher ici, et c'est la même qui a fait naître
`emitUnreadCountsToRecipients`, `broadcastMessageMutation` et `broadcastLinkMessage` : un correctif
posé dans un fichier de client ne répare qu'un client, un correctif posé sur l'événement serveur
les répare tous. **À couverture égale, préférer le site partagé ; à site égal, préférer le type qui
interdit l'oubli.** Les deux moitiés ci-dessus illustrent chacune une des deux moitiés de cette
règle, en sens inverse.

---
