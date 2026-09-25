## Leçon 506 — L'optimisation posée en QUEUE de fonction annule la feature ajoutée dans son corps

**Le fait.** `StoryStickerLayer.configure` se termine par
`shouldRasterize = mode == .play && sticker.isStatic`. Rasteriser une couche, c'est peindre son
cache : c'est juste, c'est mesuré, et le doc-comment au-dessus explique correctement pourquoi une
décoration ANIMÉE (au sens du mouvement de pose, #4821) reste rasterisable — sa pose est une
transformation de la couche, pas un redessin de son contenu.

Le lot du GIF collé a ajouté, **plus haut dans la même fonction**, une branche qui pose une
`CAKeyframeAnimation` sur `contents`. Elle retire la rasterisation elle-même — le code d'origine le
faisait déjà, pour le chemin asynchrone. Mais sur le chemin SYNCHRONE, la ligne de queue s'exécute
**après** : elle remettait `shouldRasterize` à `true`, et le GIF se figeait sur son cache de
première image. Rien n'échouait. Aucune erreur, aucun avertissement, une image à l'écran.

> **Une ligne qui s'exécute en queue de fonction gouverne tout ce que le corps a fait avant elle.**
> Ajouter une branche dans un `if/else if` ne suffit pas : il faut relire ce qui court APRÈS le
> `else`, et se demander lequel de ces réglages contredit la branche neuve. L'inverse — écrire la
> branche et vérifier qu'elle est juste — passe au vert et livre la panne.

Le correctif n'est pas de retirer l'optimisation mais de lui donner sa troisième condition, et de
DIRE dans le code qu'elle n'est pas décorative : `&& !playsAnimatedContents`.

**La forme générale.** C'est la jumelle de la leçon 275 (« ce qui part À CÔTÉ de ce qu'on vient de
garder »), tournée dans le temps plutôt que dans l'espace : là on demandait *que transporte cette
charge en plus de ma chaîne ?*, ici on demande **quelles lignes s'exécutent après la mienne et
défont ce qu'elle vient de poser ?** Les deux se répondent en lisant l'objet — ou la fonction —
jusqu'au bout, jamais en relisant le fragment qu'on vient d'écrire.

Sites : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift`
(`configure` et `stampAnimated`). Témoin : `AnimatedStickerChainGuardTests` §
« la couche a une branche synchrone animée ».
