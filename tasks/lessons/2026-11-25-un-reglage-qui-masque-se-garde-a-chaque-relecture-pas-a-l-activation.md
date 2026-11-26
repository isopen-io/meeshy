## 2026-11-25 — Un réglage qui masque se garde à chaque relecture, pas seulement à l'activation (#20567)

### Ce qui s'est passé

`MenuActsRingStore` (iOS) recevait « Jeu masqué » par `activate(hidden:)` : masqué, il publiait `.hidden` au widget
« Ma Flamme » et vidait l'anneau. Mais ses abonnements (écriture du cache, retour au premier plan), posés à une
activation précédente, restaient vivants, et `readCache()` ne savait rien du réglage : il relisait le cache et
republiait la Flamme du joueur. Masquer le Jeu puis revenir dans l'app rallumait le widget de l'écran d'accueil.
L'anneau ne se voyait pas, seulement parce que la vue le masquait une seconde fois ; le widget, lui, n'a pas de vue
pour le rattraper. Le défaut est sorti en rendant le widget indépendant de la racine iPhone : sur iPad, aucune vue
n'aurait masqué quoi que ce soit.

### La règle

- Un état qui MASQUE (« Jeu masqué », compte sortant, conversation chiffrée) se garde dans CHAQUE chemin qui relit,
  pas dans la seule méthode qui le reçoit. Un abonnement posé plus tôt survit au changement de réglage.
- Un masque posé deux fois (magasin, puis vue) cache le défaut du premier : le témoin se pose sur le magasin, avec une
  relecture APRÈS le masquage (`activate(false)`, `activate(true)`, puis `readCache()`).
- Un consommateur sans vue (widget, notification, Live Activity) n'a que le magasin pour se protéger.
