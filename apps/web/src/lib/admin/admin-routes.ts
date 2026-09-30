/**
 * **LA TABLE DES SECTIONS ET DES ENTITÉS D'ADMINISTRATION** (#8876) — le SITE
 * UNIQUE des paires « liste → fiche » et des deux espaces (`/admin`, `/adm`,
 * D-76) dont dérivent : `admin-space.ts` (`routeInSpace`, la section active du
 * menu), `sections.ts` (route et groupe de chaque section), le retour de chaque
 * écran, les paires de `liste-ouvre-sa-fiche.test.ts`, les liens d'entité du
 * kit (`AdminLink`) et les clés privées de `session-guard.ts`.
 *
 * **Module PUR, sans dépendance** : il est importé par le socle (la garde de
 * session, l'accès au menu flottant) ; il ne tire ni écran ni catalogue.
 *
 * Les clés (`adminUsers`, `admUsers`…) sont celles de `ROUTES`
 * (`routes/route-table.tsx`) ; ce module n'invente aucune adresse, il les
 * NOMME. `route-table.tsx` reste l'unique déclarant des motifs, et
 * `liste-ouvre-sa-fiche.test.ts` garde que chaque clé d'ici y existe.
 */
export type AdminSpace = 'adm' | 'admin';

export type AdminGroupId = 'overview' | 'people' | 'exchanges' | 'content' | 'moderation' | 'growth' | 'platform';

export const ADMIN_SECTION_TABLE = [
  { id: 'dashboard', group: 'overview', list: { admin: 'admin', adm: 'adm' } },
  {
    id: 'users',
    group: 'people',
    list: { admin: 'adminUsers', adm: 'admUsers' },
    fiche: { entity: 'user', admin: 'adminUser', adm: 'admUser', param: 'user' },
  },
  {
    id: 'anonymous',
    group: 'people',
    list: { admin: 'adminAnonymous', adm: 'admAnonymous' },
    fiche: { entity: 'anonymous', admin: 'adminAnonymousOne', adm: 'admAnonymousOne', param: 'participant' },
  },
  {
    id: 'invitations',
    group: 'people',
    list: { admin: 'adminInvitations', adm: 'admInvitations' },
    fiche: { entity: 'invitation', admin: 'adminInvitation', adm: 'admInvitation', param: 'invitation' },
  },
  {
    id: 'conversations',
    group: 'exchanges',
    list: { admin: 'adminConversations', adm: 'admConversations' },
    fiche: { entity: 'conversation', admin: 'adminConversation', adm: 'admConversation', param: 'conversation' },
  },
  {
    id: 'communities',
    group: 'exchanges',
    list: { admin: 'adminCommunities', adm: 'admCommunities' },
    fiche: { entity: 'community', admin: 'adminCommunity', adm: 'admCommunity', param: 'community' },
  },
  {
    id: 'shareLinks',
    group: 'exchanges',
    list: { admin: 'adminShareLinks', adm: 'admShareLinks' },
    fiche: { entity: 'shareLink', admin: 'adminShareLink', adm: 'admShareLink', param: 'link' },
  },
  {
    id: 'posts',
    group: 'content',
    list: { admin: 'adminPosts', adm: 'admPosts' },
    fiche: { entity: 'post', admin: 'adminPost', adm: 'admPost', param: 'post' },
  },
  {
    id: 'reports',
    group: 'moderation',
    list: { admin: 'adminReports', adm: 'admReports' },
    fiche: { entity: 'report', admin: 'adminReport', adm: 'admReport', param: 'report' },
  },
  { id: 'audit', group: 'moderation', list: { admin: 'adminAudit', adm: 'admAudit' } },
  { id: 'analytics', group: 'growth', list: { admin: 'adminAnalytics', adm: 'admAnalytics' } },
  { id: 'ranking', group: 'growth', list: { admin: 'adminRanking', adm: 'admRanking' } },
  {
    id: 'trackingLinks',
    group: 'growth',
    list: { admin: 'adminTrackingLinks', adm: 'admTrackingLinks' },
    fiche: { entity: 'trackingLink', admin: 'adminTrackingLink', adm: 'admTrackingLink', param: 'link' },
  },
  {
    id: 'broadcasts',
    group: 'growth',
    list: { admin: 'adminBroadcasts', adm: 'admBroadcasts' },
    fiche: { entity: 'broadcast', admin: 'adminBroadcast', adm: 'admBroadcast', param: 'broadcast' },
  },
  { id: 'monitoring', group: 'platform', list: { admin: 'adminMonitoring', adm: 'admMonitoring' } },
  { id: 'languages', group: 'platform', list: { admin: 'adminLanguages', adm: 'admLanguages' } },
  { id: 'agent', group: 'platform', list: { admin: 'adminAgent', adm: 'admAgent' } },
  { id: 'settings', group: 'platform', list: { admin: 'adminSettings', adm: 'admSettings' } },
] as const;

