## 2026-11-17 — Une mutation VERTE accuse le témoin avant d'absoudre le code

*Routine messagerie temps réel, cycle 174, #18731.*

Le dépôt sait déjà qu'**une garde se livre en montrant qu'elle tombe sous la
mutation qu'elle nomme**. Il ne dit nulle part quoi faire d'une mutation qui
**ne tombe pas** — et c'est le cas intéressant, parce qu'il a deux lectures qui
s'excluent :

| la mutation reste verte | lecture |
|---|---|
| la ligne mutée est MORTE | rare, et ça se prouve en la supprimant |
| **le témoin ne l'atteint pas** | le cas nominal |

Mesuré. Sept mutations jouées sur le lot du préfixe contigu de livraison ; six
rouges. La septième remplaçait `messageId: target` par `messageId` dans l'avance
du curseur, et restait verte — **à juste titre** : le témoin principal
n'exerçait qu'un préfixe VIDE, où la garde `if (target)` porte à elle seule tout
le verdict. La valeur passée ne pouvait pas compter.

Le cas manquant était le préfixe **PARTIEL** — un message prouvé, un trou, un
troisième rapporté — la seule forme où la CIBLE se distingue du plus récent, et
la plus plausible en production : un drain qui survient après un trou ancien.
Une fois écrit, la mutation rougit.

> **La question à poser à une mutation verte n'est pas « le code est-il bon ? »
> mais « quelle forme d'entrée ferait cette ligne COMPTER, et l'ai-je
> écrite ? »**

C'est la leçon 261 (« un témoin de RANG s'écrit sur un rang AUTRE que le
premier ») rendue exécutable : au cas trivial, la règle juste et la règle fausse
rendent le même verdict, donc le témoin posé là ne peut pas tomber. La mutation
est l'instrument qui le dit tout seul, au lieu qu'on ait à s'en souvenir.

### Corollaire — une mutation se vérifie APPLIQUÉE avant d'être lue

Trois des mutations de ce cycle ont d'abord rendu « vert » **sans avoir été
appliquées** : le motif de remplacement ne matchait pas, ou matchait la JUMELLE
— `_computeExactReadCursorTarget`, trente lignes plus haut, dont le corps est
presque identique à celui qu'on venait d'écrire.

Un lot qui ajoute une jumelle rend tout remplacement textuel ambigu **par
construction**, et l'ambiguïté se résout du côté qui rassure : une mutation
posée ailleurs laisse la suite verte, et le vert se lit comme « le code tient ».

La forme juste ancre le remplacement sur le NOM de l'unité visée et **échoue
bruyamment** quand elle ne trouve pas sa cible :

```python
anchor = s.index('_computeExactDeliveredCursorTarget(params: {')
head, tail = s[:anchor], s[anchor:]
assert old in tail, "ANCHOR MISS: %r" % old     # ← sans lui, « vert » veut dire « rien fait »
```

Même famille que « un gate rend DEUX verdicts, et ils peuvent se contredire » :
**un instrument de mesure incapable de dire « je n'ai rien fait » rend toujours
le verdict qu'on espérait.** Et l'après-coup ne rattrape pas — un `diff` de
contrôle après chaque mutation est la version minimale, l'ancre nommée la
version qui ne s'oublie pas.
