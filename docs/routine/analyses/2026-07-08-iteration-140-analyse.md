# Iteration 140 — Revue d'ingénierie (2026-07-08) — surface pure/helpers saine, aucun défaut actionnable

## Protocole (démarrage)
`main` @ `8e91bfb` (dernier merge PR #1656, iter 139). Branche `claude/brave-archimedes-hus6dh` recréée
depuis `origin/main`. Ce cycle prend **140**.

## Objet
Après trois fixes ciblés dans le même run (F101 clicksByHour UTC #1654, F103 formatFileSize Ko→Mo #1655,
F105 snapToScale wrap d'octave #1656), revue d'ingénierie fan-out **exhaustive** de la surface *fonctions
pures / helpers isolés* pour identifier le prochain défaut **prouvable ET visible en production** (barre
haute : rejet de tout candidat masqué par un invariant, du code mort, ou à sortie correcte).

## Périmètre revu (~45 fichiers)
`packages/shared/utils/**` (conversation-helpers, languages, validation, mention-parser, time/duration
formatters, call-summary, etag, presence-visibility), `packages/shared/types/**` (mention, messaging,
attachment), `services/gateway/src/utils/**`, `apps/web/lib/**`, `apps/web/utils/**` (hors audio-effects
déjà corrigé).

## Résultat : aucun candidat ne franchit la barre
Le code est **fortement durci** par 130+ itérations antérieures. Les helpers temporels à `now` injecté
(`formatClock`, `classifyRelativeTime`, `formatTimeRemaining`, `calendarDayDiff`, `isExpired`), les helpers
string/number (`formatCompactNumber`, `truncateFilename`/`truncateText`, `getInitials`, `capitalizeName`),
les validateurs (`isValidEmail`, `validatePagination`/`buildPaginationMeta`, `normalizeLanguageCode`,
résolution téléphone/mention/langue) et la logique call-summary/etag/presence sont **corrects sous les
invariants de production**. Aucun input production-reachable ne produit une sortie prouvablement fausse.

## Candidats instruits puis REJETÉS (traçabilité, pour ne pas les ré-instruire)
- **`mention-parser.hasMentions` (charset Unicode) vs `parseMentions`/`extractMentions` (`@username` ASCII
  `[\w-]`)** : `hasMentions('@josé')` → `true` mais `parseMentions` → `[]`. **Rejeté (non visible)** : les
  usernames sont ASCII par validation (`/^[a-zA-Z0-9_-]+$/`) ; `hasMentions` ne fait que *sur-signaler* une
  présence pour un handle non-ASCII ne matchant aucun participant → 0 notification en aval. Sortie correcte,
  travail gaspillé.
- **`MessageValidator.checkRegisteredUserPermissions` `restrictions.maxAttachments: 100` vs
  `validateRequest` cap `> 10`** : divergence réelle MAIS `checkPermissions`/`restrictions` **n'est
  consommé nulle part en production** (grep confirmé : seul `validateRequest` s'exécute ; `restrictions`
  n'est lu ni gateway, ni web, ni iOS). Confirme le constat iter-135. **Rejeté (code mort en prod).**
- **`initials.ts` ZWJ emoji nom mono-mot** : `[...parts[0]].slice(0,2)` sur `"👨‍👩‍👧‍👦"` → `['👨','‍']`.
  **Rejeté (bénin)** : le cas porteur (surrogate pairs) est déjà corrigé ; le ZWJ traînant est invisible
  (rend `👨`) ; input dégénéré.
- **Code mort sans impact** : `link-name-generator.ts:22` `MAX_LINK_NAME_LENGTH = 32` déclaré/inutilisé (la
  fonction clampe à 60) ; `types/mention.ts:375` `MENTION_DISPLAY_REGEX` (sans borne gauche) exporté mais
  non référencé en prod (`MentionService` utilise `MENTION_REGEX` borné) ; `user-status.ts:48-49` branches
  identiques `if (<30) 'away'; return 'away'` (redondance, sortie intentionnelle correcte).

## Backlog / prochaines pistes (nécessitent mock Prisma léger — hors barre « fonction pure »)
- **F108** : `MessageValidator` — supprimer le code mort `checkPermissions`/`checkRegisteredUserPermissions`
  (non atteignable en prod, source de la fausse divergence de cap) OU le câbler + aligner le cap sur 10.
  Décision d'architecture (garder l'API interne ?) → à trancher.
- **F107** (report, ré-évalué **faible**) : `user-stats.ts` + `admin/messages.ts` daily-timeline. Sous
  `TZ=UTC` (prod), le « jour en trop » requêté est correctement exclu des N buckets → **sur-fetch** (I/O
  gaspillée), pas de compte visiblement faux ; le mismatch TZ local/UTC est masqué comme F101. Nettoyage de
  cohérence low-value, pas un bug visible.
- **F106** : `user-status.ts:getUserStatus` — sémantique `away` vs `offline` >30 min (décision produit).
- **F102** : `attachment.ts:formatFileSize` (fenêtre étroite `1024.00 KB`, surface web large).
- **F100 / F98 / F90** (report).

## Conclusion
La surface *fonctions pures* est saine. Le prochain gisement de qualité se trouve dans les **services
métier à I/O** (MessagingService, MessageValidator dead-code, timelines route) qui exigent un mock Prisma
léger plutôt qu'un test unitaire pur — cible des itérations suivantes. Aucun changement de production dans
cette itération : préserver la stabilité prime sur forcer un fix marginal (« Never merge code that
decreases product quality »).
