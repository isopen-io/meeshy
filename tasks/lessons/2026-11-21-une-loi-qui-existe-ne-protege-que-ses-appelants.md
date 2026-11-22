## Une loi qui existe ne protège que ses APPELANTS — et le second site réécrit la question au lieu de l'appeler

**Date** : 2026-11-21. **Lot** : cycle 209, #20264. **Famille** : « combien de
sites de PRODUCTION appellent ce helper ? » (cycle 123 bis), vue depuis le site
qui ne l'appelle PAS.

### Le fait

`viewer.id` porte un `User.id` pour un compte et un `Participant.id` pour un
visiteur de lien. `selfSenderOf` (`apps/web/src/lib/view/self-sender.ts`) le
sait depuis #10120 et résout les deux colonnes. **À la ligne PRÉCÉDENTE de son
appel**, le fil cherchait la ligne du lecteur à la main, sur la seule colonne
`userId` :

```ts
const viewerParticipant = useMemo(() => conversation?.participants.find((p) => p.userId === viewer.id), …);
const composerAccess = useComposerAccess({ …, rights: viewerParticipant?.permissions });
const selfSender = useMemo(() => selfSenderOf({ participants: conversation?.participants, viewer }), …);
```

Jamais trouvée pour un invité ⇒ `rights: undefined` ⇒ `Composer` lit « tout est
autorisé » (son contrat le dit) ⇒ les tuiles que l'hôte venait de retirer
s'offraient encore, et le geste échouait au serveur.

### La leçon

> Une loi juste ne protège que les sites qui l'APPELLENT. Le dépôt sait compter
> les appelants d'un helper ; ce qu'il faut savoir en plus, c'est que **le site
> fautif ne ressemble pas à un site qui a oublié la loi : il ressemble à un site
> qui a résolu le problème lui-même.** Une ligne de `find` écrite à la main n'a
> l'air de rien — surtout à côté d'un appel correct, qui donne au lecteur
> l'impression que la question est traitée.

Et **une absence interprétée généreusement rend le défaut muet** : une ligne
introuvable ne dit pas « aucun droit », elle dit « je n'ai pas lu ». Le composeur
a raison de ne pas fermer sur une ignorance ; c'est ce choix juste qui fait
qu'une résolution ratée ne rougit nulle part.

### Ce qu'on fait

- **La réparation est une LOI, pas un second `find` correct** : une fonction
  nommée, et l'autre consommateur devient sa PROJECTION (ici le nom donné par
  l'invité, qui est une affaire de composition, pas d'identité).
- **La garde est de SOURCE.** Un témoin de comportement sur la loi PASSE,
  puisque la loi est juste ; seul un témoin qui interdit la seconde orthographe
  (`participants.find((p) => p.userId === …)` dans l'écran) attrape la classe.
- Devant deux lignes voisines qui désignent le même sujet, demander : **est-ce
  la même résolution ?** Deux façons de reconnaître le même lecteur dans le même
  composant est le signe, et il se lit à l'œil nu une fois qu'on le cherche.
