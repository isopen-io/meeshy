/**
 * LES SECTIONS D'ADMINISTRATION, ET QUI LES VOIT (#6432).
 *
 * Directive porteur 2026-09-14 : « c'est ici qu'on livre un accès à la page
 * d'administration à la v2 ; pas besoin de tout refaire, on peut réutiliser ce
 * qui existe ».
 *
 * ## Ce que ce module reprend
 *
 * La liste est le MIROIR MESURÉ de la barre latérale du legacy
 * (`apps/web/components/admin/AdminLayout.tsx`, onze entrées) : même ordre,
 * mêmes permissions.
 *
 * ## Une section que la v2 ne sert pas est MASQUÉE (#6702)
 *
 * Le legacy est décommissionné (directive porteur 2026-09-15) : la v2 sert tout
 * `meeshy.me`. Les neuf sections qu'il était seul à servir n'ont plus aucune
 * adresse où mener. Leur tuile n'est donc pas offerte — ni vers un ailleurs qui
 * n'existe plus, ni vers un écran d'attente : ce seraient neuf contrôles qui
 * mentent (loi 4). `route: null` le dit ; porter une section, c'est lui donner
 * sa route dans `route-table.tsx`, puis ici.
 *
 * ## Pourquoi la permission décide, et jamais le rôle
 *
 * `SessionUser` (`lib/api/session.ts`) ne PROJETTE pas `role` : le magasin ne
 * garde que quatre champs, délibérément. Un écran qui déciderait de l'accès
 * depuis la session ne pourrait donc que le deviner.
 *
 * La décision vient du SERVEUR — `GET /me/permissions`, qui rend la matrice
 * projetée depuis son site unique (`services/admin/served-permissions.ts`).
 * Ce module ne fait que la LIRE : il ne connaît aucun rôle, aucune hiérarchie,
 * et n'a donc aucune règle à tenir d'accord avec la passerelle.
 *
 * ## Fail-closed par construction
 *
 * `visibleAdminSections` prend `AdminPermissions | null`. `null` — pas encore
 * su, ou requête refusée — rend une liste VIDE, jamais la liste complète : un
 * défaut de réseau ne doit pas ouvrir une porte, et c'est le sens que l'appel
 * doit avoir par DÉFAUT, pas par précaution de l'appelant.
 */

/** Les clés de `servedPermissionsSchema` que l'administration consulte. */
export type AdminPermissions = {
  readonly canAccessAdmin: boolean;
  readonly canManageUsers: boolean;
  readonly canManageGroups: boolean;
  readonly canManageConversations: boolean;
  readonly canViewAnalytics: boolean;
  readonly canModerateContent: boolean;
  readonly canViewAuditLogs: boolean;
  readonly canManageNotifications: boolean;
  readonly canManageTranslations: boolean;
  /**
   * **LA GARDE RÉELLE DES 35 ROUTES `/admin/agent/*`** (#6733) —
   * `requirePermission('canManageAgent')`, `routes/admin/agent-shared.ts`.
   *
   * Servie depuis le lot B de ce chantier (`servedUserPermissions`,
   * `services/admin/served-permissions.ts`). Avant elle, la tuile de l'agent
   * se rabattait sur `canAccessAdmin` — le MAUVAIS seuil, vrai pour MODERATOR
   * et AUDIT, à qui la matrice centrale refuse l'agent : un contrôle voué au
   * 403, que la loi 4 interdit au même titre qu'un contrôle inerte.
   */
  readonly canManageAgent: boolean;
};

export type AdminPermissionKey = keyof AdminPermissions;

/**
 * Les clés de catalogue des onze sections — une UNION littérale, jamais
 * `string`.
 *
 * `translate` est générique sur sa clé : il exige un troisième argument dès
 * que la chaîne du catalogue porte un `{paramètre}`. Typer `labelKey` en
 * `string` élargit donc la clé à TOUT le catalogue, y compris ses entrées
 * paramétrées — et le site d'appel se voit réclamer des paramètres qu'aucune
 * de ces onze chaînes n'a. L'union rend la contrainte exacte.
 */
