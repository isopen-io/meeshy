## Une RÉTRACTATION est une affirmation, et se mesure comme celle qu'elle retire (cycle 163, #18641, #18644, #18660)

Au cycle 163, j'ai diagnostiqué quatre témoins rouges de `call-captions-panel.test.tsx`
par une fuite du magasin des phrases révélées (`call-captions-unfold-store.ts`,
singleton de module). Puis je me suis rétracté, sur deux arguments :

1. « les identifiants `call-1` / `w-1` sont LOCAUX au fichier — aucun autre ne
   les nomme, donc une fuite inter-fichiers est exclue par construction » ;
2. « les deux témoins qui révèlent quelque chose s'exécutent APRÈS les deux qui
   tombent ».

**Le premier argument était faux, et je ne l'avais pas mesuré.** Une commande
d'une ligne — `grep -rln "'call-1'" apps/web/src --include=*.test.tsx` — rend
huit fichiers. `call-screen-pill-text.test.tsx` monte le panneau avec
`callId: 'call-1'`, des sous-titres et `captionsMode: 'translated'`, et touche
une phrase : il la laisse RÉVÉLÉE pour tout le processus. Le second argument
était vrai et sans portée, puisqu'il ne répondait qu'à la fuite INTRA-fichier
que le premier venait d'exclure à tort.

#18660 a posé le remède exact que ma première hypothèse appelait — un
`beforeEach` qui vide le magasin — en NOMMANT le fichier fautif. **Le diagnostic
retiré était le bon ; c'est la rétractation qui était fausse.**

**Ce qui rend ce défaut-là particulier**, et pourquoi il faut l'écrire : une
rétractation se présente comme un acte de rigueur. Elle a l'odeur de la prudence,
donc personne ne lui demande ses preuves — surtout pas celui qui la rédige, qui
vient de se féliciter d'avoir corrigé une affirmation trop sûre. J'ai retiré un
diagnostic CORRECT en m'appuyant sur une assertion que je n'avais pas vérifiée,
dans le même lot où j'écrivais qu'« un mécanisme est une affirmation, et se
vérifie ».

**La règle.** Avant de retirer un diagnostic, lui appliquer exactement ce qu'on
exigerait de lui : la commande qui le réfute, écrite et jouée. « Aucun autre
fichier ne nomme cet identifiant » est un `grep`, pas une intuition — et un
`grep` qu'on n'a pas lancé ne prouve rien, dans aucun sens. Le coût d'une
rétractation fausse est plus élevé que celui de l'affirmation qu'elle corrige :
elle ferme une piste JUSTE, et elle le fait avec l'autorité de l'humilité.

Corollaire, mesuré trois fois dans le même lot : **ce n'est pas l'assurance qui
fait l'erreur, c'est l'absence de mesure.** J'ai affirmé trop fort (le mécanisme,
puis « ajouter deux témoins rougit » posé en loi quand c'était une fréquence),
puis nié trop fort. Les trois fois, la commande qui tranchait tenait sur une
ligne et n'avait pas été tapée.
