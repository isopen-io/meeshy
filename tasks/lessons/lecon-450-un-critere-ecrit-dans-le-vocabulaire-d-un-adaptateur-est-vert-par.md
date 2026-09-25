## Leçon 450 — Un critère écrit dans le vocabulaire d'un adaptateur est vert par vacuité sur la porte qu'il gate

**Le fait (2026-09-02, livraison de `join`, #4522).** Le critère de fin de
l'écran, le § 6.3.A de la conception et la charte (règle 20) nommaient « les
sept refus » : `403 REQUIRES_ACCOUNT`, `429 MAX_CONCURRENT_USERS`, `410
LINK_MAX_USES`… Les témoins jest et la passerelle de bouchon les rejouaient
fidèlement, et tout était vert. Or la porte que la v3 appelle — `POST
/links/:key/members`, la seule que le § 12.3 retienne — émet SIX codes
d'admission (`linkAdmission.ts:112-118`), et **`REQUIRES_ACCOUNT` comme
`MAX_CONCURRENT_USERS` ne sont émis par AUCUNE route du gateway** : `grep`
sur `services/gateway/src` ne les trouve que dans des commentaires. La liste
décrivait l'adaptateur `POST /anonymous/join/:linkId` d'AVANT #4167, dont
`410 LINK_MAX_USES` et `429 MAX_CONCURRENT_USERS` ont fusionné en `409
LINK_EXHAUSTED` (`routes/anonymous.ts:238-239`).

Ce que ça cassait vraiment n'était pas cosmétique : `refusGardeLeFormulaire`
tranchait sur le STATUT (« 409 ⇒ le pseudo est pris, on ressaisit »), donc
un vrai `409 LINK_EXHAUSTED` aurait peint « ce lien a atteint son nombre
d'entrées » comme une erreur de PSEUDO, formulaire ouvert, et le visiteur
aurait ressaisi en boucle un lien plein.

> **Une liste de codes dans un critère porte deux affirmations : « voilà ce
> qu'on peint » (vérifiable) et « voilà ce que la porte émet » (jamais
> vérifiée). La seconde se relit dans l'ÉMETTEUR, pas dans le document — et
> quand deux portes parlent deux vocabulaires pour le même lien (l'aperçu
> dit `LINK_MAX_USES`, la jonction `LINK_EXHAUSTED`), c'est le code, jamais le
> statut, qui dit si l'on ressaisit ou si l'on referme.**

C'est la leçon 422 (« un bouchon copie une LOI, pas une réponse ») portée un
cran plus haut : ici la loi était copiée juste — le bouchon rejouait ce qu'on
lui dictait — mais ce qu'on lui dictait venait d'un document, pas du code. Le
remède a trois faces : le bouchon produit ses refus depuis l'ÉTAT du lien
(`passerelle.lien`, la séquence d'`admitLinkEntry` dans son ordre) et non
depuis un code injecté ; la table des phrases ne connaît que des codes qu'une
route émet (un témoin l'affirme : `REQUIRES_ACCOUNT` absent) ; et le document
qui portait la liste dit désormais d'où elle venait (§ 6.3.A encadré, § 12.9).

Deux voisines du même lot, de la même forme « la donnée arrive, personne ne la
consomme » (leçon 421) : l'aperçu servait `requireEmail` / `requireBirthday`
et la porte refusait 400 sans eux — la modale ne les demandait pas ; et
`allowedIpRanges` est jugé sur `request.ip`, que la v3 — qui poste depuis son
SERVEUR, là où le legacy poste depuis le navigateur — présentait comme celle
du conteneur. La question qui attrape les trois est la même : **pour chaque
champ que la porte LIT, qui le lui FOURNIT, et depuis quel bord ?**
