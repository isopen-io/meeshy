# C4 ne pose pas un en-tête de plus : il ouvre la porte du lecteur de scènes

**Ouvert le 2026-08-22**, à la fusion du socle du lot C (`4c937e078`).

## Le couplage, que rien ne signale sur place

La tâche C4 (« La rupture client — en-tête, 426, porte bloquante ») pose trois
en-têtes dans le funnel unique d'`APIClient`. Deux servent la porte 426. Le
troisième, `X-Canvas-Caps: 3`, n'a rien à voir avec la rupture client : **il
change ce que le gateway met sur le fil pour toutes les stories.**

Vérifié dans le code, pas seulement dans le plan :

- `services/gateway/src/services/posts/storyEffectsV3.ts:388` — « `canvasCaps`
  vient de l'en-tête `X-Canvas-Caps` (absent = client legacy) ».
- `negotiateWireStoryEffects()` (même fichier, l. 489) choisit la forme servie.
- Des suites existent déjà des deux côtés de la négociation :
  `storyEffectsUpgradeGate.test.ts` et `storyEffectsWire.test.ts`, toutes deux
  avec `CAPS_HEADER = { 'x-canvas-caps': '3' }`.

Et côté iOS, le socle du lot C a mis le lecteur de scènes **derrière une porte** :
`MeeshyScenePlayer` ne peint que si un document v3 **natif** est présent, sinon
l'hôte canvas direct. Aujourd'hui cette porte est fermée pour **100 %** des
stories, précisément parce qu'iOS ne pose pas encore l'en-tête.

**Donc : le jour où C4 pose `X-Canvas-Caps: 3`, le lecteur prend la main en
production, d'un coup, sur tout le parc.** Ce n'est pas un effet de bord à
surveiller — c'est le déclencheur du swap, et il est écrit dans une tâche dont le
titre parle d'autre chose.

## Le risque à lever AVANT de poser l'en-tête

Le socle a établi que l'aller-retour v1→v3 **perd le cadre** : la migration
exprime les ancres libres dans un espace de scène **figé 9:16**, alors que
`readerCanvasRatio` encadre au ratio **réel** de la story. Sur un fond 16:9 — le
cas courant, le composer stampant un ratio continu dès qu'un fond est importé —
un texte écrit à 0,90 se peint à **0,6266**.

La perte n'est pas une particularité du pont Swift : elle est **dans le format**,
et le golden partagé avec le convertisseur gateway la porte déjà (texte du
fixture v1 à 0,2, jumeau v3 à 0,40507).

Le socle s'en tire parce que ses deux branches sont **self-cohérentes** : une
story v3-native se peint en 9:16 parce que son `StoryEffects` décodé sort lui
aussi du pont. La dérive n'apparaît que si l'on **mélange** — ancres en espace
9:16 peintes dans un cadre au ratio réel.

**La question ouverte, et elle est produit autant que technique :** quand le
gateway servira du v3 natif pour une story composée sur un fond 16:9, le lecteur
la peindra-t-il en 9:16 ? Si oui, le cadrage de ces stories **change** par
rapport à ce que voit l'utilisateur aujourd'hui — sur du contenu déjà publié,
que personne ne recomposera.

## Définition de fini pour ce point (en plus de la DoD de C4)

- [ ] Un test qui prend une story **au ratio réel ≠ 9:16**, la fait servir par le
      gateway **avec** `x-canvas-caps: 3`, et compare le cadrage rendu à celui
      obtenu **sans** l'en-tête. Les deux doivent coïncider — ou l'écart doit
      être nommé, chiffré et assumé.
- [ ] Tant que ce test n'est pas vert, `X-Canvas-Caps: 3` ne part pas. Les deux
      autres en-têtes (`X-App-Version`, `X-App-Platform`) ne dépendent pas de
      lui et peuvent partir seuls : la porte 426 n'a pas à attendre le cadrage.
- [ ] Si l'écart existe et qu'il est assumé, il se dit dans la planche P0 et dans
      `packages/MeeshySDK/decisions.md` — pas seulement dans un message de
      commit.

## Ne pas rouvrir

`SceneV3(id: "s1")` gravé en dur côté gateway (`storyEffectsV3.ts:204`) **n'est
pas un défaut** : la migration n'émet qu'UNE scène (`scenes: [scene]`, l. 218),
l'id est donc document-scopé, et le gateway adresse ses scènes par **index**
(`scenes.${s}.objects.${o}`, l. 353-356), jamais par id. Le défaut était iOS
traitant cet id comme une identité **globale** ; le socle l'a corrigé à la bonne
couche (racine d'identité = le porteur). Vérifié le 2026-08-22.

## Voisin

`tasks/todo-ios-error-code-participant-left-2026-08-22.md` — l'autre greffe
assignée à C4, qui touche le même funnel d'`APIClient`. Les deux se font en un
seul passage sur ce fichier.
