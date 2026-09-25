## Leçon 85 — Un correctif juste sous les deux hypothèses n'attend pas la preuve de l'hypothèse (2026-08-10, routine messaging, cycle 58)

La prémisse du cycle 57 — « sur MongoDB, `deletedAt: null` n'apparie pas une colonne absente » — est
invérifiable dans cet environnement : aucun démon Docker, donc aucune vraie base. La leçon 75 dit
qu'un double Prisma ne peut PAS trancher un prédicat, et elle a raison ; j'ai donc passé un moment à
chercher comment prouver la prémisse avant de corriger.

C'était la mauvaise question. La bonne : **le correctif dépend-il de l'hypothèse ?** Écrire
`deletedAt: null` apparie `deletedAt: null` sous les deux sémantiques — si l'absence appariait aussi,
le correctif est un no-op inoffensif ; sinon il répare un défaut réel. L'incertitude ne porte que sur
l'AMPLEUR du défaut d'origine, jamais sur la validité de sa réparation.

**Règle** : face à une prémisse non vérifiable ici, séparer deux questions que la prudence a
tendance à fusionner — « qu'est-ce que je sais ? » et « qu'est-ce que mon correctif suppose ? ».
Quand le correctif est correct sous toutes les branches de l'incertitude, la livrer et ÉCRIRE
l'incertitude dans le relevé est supérieur à attendre une preuve qui ne viendra pas de cet
environnement. Quand il n'est correct que sous une branche, la leçon 75 reprend la main : ne rien
livrer sans base réelle.

Le corollaire de rigueur : l'incertitude doit être écrite là où le prochain cycle la lira (relevé +
ADR), et jamais présentée comme un fait établi. Ce cycle s'appuie sur trois indices convergents —
le post-mortem de `postIncludes.ts`, sa reconfirmation par le cycle 54, et le fait que six créateurs
sur sept écrivent une colonne qui n'aurait aucune raison d'être écrite si le filtre appariait
l'absence — et cela reste trois indices, pas une mesure.
