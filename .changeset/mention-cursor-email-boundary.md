---
"@meeshy/shared": patch
---

**`detectMentionAtCursor` — frontière gauche e-mail (shared).** Le détecteur de
mention sous le curseur renvoyait une mention pour n'importe quel `@` précédant le
curseur sans espace/retour à la ligne — y compris un `@` interne à une adresse
e-mail (`bob@alice`). C'était le seul chemin de mention où l'invariant
`NAME_BOUNDARY_LEFT` (SSOT `mention-parser`, déjà appliqué à `parseMentions`,
`hasMentions`, `extractMentions`, `mentionsToLinks` et `MENTION_REGEX`) manquait.

Conséquence observable : le composer d'**édition** (`EditMessageView`, qui appelle
la fonction partagée et ne garde que le charset via `isValidMentionQuery`) ouvrait
l'autocomplete de mention en tapant une adresse e-mail, là où le composer d'**envoi**
(`useMentions`, qui applique déjà `NAME_BOUNDARY_LEFT`) le supprimait correctement —
une divergence entre les deux composers.

Correction : `detectMentionAtCursor` applique désormais la même frontière gauche
`NAME_BOUNDARY_LEFT`. Un `@` collé après un caractère de nom (lettre/chiffre/`_`/`-`,
Unicode) n'ouvre plus de mention. Aucun changement de signature ni d'API.
