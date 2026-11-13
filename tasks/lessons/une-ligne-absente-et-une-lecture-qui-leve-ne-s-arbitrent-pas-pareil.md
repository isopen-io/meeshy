# Une ligne ABSENTE et une lecture qui LÈVE ne s'arbitrent pas pareil

*Cycle 154 (2026-11-13), #17140 — `services/gateway/src/services/historyFloor.ts`.*

Le module du plancher d'historique avait tout l'appareil d'un fail-closed :
une forme `OrFail` qui RETIRE les conversations dont le verdict dépendait d'une
lecture ratée, un doc-comment de trois paragraphes sur la dégradation sûre, des
témoins qui prouvent qu'une panne Mongo ne rouvre rien. Tout cela parle d'une
**LEVÉE**.

Dans la même fonction, trois lignes plus bas :

```ts
if (!link || link.allowViewHistory) return null;   // ← lien INTROUVABLE ⇒ AUCUN plancher
```

Une lecture qui ABOUTIT et ne trouve rien n'est pas une panne : **c'est une
réponse**, et c'était la seule qu'on reçût du cas qui la produit. Elle rendait
« aucun plancher » — le fil, le delta de `/sync`, la recherche et l'agrégat
servis depuis l'origine de la conversation.

> **Un module peut être fail-CLOSED sur l'ÉCHEC et fail-OPEN sur l'ABSENCE, et
> ses trois paragraphes sur le premier rendent le second invisible.** La
> question n'est pas « ce module ferme-t-il ? » mais **« ferme-t-il sur chacune
> des réponses qu'il peut recevoir ? »** — et il y en a trois, pas deux :
> la valeur, la panne, et le vide.

C'est la forme du cycle 127 (« un verdict de garde a TROIS états : `live`,
`gone`, `unknown` ») rejouée sur un autre sujet, avec l'arbitrage inversé —
là-bas une ligne absente valait `unknown` parce que c'est une LIVRAISON qui
était en jeu ; ici elle vaut refus parce que c'est un SECRET.

## Deux corollaires, mesurés dans le même lot

**1. Un fail-OPEN qui ne se produit jamais par accident a des FABRIQUES, et
elles se cherchent.** Le doc-comment donnait le cas pour résiduel (« supprimé
depuis la jointure »). Deux unités de production le fabriquent — la purge d'un
compte et le **balayage horaire des liens échus** — parce que toutes deux ne
révoquent que les invités `type: 'anonymous'` avant de supprimer la ligne du
lien, quand un INSCRIT peut entrer par un lien. La seconde n'est pas un
incident : c'est le cycle de vie NOMINAL de tout lien qui porte un `expiresAt`.
Devant un cas d'erreur présenté comme résiduel, demander **qui l'écrit**.

**2. CINQ témoins gelaient la posture, à cinq étages.** Ce n'est pas une
mauvaise nouvelle, c'est l'information : une posture qu'on retrouve cinq fois
n'est pas une ligne oubliée, elle est ÉTABLIE — et c'est ce qui justifie de
l'instruire plutôt que de la « corriger » au passage. Chacun s'inverse en disant
pourquoi ; aucun ne se supprime. Et l'un d'eux gardait DEUX choses (« aucun
plancher, **et pas de 403** ») dont une seule change : un `toEqual` et un
intitulé affirment chacun sur ce qu'ils gardent ET sur ce qu'ils admettent.

**Le cinquième n'a pas été trouvé en cherchant**, et le lot avait publié « quatre »
avant qu'il ne tombe à la suite COMPLÈTE, deux étages plus loin, sur une surface
qu'aucun des quatre ne nomme. *Un inventaire de témoins relevé par grep sur le
mot d'une posture ne rend que les sites qui l'ont écrite avec ce mot-là.* Même
cycle, même faute, sur un autre compte : « 35 consommateurs » comptait les
fichiers qui MENTIONNENT le module (56), pas ceux qui l'APPELLENT (26). **Un
compte se compte avec le prédicat exact de la phrase qu'il sert, et le gate qui
l'exerce TOUS passe avant sa publication.**

**3. Une affirmation périmée survit chez la jumelle.** Le doc-comment de
`resolveEntryRights` énonçait « défaut `true` — un lien introuvable ne borne
rien, posture unique du dépôt ». Laissée debout, elle aurait fait recroire ce
que le commit condamnait. Deuxième exemplaire en deux cycles (cf. cycle 153) :
**un lot qui instruit une affirmation relève ses copies dans le même lot.**