type Row = (typeof ADMIN_SECTION_TABLE)[number];

export type AdminSectionId = Row['id'];

/** Les clés de liste du seul espace `/admin` — ce que `AdminSection.route` désigne. */
export type AdminRoute = Row['list']['admin'];

/** Les clés de liste du seul espace `/adm`. */
export type AdmRoute = Row['list']['adm'];

export type AdminListRouteKey = AdminRoute | AdmRoute;

type FicheRow = Extract<Row, { readonly fiche: unknown }>['fiche'];

export type AdminEntityKind = FicheRow['entity'];

export type AdminFicheRouteKey = FicheRow['admin'] | FicheRow['adm'];

/** `'list'` : la liste d'où l'on vient (la liste des conversations de l'application) ; sinon une liste d'administration. */
export type AdminBack = 'list' | AdminListRouteKey;

/** Où mène un lien d'administration : une section, ou la fiche d'une entité. */
export type AdminTarget =
  | { readonly kind: 'section'; readonly section: AdminSectionId; readonly search?: Readonly<Record<string, string>> }
  | { readonly kind: 'entity'; readonly entity: AdminEntityKind; readonly id: string; readonly search?: Readonly<Record<string, string>> };

export type AdminFicheEntry = FicheRow & { readonly section: AdminSectionId };

export const ADMIN_FICHES: readonly AdminFicheEntry[] = ADMIN_SECTION_TABLE.flatMap((row) =>
  'fiche' in row ? [{ ...row.fiche, section: row.id }] : [],
);

const rowOf = (section: AdminSectionId): Row => {
  const row = ADMIN_SECTION_TABLE.find((candidate) => candidate.id === section);
  if (row === undefined) throw new Error(`Section d'administration inconnue : ${section}`);
  return row;
};

const ficheOf = (kind: AdminEntityKind): AdminFicheEntry => {
  const fiche = ADMIN_FICHES.find((candidate) => candidate.entity === kind);
  if (fiche === undefined) throw new Error(`Entité d'administration inconnue : ${kind}`);
  return fiche;
};

export function adminListRoute(section: AdminSectionId, space: AdminSpace): AdminListRouteKey {
  return rowOf(section).list[space];
}

/** La clé de liste de la section dans l'espace `/admin` — ce que `AdminSection.route` porte. */
export function adminRouteOf(section: AdminSectionId): AdminRoute {
  return rowOf(section).list.admin;
}

export function adminFicheRoute(kind: AdminEntityKind, space: AdminSpace): AdminFicheRouteKey {
  return ficheOf(kind)[space];
}

export function sectionOfEntity(kind: AdminEntityKind): AdminSectionId {
  return ficheOf(kind).section;
}

export function adminGroupOf(section: AdminSectionId): AdminGroupId {
  return rowOf(section).group;
}

/** Le retour d'une FICHE : la liste de sa section, dans l'espace où l'on est. */
export function adminBackOf(section: AdminSectionId, space: AdminSpace): AdminBack {
  return adminListRoute(section, space);
}

/** La section qu'une clé de route — liste ou fiche, dans l'un ou l'autre espace — fait surligner. */
export function adminSectionOfRouteKey(routeKey: string): AdminSectionId | null {
  const row = ADMIN_SECTION_TABLE.find((candidate) => {
    const keys: readonly string[] = [
      candidate.list.admin,
      candidate.list.adm,
      ...('fiche' in candidate ? [candidate.fiche.admin, candidate.fiche.adm] : []),
    ];
    return keys.includes(routeKey);
  });
  return row === undefined ? null : row.id;
}

/** Toutes les clés de route d'administration — celles que `session-guard.ts` doit tenir pour PRIVÉES. */
export const ADMIN_ROUTE_KEYS: readonly (AdminListRouteKey | AdminFicheRouteKey)[] = ADMIN_SECTION_TABLE.flatMap((row) => [
  row.list.admin,
  row.list.adm,
  ...('fiche' in row ? [row.fiche.admin, row.fiche.adm] : []),
]);
