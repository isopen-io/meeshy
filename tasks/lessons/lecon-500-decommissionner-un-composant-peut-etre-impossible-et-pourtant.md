## Leçon 500 — « Décommissionner » un composant peut être impossible et pourtant faisable : c'est l'ATTEIGNABILITÉ qu'on supprime, pas les fichiers

**Contexte** : #5053, directive porteur du 2026-09-03 — « il faut déjà
décommissionner l'ancien composer de story […] certains agents travaillent sur
l'ancien tant que les codes sources seront encore dans le repo ».

La lecture littérale — effacer les 33 fichiers `StoryComposer*` — **aurait effacé
le composer NEUF**. `MeeshyComposerHost+Surfaces` monte `StoryComposerView`
comme MOTEUR de sa scène ; l'« ancien » n'est pas un chemin parallèle, c'est
l'atelier du nouveau. La demande était pourtant juste, et son MOTIF le disait :
ce qui gênait n'était pas la présence des fichiers mais le fait qu'on puisse
encore *travailler dessus* — c'est-à-dire les monter directement.

> **Quand une demande de suppression bute sur une dépendance, relire le MOTIF
> plutôt que l'objet.** Ici : « plus aucune porte ne monte l'atelier nu » satisfait
> entièrement l'intention, et se livre. « Supprimer les fichiers » ne se livre
> pas. Répondre « impossible » aurait été faux ; exécuter à la lettre aurait
> cassé le produit.

### Le corollaire qui a fait le travail : une dette NOMMÉE est une dette LOCALISÉE

`ComposerIntent` justifiait `routesToLegacy: .repostComposer` par **trois faits
énumérés dans un commentaire**. Les relire un par un a fait le lot :

| # | le fait déclaré | verdict |
|---|---|---|
| 1 | « le meuble n'a aucune graine `StoryItem` » | VRAI |
| 2 | « son canal de scène ne porte pas `repostOfId` » | **FAUX** |
| 3 | « ni `allowedVisibilities` ni `initialVisibilityUserIds` » | VRAI, et SILENCIEUX |

Le point 2 était faux depuis toujours : `onPublishAllInBackground` est une
**fermeture fournie par la porte**, qui CAPTURE l'identifiant de la source —
c'est déjà ce que faisait le cover historique.

> **Une signature qui ne nomme pas une valeur ne l'empêche pas de voyager.** Un
> obstacle inventorié dans un commentaire se vérifie avant de le contourner :
> celui-ci a retenu le lot pendant deux cycles pour rien.

### Et le manque qui coûte n'est pas celui qui échoue

Le point 3 était le seul dont l'oubli était **silencieux** : un plafond
d'audience absent ne casse rien, il offre une audience de plus, que l'auteur
choisit et que le serveur refuse ensuite — 403 `REPOST_AUDIENCE_WIDENING`, APRÈS
que la composition est faite. D'où deux décisions de forme :

- **les deux moitiés (quel contenu / quelle audience) tiennent dans UN seul
  paramètre** (`ComposerHydration`), parce que les séparer aurait permis d'en
  passer une sans l'autre — republier sans plafond, sans un mot ;
- **le témoin porte sur la RÈGLE, pas sur le câblage.** Le câblage se vérifie en
  lisant ; la règle se vérifie en tombant.

### Trois pièges de forme, rencontrés dans l'ordre

1. **Une garde qui compte les occurrences d'un motif voit sa propre réussite
   comme une panne.** `AppInitWireupTests` a rougi avec « `StoryTrayView.swift`
   ne présente plus de composer de story ? » — la bonne nouvelle. Le retrait du
   site de sa liste doit être fait à la main **en disant pourquoi**, sinon la
   session suivante rétablit le site pour faire repasser le test au vert.
2. **Passer au meuble AJOUTE**, donc la directive de budget (interdit d'ajouter à
   un fichier hors budget) rend l'extraction *préalable et obligatoire*, pas
   optionnelle. `StoryViewerView` : 2 407 lignes.
3. **Un socle neuf arme des contrôles neufs.** Le meuble peint un œil qui appelle
   `onPreview` ; les deux covers historiques n'en avaient pas besoin faute de
   socle. Le brancher sur une fermeture vide aurait armé un contrôle INERTE — la
   loi 4, déjà payée sur `PostCard`. **Migrer une surface vers un hôte plus riche,
   c'est hériter de ses affordances : il faut les nourrir, ou ne pas migrer.**

### L'asymétrie assumée, et comment la garder

`ComposerHydration.repostingStory` porte un `StoryItem` ; `.editingStory` porte le
**ViewModel**. Le publieur d'une édition RELIT l'objet
(`editingKnowsDeclaredReferences` décide de PRÉSERVER ou de RÉVOQUER les
références déclarées). L'invariant du meuble — « ne jamais construire un SECOND
ViewModel » — tient quand même : il n'en construit aucun, il adopte celui qu'on
lui remet. **Un invariant se lit sur ce qu'il interdit, pas sur la forme qu'il
avait quand on l'a écrit** ; et une asymétrie motivée se garde par un témoin,
sinon quelqu'un « harmonisera » les deux cas.

---
