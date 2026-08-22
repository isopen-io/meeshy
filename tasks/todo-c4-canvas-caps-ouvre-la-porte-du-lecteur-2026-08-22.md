# `X-Canvas-Caps` n'ouvre pas une porte future : il en referme une, ouverte

**Ouvert le 2026-08-22** à la fusion du socle du lot C. **Réécrit le même jour,
après constat sur simulateur : la première ET la deuxième rédaction étaient
fausses, dans le même angle mort.**

## Ce qui est vrai, mesuré

Les DEUX composers écrivent du canvas v3 natif, aujourd'hui, en production :

- **web** — `apps/web/components/v2/StoryComposer.tsx:288` :
  `return { v: 3, scenes: [{ id: 's1', objects }] }`, envoyé en `storyEffects`
  (l. 391).
- **iOS** — `packages/MeeshySDK/.../StoryModels.swift:1889` :
  `encode(to:)` passe TOUJOURS par `CanvasV3(migrating: self)`. Le commentaire
  sur place le dit : « Le fil n'accepte plus que le canvas v3 ».

Et aucun des deux clients NATIFS n'annonçait ses capacités. La table O17
(`resolveWireForm`, `storyEffectsV3.ts:414`) est sans ambiguïté sur ce cas :

```
blob v3-natif + client SANS caps  ⇒  'sentinel'
```

La sentinelle est un fond `1E1B4B` uni (l. 467) — l'indigo de la marque. Donc
**tout le parc iOS et Android affichait un aplat à la place de chaque canevas de
story, y compris les siens.** Le décodeur v3 iOS
(`StoryModels.swift:1769`, `mark >= 3 → CanvasV3(from: decoder)`) sait pourtant
les peindre depuis le lot B : la capacité était dans le binaire, le contenu
n'arrivait simplement jamais jusqu'à elle.

## Ce que les rédactions précédentes ont raté, et pourquoi

**Rédaction 1** : « le jour où C4 pose l'en-tête, le lecteur prend la main sur
tout le parc, d'un coup ». Trop large — ignorait le second verrou.

**Rédaction 2** : « poser `X-Canvas-Caps: 3` aujourd'hui ne change RIEN, la
branche v3-natif n'a aucun contenu à servir ». **Faux.** J'avais cherché les
émetteurs de `v: 3` dans le gateway et dans le Swift, trouvé seulement une forme
de fil et une migration, et conclu. **Je n'ai pas ouvert le composer web.**

La leçon n'est pas « j'ai raté un fichier » : c'est qu'une affirmation de la
forme **« RIEN n'émet X »** est une quantification universelle, et qu'on ne la
prouve pas en fouillant deux des quatre clients. Soit on balaie les quatre
(gateway, iOS, web, Android), soit on écrit ce qu'on a réellement couvert.

## Ce qui restait juste

Le verrou de l'ARCHIVE tient, lui, et n'a pas bougé :

| blob | caps ≥ 3 | `CANVAS_V3_READ` | forme servie |
|---|---|---|---|
| v1 | non | — | tel quel (v1) |
| v1 | oui | **non** | **tel quel (v1)** ← le cas réel |
| v1 | oui | oui | converti (v3) |
| v3-natif | oui | — | **v3** ← ce que l'en-tête débloque |
| v3-natif | non | — | **sentinelle** ← ce qu'on subissait |

`CANVAS_V3_READ` n'apparaît dans AUCUN fichier de configuration (revérifié) et
vaut OFF par défaut. Poser l'en-tête **n'arme donc pas** la conversion de
l'archive, et n'expose pas au recadrage de `remapFreeAnchor`. Les deux sujets
restent distincts.

## État

- [x] `X-Canvas-Caps: 3` posé dans `ClientInfoProvider.staticHeaders()` —
      le funnel unique (`APIClient.swift:603` et `:903`).
- [x] Suite : `ClientInfoProviderTests` étendue (RED prouvé à 4 échecs
      nommant l'en-tête, GREEN à 9/9).
- [ ] **Android** ne pose toujours pas l'en-tête (aucune occurrence dans
      `apps/android`) : le parc Android voit encore la sentinelle sur toute
      story v3. C'est le lot H, et c'est maintenant une régression VIVANTE,
      plus une préparation.

## Reste bloquant pour l'ARMEMENT de `CANVAS_V3_READ` (pas pour l'en-tête)

- [ ] Un test qui prend une story au ratio réel ≠ 9:16, la fait servir **avec**
      puis **sans** l'en-tête, et compare le cadrage. `remapFreeAnchor`
      reprojette les coordonnées v1 (relatives au média porteur) vers la scène
      9:16 : sur un réel 16:9 un texte à `y = 0.90` atterrit à `0.6266`, et
      `SceneV3Schema` n'a **aucun champ d'aspect** où consigner le ratio
      d'origine — la conversion n'est donc pas inversible.

## Ne pas rouvrir

`SceneV3(id: "s1")` gravé en dur (`storyEffectsV3.ts:204`) n'est pas un défaut :
la migration n'émet qu'UNE scène, l'id est document-scopé, et le gateway adresse
ses scènes par index (l. 353-356). Vérifié le 2026-08-22.
