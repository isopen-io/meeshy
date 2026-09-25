## Leçon 556 — Deux signaux qui partagent leur MÉCANIQUE ne partagent pas leur SURFACE

Même lot. `docs/product/streaks-badges-modele.md` définit quatre notifications
de réengagement et dit, § 1 : *« Les quatre partagent la même mécanique de bas
niveau et ne diffèrent que par la fonction qui décide "ce seuil est-il
franchi ?" »*. Vrai — et incomplet d'une manière qui a coûté la feature.

Le porteur a tranché autre chose : **un succès se CÉLÈBRE (vue plein écran, sans
qu'on touche rien), un badge / une série / un niveau se NOTIFIENT**. Un succès
nomme un fait rare et non répétable ; les autres tombent au fil de l'usage.
Les célébrer tous ferait de la célébration un bruit, et le premier bruit qu'on
apprend à ignorer est celui qui devait faire plaisir.

Cette décision ne se déduit d'aucun champ, d'aucun type, d'aucune contrainte
technique — c'est une décision de PRODUIT, et le document qui gouverne la
sémantique ne l'énonçait nulle part. D'où un code où `announcingTypes` mélange
les quatre, et une célébration branchée sur le seul tap.

> Quand un document déclare que N choses « ne diffèrent que par X », se demander
> **par quoi d'autre elles pourraient différer côté UTILISATEUR** — la surface,
> l'urgence, l'interruption, la persistance, qui peut les voir. Un axe de
> variation absent du document n'est pas un axe absent du produit : c'est un axe
> que chaque site tranchera dans son coin, différemment.

Site unique désormais : `EngagementReveal.celebratesUnprompted`, et la table du
§ 1 du modèle qui dit, pour chacun des quatre types, ce qui se passe au geste et
ce qui se passe au tap.
