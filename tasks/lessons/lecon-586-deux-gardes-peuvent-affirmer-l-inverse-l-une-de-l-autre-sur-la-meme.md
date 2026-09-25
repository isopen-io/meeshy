## Leçon 586 — Deux gardes peuvent affirmer l'INVERSE l'une de l'autre sur la même chaîne : l'une des deux ne peut alors qu'être rouge

2026-09-12, #6117 (`9070e21996`). `ConversationMenuSystemDesignGuardTests`
exigeait, dans le source de `MessageListViewController.swift`, la présence de
`enableLongPress: nativeMenu == nil` — pendant que `ThreadRowGestureParityTests`
en exigeait l'ABSENCE. Une seule commande le montre, et elle tient en deux lignes :

```
$ git grep -n 'enableLongPress: nativeMenu == nil' 9070e21996^ -- apps/ios
…/ConversationMenuSystemDesignGuardTests.swift:376:  XCTAssertTrue(  … contains(…)
…/ThreadRowGestureParityTests.swift:130:            XCTAssertFalse(vc.contains(…)
```

**Ce n'est pas une garde PÉRIMÉE, et c'est ce que le mot « périmé » fait manquer :
c'est un témoin NEUF ajouté sans retirer celui qu'il remplace.** Le pivot du
2026-07-14 (« sur iOS 26 la bulle attache un `.contextMenu` natif, et la cellule
COUPE le long-press custom ») était juste quand il a été écrit ; la directive
porteur du 2026-09-12 l'a supplanté — appui long = menu Meeshy de iOS 16 à
iOS 26 — et le témoin de la loi neuve s'est posé à côté de l'ancien, pas à sa
place. À cet instant précis, le dépôt CONTENAIT sa propre contradiction, et rien
ne pouvait la rendre verte.

> **Ce qui attrape ce défaut n'est pas de relire la garde rouge — c'est de grepper
> la CHAÎNE qu'elle assère.** En lisant les deux fichiers séparément on ne voit
> rien : chacun est parfaitement cohérent CHEZ LUI, avec son `MARK`, sa
> justification et son message d'échec. La contradiction n'existe qu'à
> l'intersection, et l'intersection est une sous-chaîne — donc un `grep`, jamais
> une lecture.

RÈGLE D'ÉCRITURE, qui rend la leçon préventive au lieu de diagnostique : **à
l'ajout d'un témoin qui assère un texte SOURCE, chercher d'abord qui d'autre
assère déjà ce texte.** Un `XCTAssertTrue` et un `XCTAssertFalse` sur la même
sous-chaîne se voient en une commande ; ils ne se voient JAMAIS autrement.

COROLLAIRE, mesuré par le même lot : **deux gardes qui affirment la MÊME règle
divergent au premier changement** — c'est exactement ce qui vient d'arriver. La
résolution n'est donc pas de retourner l'assertion fautive (ce qui redoublerait la
loi neuve et reprogrammerait la divergence suivante), mais de ne garder, dans le
fichier dépossédé, que l'invariant qui n'est dit NULLE PART ailleurs. Ici :
`nativeMenu` reste DÉCLARÉ à `nil`, et ce `nil` n'est pas un reste — c'est lui qui
commande le retrait de l'`UIContextMenuInteraction` que le système pose sur la
cellule. Le supprimer au motif qu'il « ne sert plus » rouvrirait la pression
système que #6117 vient de fermer.

Trois voisines, et les distinguer évite de chercher au mauvais endroit :
- la **560** — un lot RENOMME, et la garde qui reconnaissait par le nom devient
  anti-corrélée : le texte de la garde n'a pas bougé, son sujet a bougé sous elle ;
- la **584** — un DÉCOUPAGE éteint les gardes ancrées sur un FICHIER : la garde
  cesse de mesurer (une garde de présence rougit, une garde d'absence VERDIT) ;
- la **586**, ici — les deux gardes mesurent bien, le même texte, et se
  contredisent : le défaut est dans le DÉPÔT, pas dans le dispositif de mesure.

Défaut trouvé, corrigé ET formulé par la session `Longpress` (Bulle, Focal,
Script, Rivière) : les quatre commits en cause — le témoin neuf `e024cca040`, la
loi `eb96625445`, le retrait `9070e21996` — vivent tous sur
`claude/double-tap-menu-6117`, mesuré par `git branch -r --contains`. Elle a
laissé l'ALLOCATION du numéro à la session tenant `tasks/lessons.md`, comme la 585
et pour la même raison : un identifiant qu'on n'alloue pas ne collisionne pas
(#5102). Note d'attribution, utile ici : `git log --format=%an` ne discrimine
AUCUNE de ces sessions — elles committent toutes sous le même auteur. Ce qui
distingue qui a fait quoi est la BRANCHE, jamais le nom.