export type AdminSectionLabelKey =
  | 'admin.nav.dashboard'
  | 'admin.nav.users'
  | 'admin.nav.conversations'
  | 'admin.nav.moderation'
  | 'admin.nav.audit'
  | 'admin.nav.analytics'
  | 'admin.nav.trackingLinks'
  | 'admin.nav.ranking'
  | 'admin.nav.broadcasts'
  | 'admin.nav.settings'
  | 'admin.nav.agent'
  | 'admin.nav.monitoring';

/**
 * Les routes de la v2 qu'une section ouvre — des CLÉS de `ROUTES`
 * (`route-table.tsx`), jamais une adresse écrite à la main : `<Link to>` ne
 * compile que sur une route qui existe, et la tuile ne peut plus viser un autre
 * écran que le sien.
 */
export type AdminRoute = 'admin' | 'adminUsers' | 'adminConversations' | 'adminAgent';

export type AdminSection = {
  readonly id: string;
  /** Clé du catalogue d'interface — jamais un libellé en dur. */
  readonly labelKey: AdminSectionLabelKey;
  /** La route que la v2 sert pour cette section, ou `null` : non portée, donc masquée. */
  readonly route: AdminRoute | null;
  readonly permission: AdminPermissionKey;
  /**
   * **RÉSERVÉE AU RANG D'ADMINISTRATION** (#6862) — une section dont la route
   * exige BIGBOSS ou ADMIN côté passerelle (`requireAdminRank()`), en plus de
   * sa permission.
   *
   * Directive porteur du 2026-09-16 : « permettre aussi aux ADMIN de pouvoir
   * accéder à ces informations pour le moment ».
   *
   * Pourquoi un champ DE PLUS, quand une permission existe déjà : parce que
   * `canManageConversations` est aussi portée par **MODERATOR** (matrice
   * centrale de la passerelle). Filtrer sur la seule permission offrirait donc
   * la tuile à un MODERATOR, que la passerelle refuserait ensuite — un
   * contrôle voué au 403, que la loi 4 interdit au même titre qu'un contrôle
   * inerte.
   *
   * Le rang vient de `GET /me/permissions`, qui sert `role` À CÔTÉ de la
   * matrice : c'est le rôle SERVI, jamais déduit de la session (`SessionUser`
   * ne projette pas `role`, délibérément).
   */
  readonly adminRankOnly?: boolean;
  readonly glyph: string;
};

/** Une section que la v2 SERT — la seule forme qu'un écran reçoit. */
export type ServedAdminSection = AdminSection & { readonly route: AdminRoute };

/** Les onze sections, dans l'ordre du legacy ; `route: null` ⇒ masquée. */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'dashboard', labelKey: 'admin.nav.dashboard', route: 'admin', permission: 'canAccessAdmin', glyph: '📊' },
  { id: 'users', labelKey: 'admin.nav.users', route: 'adminUsers', permission: 'canManageUsers', glyph: '👥' },
  {
    id: 'conversations',
    labelKey: 'admin.nav.conversations',
    route: 'adminConversations',
    permission: 'canManageConversations',
    adminRankOnly: true,
    glyph: '💬',
  },
  { id: 'moderation', labelKey: 'admin.nav.moderation', route: null, permission: 'canModerateContent', glyph: '🛡️' },
  { id: 'audit', labelKey: 'admin.nav.audit', route: null, permission: 'canViewAuditLogs', glyph: '📜' },
  { id: 'analytics', labelKey: 'admin.nav.analytics', route: null, permission: 'canViewAnalytics', glyph: '📈' },
  { id: 'trackingLinks', labelKey: 'admin.nav.trackingLinks', route: null, permission: 'canViewAnalytics', glyph: '🔗' },
  { id: 'ranking', labelKey: 'admin.nav.ranking', route: null, permission: 'canViewAnalytics', glyph: '🏆' },
  { id: 'broadcasts', labelKey: 'admin.nav.broadcasts', route: null, permission: 'canManageNotifications', glyph: '📣' },
  { id: 'settings', labelKey: 'admin.nav.settings', route: null, permission: 'canManageTranslations', glyph: '⚙️' },
  /* LE PILOTAGE DE L'AGENT (#6733) — `canManageAgent`, jamais `canAccessAdmin` :
     la tuile porte le seuil de ce qu'elle OUVRE. Et aucun `adminRankOnly` —
     sa garde serveur est une permission, pas un rang. */
  { id: 'agent', labelKey: 'admin.nav.agent', route: 'adminAgent', permission: 'canManageAgent', glyph: '🤖' },
  { id: 'monitoring', labelKey: 'admin.nav.monitoring', route: null, permission: 'canAccessAdmin', glyph: '💓' },
];

