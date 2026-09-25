## Leçon 362 — Une erreur avalée en résultat VIDE est indiscernable d'un vide légitime

**Le fait.** La bande de suggestions `@` du composer ne paraissait sur aucun des trois champs
de saisie, au simulateur. Deux hypothèses plausibles ont été formulées — un correctif qui ne
prenait pas, un compte sans ami accepté — et **les deux étaient fausses**.

La production sert un commit qui **ignore tout le module `/directory/*`** :

```
GET https://gate.meeshy.me/health → build.commit = 9e5f7024d7   (2026-08-29)
git cat-file -e 9e5f7024d7:services/gateway/src/routes/directory/friend-requests.ts
→ ABSENT du commit déployé
```

`ComposerMentionFriendsSource.acceptedFriends()` appelle la NOUVELLE adresse, reçoit un
**404**, et son `catch { return [] }` le rend comme « aucun ami accepté ».

> **Le silence est correct à chaque étage.** Le service rend une liste vide, ce qui est un
> résultat légitime ; la vue ne peint rien, ce que la loi 8 lui prescrit précisément pour un
> vide. Aucun des deux ne ment. La feature est morte et rien ne le signale — parce que
> **« je n'ai rien trouvé » et « je n'ai pas pu chercher » arrivent par le même canal.**

**Ce que ça dit d'un `catch { return [] }`.** Ce n'est pas une tolérance, c'est une
CONVERSION : elle transforme une panne en donnée. Le repli doit distinguer les deux —
« vide » et « injoignable » sont deux états, et seul l'appelant sait ce qu'il en fait (la
loi 8 gouverne le premier, elle ne dit rien du second). Même famille que
[[reference_fabricated_fallback_hides_dead_reads]] et que la tolérance réglée chez
l'appelant.

**Ce que ça dit d'un DÉMÉNAGEMENT d'adresse.** Un client peut migrer vers une route neuve
sans qu'aucun gate ne rougisse : les tests du client appellent la nouvelle, ceux du serveur
la déclarent, et personne ne compare les deux CONTRE LE DÉPLOYÉ. Une garde utile
comparerait les adresses appelées par les SDK aux routes déclarées par la passerelle ;
aucune ne peut vérifier ce qui tourne réellement en production.

**La recette d'ops qui tranche en deux commandes**, et qui vaut d'être connue avant de
suspecter le client :

```sh
curl -s https://gate.meeshy.me/health   # → build.commit
git cat-file -e <sha>:<chemin/du/fichier>   # existait-il dans le déployé ?
```

C'est le chemin le plus court entre « ça ne marche pas en prod » et « ça n'y est pas
encore ». Détail : #4529.
