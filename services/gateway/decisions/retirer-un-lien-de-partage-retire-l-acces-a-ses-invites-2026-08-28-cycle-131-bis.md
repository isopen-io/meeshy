## Retirer un lien de partage retire l'accès à ses invités (2026-08-28, cycle 131 bis)

**Contexte.** La porte d'entrée anonyme vérifie neuf propriétés du lien de
partage. Deux d'entre elles — `ConversationShareLink.isActive` et `expiresAt` —
ne décrivent pas l'instant de l'admission mais une DURÉE, et rien ne les
relisait après le premier pas : ni `middleware/auth.ts`, ni
`AuthHandler._authenticateAnonymousUser`, qui ne lisent tous deux que
`Participant.isActive`. Une seule route du dépôt portait la règle,
`POST /anonymous/session/refresh` (410 `LINK_DEACTIVATED` / `LINK_EXPIRED`),
si bien que le sort d'un invité après révocation dépendait de si son client
appelait ce rafraîchissement.

**Décision.** Retirer un lien — `PATCH /links/:linkId/toggle` à `false`,
`DELETE /links/:linkId` — **clôt l'appartenance de ses invités** :
`Participant.isActive = false` + `leftAt`, puis extinction (position vive, appel
en cours), sortie de la room du fil, invalidation des deux caches
d'appartenance, et coupure de la socket. Site unique :
`socketio/revokeShareLinkGuests.ts`, jumelle PLURIELLE de
`endConversationMembership`, qu'elle appelle plutôt que de recopier ses gestes.

**Ce que la décision NE change pas, et pourquoi.**

- **Le gel des permissions à l'entrée reste entier.** Les sept droits
  (`canSendMessages`, …, `canViewHistory`) sont figés à l'admission et l'assument
  (`routes/anonymous.ts`) : « on entre sous les conditions du MOMENT ».
  `isActive` et `expiresAt` ne sont pas des droits accordés à l'entrée — ils
  SONT la révocation, et deux routes le déclarent dans leur contrat OpenAPI.
- **Le bannissement ferme la porte sans vider la salle.** `ban.ts` désactive lui
  aussi le lien du banni et s'arrête là par décision écrite ; son intention est
  de retirer UNE personne, celle de `toggle(false)`/`DELETE` est de retirer le
  LIEN. `ban.ts` n'appelle donc pas cette unité.

**Alternative rejetée : la garde de LECTURE fail-closed dans les deux portes
d'authentification** (relire le lien à chaque requête anonyme). Elle couvrait
l'expiration en prime — et aurait évincé, comme effet de bord, tous les invités
d'un lien fermé par un bannissement, cassant la décision ci-dessus dans un lot
qui parle d'autre chose. Elle ajoutait de surcroît une lecture par requête
anonyme. La révocation est donc une ÉCRITURE au moment du geste, que les deux
portes existantes honorent déjà sans changer d'une ligne.

**Conséquences.**

- `DELETE` révoque **avant** de supprimer : `Participant.shareLinkId` est une
  colonne nue (aucune relation Prisma, aucune cascade), donc la ligne du lien
  partie, plus rien ne relie ses invités à ce qu'on vient de retirer. Dans cet
  ordre, un échec échoue FERMÉ et la reprise est idempotente.
- Réactiver un lien ne rend rien à personne : une ligne `Participant` close ne
  se rouvre que par la porte d'entrée (`conversationEntryAdmission`).
- L'unité ANNONCE (`conversation:participant-left`, `memberCount` absolu),
  contrairement à sa jumelle : ses deux appelants portent le MÊME fait.
- **L'EXPIRATION n'est pas couverte** — elle n'est le geste de personne et
  demande un balayage périodique (issue #4195, patron :
  `ExpiredStoriesCleanupService`). L'unité de révocation est réutilisable telle
  quelle, il n'y manque que le déclencheur.

Détail : `tasks/realtime-sync-audit-2026-08-28-cycle131-bis.md`,
`tasks/lessons.md` § Leçon 309, issue #4194.
