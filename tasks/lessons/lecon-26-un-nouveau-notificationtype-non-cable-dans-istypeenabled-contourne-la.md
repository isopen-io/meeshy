## Leçon 26 — Un nouveau `NotificationType` non câblé dans `isTypeEnabled` contourne la préférence via `default:true` (F59, it.97)
`isTypeEnabled(prefs, type)` mappe chaque `NotificationType` → son champ booléen de préférence. Son
`default: return true` est destiné aux types système/toujours-actifs (`login_new_device`,
`translation_ready`…). **Piège** : quand on ajoute un nouveau type gouverné par une préférence
utilisateur existante et qu'on oublie de l'ajouter au `switch`, il tombe silencieusement sur
`default:true` — il IGNORE l'opt-out utilisateur. C'était le cas de `comment_reaction` (chemin socket)
alors que son sibling REST `comment_like` était bien gaté sur `commentLikeEnabled`. Résultat : couper
« like de commentaire » n'éteignait que le REST, la réaction socket passait quand même.

**Règle réutilisable** : deux chemins/transports du MÊME geste produit (ici réagir à un commentaire)
DOIVENT honorer la même préférence. À chaque nouveau type de notif, se demander « quelle préférence
existante le gouverne ? » et l'ajouter explicitement au `switch` — ne jamais le laisser au `default`
sauf s'il est intentionnellement toujours-actif (sécurité/système). Audit rapide : lister l'union
`NotificationType` et cross-check vs les `case` — les types tombant sur `default` doivent être
soit système, soit sans champ de préférence à créer (décision produit), jamais un type qui a déjà un
toggle câblé pour son sibling.
