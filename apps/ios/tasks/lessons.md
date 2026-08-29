- **Un balayage qui cherche un objet par UN de ses noms d'emprunt rend un zéro
  qui veut dire « je n'ai pas regardé là » (256i).** J'ai mesuré que
  `ConversationStateStore` — 35 propriétés, 34 homonymes du ViewModel — n'était
  lu par PERSONNE, et j'allais ouvrir une issue proposant de retirer son miroir
  `messages` (une souscription Combine vivante sur le chemin le plus chaud de
  l'app). **C'était faux** : les handlers détiennent le store sous
  `private let state:` et le lisent en `state.X`, motif que mon regex
  (`stateStore.` / `store.`) ne couvrait pas. `ConversationMediaHandler` lit
  bien `state.messages`.
  > **Avant de publier un zéro, chercher l'objet par son TYPE, pas par le nom
  > qu'on suppose à sa variable.** Le coût de l'erreur n'était pas symétrique :
  > un faux positif fait perdre une revue, ce faux zéro-ci proposait de
  > supprimer du code qui MARCHE, avec une mesure à l'appui pour convaincre.
- **Un échafaudage de migration se reconnaît à son commentaire, et se
  RESPECTE.** Le store porte « Removed once the migration … is complete » : ce
  n'est pas de la duplication accidentelle mais un plan en cours, dont la fin
  est écrite. Le supprimer ou le recâbler unilatéralement, c'est jeter le
  travail de quelqu'un — et c'est architecturalement significatif, donc cela se
  remonte, jamais cela ne se décide seul.