/**
 * Les sections qu'un porteur de cette matrice a le droit de voir, et que la v2
 * sert.
 *
 * `canAccessAdmin` faux ⇒ AUCUNE section, même si une permission fine est
 * vraie : l'accès à l'espace précède l'accès à ses pièces. C'est la même
 * hiérarchie que garde le legacy (`AdminLayout` refuse le rendu entier avant
 * de filtrer sa barre), et la seule qui empêche un rôle intermédiaire d'entrer
 * par une section isolée.
 */
export function visibleAdminSections(
  permissions: AdminPermissions | null,
  /**
   * Le rôle **servi** par `GET /me/permissions`, à côté de la matrice — jamais
   * déduit de la session, que `SessionUser` ne projette pas.
   *
   * OPTIONNEL, et son absence est FERMANTE : un appelant qui ne le passe pas
   * (ou qui ne l'a pas encore reçu) ne voit aucune section souveraine. C'est
   * le seul défaut sûr — l'inverse offrirait la tuile pendant le chargement,
   * puis la retirerait, ce qu'un lecteur lit comme un droit qu'on lui reprend.
   */
  role?: string | null,
): readonly ServedAdminSection[] {
  if (!canEnterAdmin(permissions)) return [];

  const rangAdministration = RANGS_ADMINISTRATION.has(role ?? '');

  return ADMIN_SECTIONS.filter(
    (section): section is ServedAdminSection =>
      section.route !== null &&
      permissions?.[section.permission] === true &&
      // Une section de ce genre mène à une route qui exige AUSSI le rang :
      // l'offrir à un MODERATOR, qui porte pourtant la permission, le
      // conduirait à un écran qui ne peut lui rendre que des 403.
      (section.adminRankOnly !== true || rangAdministration),
  );
}

/**
 * Les rôles que la passerelle admet en rang d'administration
 * (`requireAdminRank()`, `middleware/authorize.ts`).
 *
 * Écrits ici une fois, et comparés au rôle SERVI. Ce module ne connaît aucune
 * autre hiérarchie : la matrice de permissions reste la seule loi d'accès,
 * `adminRankOnly` en étant l'unique exception — parce qu'elle n'est PAS
 * exprimable en permissions de domaine (MODERATOR porte
 * `canManageConversations` sans avoir le rang).
 */
const RANGS_ADMINISTRATION: ReadonlySet<string> = new Set(['BIGBOSS', 'ADMIN']);

/**
 * **LA PORTE DE L'ESPACE, et elle seule** — ce que l'écran `/admin`, la rangée
 * des Réglages et le barreau du menu flottant (#6458) consultent pour savoir
 * s'ils MÈNENT à l'administration. Un seul prédicat : trois sites qui
 * réécriraient `?.canAccessAdmin === true` finiraient par ne plus s'accorder
 * sur le cas `null`.
 */
export function canEnterAdmin(permissions: AdminPermissions | null): boolean {
  return permissions?.canAccessAdmin === true;
}
