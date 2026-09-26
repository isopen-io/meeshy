## Leçon 211 — un correctif atomique ferme la branche qu'on regardait, pas les autres branches du même `if` (2026-08-16, routine temps réel, cycle 52)

**Ce que j'ai trouvé.** `LastMessageFacet` a été créée pour rendre impossible
une classe de défauts nommée dans son propre en-tête : « un chemin temps réel
qui pose le texte et l'horodatage sans toucher au reste laisse la ligne décrire
un MÉLANGE de deux messages ». Le défaut refermé au cycle 52 est **exactement
ce paragraphe**, vivant à deux mètres — dans la branche `else` du MÊME `if` dont
la branche `if` avait été fermée par la facette.

Le témoin qui couvrait la branche fermée (`test_bumpToTop_resetsStaleCompanionFields`)
énonce même toute la règle dans son commentaire, en deux temps (P1 : l'auteur,
les pièces jointes, les drapeaux ; P2 : le texte et le Prisme, ajoutés après
qu'une première correction incomplète eut « régressé le bug vers une forme plus
subtile »). Tout était su. Rien ne l'appliquait à côté.

**Pourquoi la branche voisine est passée entre les mailles.** Elle n'a pas été
écrite pour ce cas : elle traitait les mises à jour de MÉTADONNÉES (renommage,
avatar), où aucun message n'est nommé et où la question ne se pose pas. Le
chemin recalculé (`previewRecalculated`) est venu s'y greffer plus tard, en
héritant d'une application champ par champ qui était correcte pour son
occupant d'origine.

**La règle.** Quand un correctif introduit un geste ATOMIQUE pour un groupe de
champs, la question à poser n'est pas « ai-je corrigé l'appelant ? » mais
**« quels sont TOUS les écrivains de ce groupe ? »**. Un `grep` sur le champ le
plus caractéristique du groupe (ici `lastMessageId =`) coûte trente secondes et
répond exactement. Il a livré, au cycle 52, un **troisième** site que personne
ne cherchait — `recomputeLastMessagePreviewAfterDeletion`, qui écrivait quatre
champs à la main alors qu'il tenait le message tout entier, et dont la branche
jumelle avait été corrigée trois cycles plus tôt.

**Le corollaire qui borne le geste.** Un geste « remet à neutre » doit avoir une
condition d'inaction explicite, et c'est elle qui décide s'il est un correctif
ou une régression. Ici : l'identité inchangée (édition, traduction) ⇒ no-op,
parce que le payload tait ces champs **parce qu'ils n'ont pas changé**, pas
parce qu'ils ont disparu. Le témoin de la contre-épreuve — « éditer une légende
ne retire pas la photo qu'elle légende » — vaut autant que celui du défaut : sans
lui, le correctif dépouille la ligne à chaque frappe.

**Généralisation.** « Silence du payload » a deux lectures — *inchangé* et
*inconnu* — et seule l'IDENTITÉ de l'objet décrit permet de les séparer. Même
objet ⇒ inchangé ⇒ conserver. Autre objet ⇒ inconnu ⇒ remettre à neutre. C'est
le même raisonnement que le tri-état de la leçon 208, un cran plus haut : là il
fallait distinguer absence et nullité D'UN champ, ici il faut distinguer ce
qu'un champ absent dit selon que l'objet décrit a changé ou non.
