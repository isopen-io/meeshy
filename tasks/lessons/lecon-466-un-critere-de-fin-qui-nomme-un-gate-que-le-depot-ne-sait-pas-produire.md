## Leçon 466 — Un critère de fin qui nomme un gate que le dépôt ne sait pas produire n'est ni tenu ni réfutable — et le mauvais obstacle envoie le correctif au mauvais endroit

**Le fait (2026-09-02, même revue).** Le critère de fin de #4835 exigeait « diff
par région contre `cible/rich.png` ≤ 8 %, IoU ≥ 0,92, 100 % des icônes rendues,
quatre colonnes de thème ». Deux choses, toutes deux à dire à voix haute :

1. **Le gate n'existe pas.** `e2e/visual/v3-visual.spec.ts`, que le § 9.6 nomme
   comme producteur de ces quatre chiffres, n'est pas dans le dépôt ;
   `compare-rendu.js`, l'outil réellement disponible, rend un écart STRUCTUREL
   (profil d'encre, seuil 0,15) et un `pixels_indicatif` — pas les mêmes mesures,
   pas le même seuil. TOUS les écrans livrés l'ont été sans lui.
2. **L'obstacle invoqué était le mauvais.** Le rapport disait « `rich` n'est pas
   sélectionnable : elle partage sa route avec `thread` ». Faux deux fois :
   `vues.json` la déclare sur `/chats/:id`, distincte du `/chats/:cle` de
   `thread`, et `selectionComparable` retenait déjà les deux sans un refus. Le
   blocage réel était (a) l'absence d'ÉTAT DE SESSION pour `compare-rendu.js`,
   commun à TOUTE la famille du membre et déjà documenté (§ 12.8), et (b)
   l'absence de conversation adressable derrière le jeton dans la passerelle
   PARTAGÉE — la donnée existait, raccordée à l'instance éphémère d'un seul spec.

> **Nommer le mauvais obstacle coûte plus qu'un silence : il envoie le correctif
> au mauvais endroit et fait croire qu'aucun travail n'était possible.** Avant
> d'écrire « impossible », lancer la sélection : `selectionComparable` répond en
> une commande, sans serveur. Et quand un gate est injouable, la question n'est
> pas « comment l'éviter » mais **« qu'est-ce qui, précisément, l'empêche — et
> est-ce le même empêchement pour ses voisins ? »** : ici il l'était, et le lever
> a débloqué `thread`, `join`, `rights` et `rich` d'un seul geste.

Deux formes du même piège dans le même lot : `compare-rendu.js` lancé contre un
`next start` NU (sans passerelle) rendait « Le service ne répond pas » et
mesurait l'écran de panne contre la cible d'un fil — `structure=0,54` sur un
code conforme ; et le runner qui monte la chaîne appelait `spawnSync`, ce qui
BLOQUAIT la boucle d'événements du processus qui HÉBERGE la passerelle de
bouchon, produisant exactement la même panne. **Un chiffre rendu par un harnais
qui ne sert pas la page mesure le harnais.** Sites :
`docs/product/MeeshyWebV3Design/jetons-de-vues.json` (bloc `sessions`),
`apps/web-v3/scripts/lib/index-des-vues.mjs` › `sessionsInconnues`,
`apps/web-v3/scripts/conformite-des-vues.ts`, issue #4910.

---
