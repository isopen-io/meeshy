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

**RECTIFICATION (2026-08-22, même jour, vérifiée dans le code).** La première
rédaction de cette note disait : « le jour où C4 pose `X-Canvas-Caps: 3`, le
lecteur prend la main en production, d'un coup, sur tout le parc. » **C'est
faux**, et la table de négociation le dit noir sur blanc.

`resolveWireForm()` (`storyEffectsV3.ts:410`) a **DEUX** verrous, pas un :

| blob | caps ≥ 3 | `CANVAS_V3_READ` | forme servie |
|---|---|---|---|
| v1 | non | — | tel quel (v1) |
| v1 | **oui** | **non** | **tel quel (v1)** ← le cas réel |
| v1 | oui | oui | converti (v3) |
| v3-natif | oui | — | v3 |
| v3-natif | non | — | sentinelle |

Deux faits mesurés qui ferment les deux dernières lignes :

1. **`CANVAS_V3_READ` n'apparaît dans AUCUN fichier de configuration** — ni
   `infrastructure/`, ni un `docker-compose*.yml`, ni un `.env` du dépôt. Il
   n'existe que dans la source, avec son défaut : « lu à chaque appel, **défaut
   OFF** » (l. 484). En production il est donc éteint.
2. **Rien ne PERSISTE de v3 natif.** Le seul `v: 3` construit côté gateway est
   dans `convertStoryEffectsForWire` (l. 231) — une forme de **fil**, jamais
   écrite en base. Côté Swift, le seul est `CanvasV3Migration.swift:361` — la
   **migration**, pas le composer. (Un `CANVAS_V3_WRITE_STRICT` existe aussi :
   le chemin d'écriture est lui aussi sous drapeau.)

**Conséquence pour C4 : poser `X-Canvas-Caps: 3` aujourd'hui ne change RIEN.**
Les stories v1 restent servies en v1 parce que le drapeau serveur est éteint, et
la branche « v3-natif » n'a aucun contenu à servir. Le vrai déclencheur du swap
n'est pas l'en-tête client — c'est **l'armement de `CANVAS_V3_READ=1` sur le
serveur**, un geste d'exploitation qui n'appartient pas à ce lot.

Ce que cela déplace : la question du cadrage reste entière, mais elle cesse
d'être **bloquante pour C4** et devient bloquante pour **l'armement du drapeau**.
C'est là qu'il faut la poser — et c'est une bien meilleure nouvelle, parce qu'un
drapeau serveur se lève et se rabaisse, alors qu'un binaire iOS parti en
production ne se rappelle pas.

## Définition de fini pour ce point (en plus de la DoD de C4)

- [ ] Un test qui prend une story **au ratio réel ≠ 9:16**, la fait servir par le
      gateway **avec** `x-canvas-caps: 3`, et compare le cadrage rendu à celui
      obtenu **sans** l'en-tête. Les deux doivent coïncider — ou l'écart doit
      être nommé, chiffré et assumé.
- [ ] `X-Canvas-Caps: 3` **peut partir avec C4** — il est inerte tant que
      `CANVAS_V3_READ` est éteint. C'est l'**armement du drapeau serveur** qui
      doit attendre le test de cadrage ci-dessus, pas le binaire iOS.
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
