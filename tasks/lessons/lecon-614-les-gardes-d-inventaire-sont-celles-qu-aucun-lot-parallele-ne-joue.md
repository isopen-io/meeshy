## Leçon 614 — Les gardes d'INVENTAIRE sont celles qu'aucun lot parallèle ne joue : elles tombent à l'INTÉGRATION (2026-09-15)

**Mesuré** : après la fusion de dix branches parallèles dans `dev`, `Test gateway`
rouge — **4 suites, 5 témoins**, toutes des gardes d'inventaire, aucune de
comportement.

| garde | ce qu'elle mesure | ce qui l'a fait tomber |
|---|---|---|
| `gateway-file-size-budget` | un fichier hors budget n'a pas GROSSI | +14 lignes sur `MessageHandler.ts` (2336 → 2350) |
| `orphaned-sender-repair-surface-guard` | la liste des fichiers qui lisent `Message` | un fichier NEUF, absent de l'inventaire |
| `claude-md-paths-exist-guard` | les chemins cités par un `CLAUDE.md` existent | une adresse sur l'HÔTE distant, citée à raison |
| `recipient-language-projection-sweep` | tout appelant du cadrage charge les 4 colonnes | une forme que le balayage ne savait pas remonter |

**Pourquoi aucun worktree ne les avait vues.** Chaque lot joue le périmètre de SON
lot : ses suites de comportement, son typecheck. Une garde d'inventaire
n'appartient au périmètre de personne — elle mesure une SURFACE globale que seule
l'UNION des lots déplace. Ce n'est pas un défaut de la garde : c'est sa raison
d'être, et c'est pourquoi elle rougit à l'intégration et nulle part avant.

> **Le geste** : après une fusion multi-branches, avant de POUSSER, rejouer les
> gardes d'inventaire du dépôt — pas seulement le typecheck et les suites du
> périmètre touché. Un « périmètre touché » calculé branche par branche ne
> contient jamais l'effet de leur somme.

**Deux corollaires, payés le même jour.**

**(1) Un fichier hors budget se corrige par EXTRACTION, jamais par relèvement du
plafond** — et la bonne extraction est celle que le code réclamait déjà. Les deux
chemins socket refusaient une citation par douze lignes STRICTEMENT identiques
chacun ; la loi est partie chez elle (`citationRefusee` dans
`attachmentReplySnapshot.ts`), l'appelant n'a gardé que la décision. 2350 → 2336,
sans rien perdre, et la duplication a disparu au passage.

**(2) Un témoin qui ÉPELLE le nom d'un import rougit sur une extraction qui ne
change rien à la règle.** Celui de #6601 cherchait `import { admitAttachmentReply }`
et a accusé un renommage neutre. Le faire LIRE le nom délégué depuis l'import,
puis compter ses appels, lui garde le pouvoir d'accuser un RETRAIT sans punir une
extraction. Épreuve par neutralisation faite dans les deux sens (un appel
court-circuité en gardant le nom visible ⇒ rouge ; restauré ⇒ vert) — et il reste
ce qu'il est : un INVENTAIRE, jamais une preuve de comportement (leçon 611).
