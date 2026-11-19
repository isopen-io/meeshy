## Une CI désactivée ne rend AUCUN signal — et l'absence ressemble à l'attente

*2026-11-18, cycle 179. Payé en attente, pas en code.*

Le lot était prêt, poussé, `dev` fusionnée, la PR `mergeable`. Il ne restait
qu'un verdict de CI. Relevé successivement :

| observation | ce que j'en ai conclu, et c'était faux |
|---|---|
| deux runs `cancelled`, dont un sans aucun job | « la rafale de poussées les évince » (#18760) — vrai du premier, faux du second |
| 95 runs en file, 8 en cours | « la grappe est saturée, il faut attendre » |
| aucune `check_suite` Actions sur la tête poussée | « la suite n'est pas encore créée » |

Les trois observations sont compatibles avec « ça va finir par tourner », et
aucune ne distingue cette hypothèse de la vraie : **les 25 workflows du dépôt
étaient `disabled_manually`**, seuls les deux dynamiques de Dependabot restant
actifs. Une poussée sur un workflow désactivé ne produit ni run, ni suite, ni
erreur, ni ligne de journal. **Elle produit exactement ce que produit une file
longue : rien.**

Ce qui l'a dit, et c'est le seul outil qui le dise :

```
$ gh workflow run ci.yml --ref <branche>
Cannot trigger a 'workflow_dispatch' on a disabled workflow
```

> **Devant une attente de CI qui ne bouge pas, interroger l'ÉTAT DU WORKFLOW, pas
> la FILE.** `gh api repos/<o>/<r>/actions/workflows --jq '.workflows[] |
> select(.state != "active")'` répond en une commande à une question que la liste
> des runs ne peut pas poser. La file dit ce qui attend ; elle ne dit jamais que
> plus rien n'attendra.

### La forme générale, qui n'est pas propre à GitHub

C'est la famille « un témoin qui ne peut pas tomber n'est pas un témoin », vue du
côté de l'OBSERVATEUR : j'interrogeais un canal (la liste des runs) qui, par
construction, **ne peut pas exprimer l'état que je cherchais**. Tant qu'on
interroge un canal incapable de dire « non », son silence se lit « pas encore ».

Le test à se poser devant toute attente : *ce que je regarde pourrait-il me dire
que l'attente est VAINE ?* Si la réponse est non, ce n'est pas le bon endroit à
regarder, quelle que soit la patience qu'on y met.

### Et le corollaire de conduite

Un workflow désactivé l'a été par quelqu'un, délibérément — ici pendant que la
file se vidait (95 → 67 en quelques minutes). **Ce n'est pas un défaut à
réparer** : une session ne réactive pas un workflow du dépôt, et elle ne fusionne
pas sans le verdict que la directive exige (#9226). Elle consigne, elle rend
compte, et elle laisse la PR ouverte. La bonne issue d'un blocage
d'infrastructure est un rapport, jamais un contournement.
