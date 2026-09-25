## Leçon 465 — Une table qui n'est pas EXPORTÉE n'est la table de personne : la seconde surface la réécrit, et le même message a deux formes selon son chemin d'arrivée

**Le fait (2026-09-02, revue croisée de l'écran `rich`, #4835).** Le critère de
fin demandait « UN composant dérivant du TYPE du message, aucune branche
dupliquée, AUCUN SECOND RÉSOLVEUR ». `FORME_PAR_GENRE` — la table qui dit, par
genre de pièce jointe, quel glyphe et quel lecteur — était déclarée `const` NON
exportée dans `app/connecte/fil-lignes.ts` : elle n'était la table que du rendu
SERVI. Quatre autres sites réécrivaient la même règle en comparaisons littérales
de genre — le peintre du temps réel (`piece.genre !== 'audio'`, quatre
endroits), `lib/api/fil.ts` (« quel genre a une piste traduite »), `lib/poids.ts`
(« quel genre a une durée »). Donner un lecteur à un genre neuf changeait la
ligne SERVIE sans changer la ligne PEINTE : le même message avait deux formes
selon qu'il arrivait par le document ou par le socket, et il fallait recharger
pour voir son lecteur.

> **Une table non exportée n'a pas une source, elle en a autant que de
> surfaces.** Le témoin qui l'attrape n'interroge pas la table mais ses DEUX
> rendus : *pour chaque entrée de la table, la ligne servie et la ligne peinte
> montent-elles le même jeu d'éléments ?* Écrit sur un seul genre, il reste vert
> — c'est la leçon 261 appliquée à une énumération : le témoin se pose sur ce que
> la table ÉNUMÈRE, pas sur le cas qu'on avait sous les yeux.

Quatre voisines du même lot, toutes de la forme « le résolveur est juste, sa
valeur n'atteint pas le lecteur » (cycle 122) :

1. **L'aperçu d'une réponse servait l'ORIGINAL** pendant que la bulle citée,
   deux lignes plus haut, affichait sa traduction — deux textes pour un même
   message, sur le même écran. Rien ne manquait au document : `replyToId` pointe,
   dans le cas nominal, un message de la MÊME tranche, dont les traductions sont
   servies. La traduction n'était pas CHERCHÉE. **Un aperçu de citation se lit
   dans la PAGE avant de se lire dans la charge.**
2. **La garde de protection d'un message cité était MORTE sur REST et VIVANTE
   sur le socket** : le `select` de `replyTo` ne demande aucun des drapeaux, le
   `include` du socket les fait tous voyager. Une réponse à un message à vue
   unique arrivait avec sa mention et affichait le texte EN CLAIR après un F5 —
   et le témoin qui prétendait la gager donnait une charge de forme SOCKET à une
   règle qui garde le chemin REST (leçon 261 encore). **Quand la cible est dans
   la page, c'est la BULLE qui juge : les deux chemins deviennent identiques sans
   rien attendre du serveur.**
3. **Une pastille « Sous-titres fr » PROMETTAIT une piste que le `<video>` ne
   porte pas** — la passerelle n'expose aucun WebVTT. Le Prisme ANNONCÉ sans
   être APPLIQUÉ (cycle 123), et le témoin n'assertait que le TEXTE du badge : il
   ne pouvait pas voir qu'il mentait. **Un témoin d'annonce se pose sur l'EFFET
   (la présence d'un `<track>`), jamais sur le libellé.**
4. **Un vocal traduit n'annonçait RIEN** : la pastille de langue et « Voir
   l'original » étaient conditionnées au TEXTE du message, `null` sur un message
   dont le vocal est le seul contenu. Toute l'interface du Prisme disparaissait
   là où la traduction était la seule chose à annoncer.

Et une cinquième, de forme opposée — **le module qui repeint CONTREDISAIT le
document** : l'état relu (`bullesDuDocument`) ne reconstruit pas les pièces
(`pieces: []`), si bien que le premier `audio:transcription-ready` d'un vocal
DÉJÀ SERVI tombait dans la branche d'adoption, estampillait l'empreinte neuve et
rendait sans rien peindre — la transcription n'apparaissait jamais et le lecteur
continuait d'entendre la piste originale. **Un peintre ne retire que sur une
PREUVE : quand son état ne porte pas ce que le document porte, il n'a rien à
dire, et se taire est la bonne réponse.** Sites : `apps/web-v3/lib/api/formes.ts`
(la table, exportée), `lib/api/citations.ts` › `citationsDeLaPage`,
`lib/api/fil.ts` › `annonceDuPrisme`, `lib/realtime/fil-peinture.ts` ›
`remplisLesPieces` / `piecesConnues`.
