## Leçon 299

**Une comparaison de rôle qui échoue « fermé » quand elle ACCORDE échoue
« ouvert » quand elle REFUSE.** Le sens de la garde décide du sens de la panne.

#4008 énumérait ~10 lecteurs de `Participant.role` comparant en minuscules
strictes, et les classait tous « fail-closed — un droit refusé, jamais accordé à
tort ». L'audit en a trouvé quatre de plus, et surtout **cinq qui échouaient
OUVERTS**, parce qu'ils ne servaient pas à accorder un pouvoir mais à en
refuser un :

| site | ce que la garde fait | effet d'une ligne `CREATOR` majuscule |
|---|---|---|
| `leave.ts` | REFUSE un départ | le créateur quitte en laissant tous ses membres |
| `participants.ts` | REFUSE une rétrogradation | le créateur devient rétrogradable |
| `ban.ts` | COMPARE deux rangs | `?? 0` fait du créateur le rang le plus BAS, donc bannissable |
| `delete-for-me.ts` | DÉCLENCHE le transfert d'ownership | conversation sans créateur, en répondant 200 |
| `core.ts` | RESTREINT le modérateur | latent : atteignable dès que le filtre voisin s'élargit |

Trois formes distinctes se cachaient derrière « comparaison de rôle » :
**accorder** (fail-closed), **refuser** (fail-open), et **déclencher une
conséquence** — cette dernière ne rend ni erreur ni log, seulement un état
laissé derrière. `delete-for-me.ts` répondait 200.

> Devant une famille de sites qu'une issue range d'un seul côté, ne pas
> demander « la comparaison est-elle juste ? » mais **« que fait cette garde —
> accorde, refuse, ou déclenche ? »**. La réponse change le SENS de la panne,
> donc sa gravité, donc l'ordre dans lequel on la corrige.

Corollaire mesuré : un repli `?? 0` sur un rang INCONNU protège l'appelant et
**déprotège la cible**. Le même défaut, lu depuis l'autre bout de la
comparaison, change de camp.

Et le piège s'est refermé une seconde fois **dans le correctif** : la loi
d'autorité de #3941 repliait d'abord un rang inconnu sur `member`. Or
`MEMBER_ROLE_HIERARCHY` place `member` à 10 et rend 0 pour l'inconnu — le repli
« prudent » PROMOUVAIT donc les lignes corrompues au-dessus de leur niveau
réel. **Un repli fail-closed mal choisi accorde exactement ce qu'il croyait
refuser.** Attrapé par une garde voisine (`ban uses ?? 0 for both roles`) qui
ne parlait pas du tout de plateforme — le gate COMPLET, pas la suite ciblée.
