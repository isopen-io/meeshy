import type { AdminGlyphName } from '@/components/glyphs-admin';

import {
  adminGroupOf,
  adminRouteOf,
  type AdminGroupId,
  type AdminRoute,
  type AdminSectionId,
} from './admin-routes';

export type { AdminRoute };

/**
 * LES SECTIONS D'ADMINISTRATION, ET QUI LES VOIT (#6432).
 *
 * Directive porteur 2026-09-14 : « c'est ici qu'on livre un accès à la page
 * d'administration à la v2 ; pas besoin de tout refaire, on peut réutiliser ce
 * qui existe ».
 *
 * ## Ce que ce module reprend
 *
 * La liste part de la barre latérale du legacy
 * (`apps/web/components/admin/AdminLayout.tsx`, onze entrées), rangée depuis
 * #8876 en sept groupes et dix-huit sections (`docs/superpowers/specs/
 * 2026-09-30-admin-vue-de-dieu-design.md`, § 1).
 *
 * ## Une section que l'administration ne sert pas encore est MASQUÉE (#6702, #8876)
 *
 * Le legacy est décommissionné (directive porteur 2026-09-15) : la v2 sert tout
 * `meeshy.me`. Une section dont `ready` est faux n'est ni au menu, ni au hub,
 * ni en lien d'entité : ce serait un contrôle qui ment (loi 4). Les dix-huit
 * sections sont servies depuis l'intégration du chantier #8876 ; le drapeau
 * reste la porte d'une section qu'on livrerait écran par écran.
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
 * Les clés de catalogue des dix-huit sections — une UNION littérale, jamais
 * `string`.
 *
 * `translate` est générique sur sa clé : il exige un troisième argument dès
 * que la chaîne du catalogue porte un `{paramètre}`. Typer `labelKey` en
 * `string` élargit donc la clé à TOUT le catalogue, y compris ses entrées
 * paramétrées — et le site d'appel se voit réclamer des paramètres qu'aucune
 * de ces chaînes n'a. L'union rend la contrainte exacte : chaque clé écrite ici
 * doit exister dans le catalogue, sinon `translateAdmin` ne compile plus.
 */
export type AdminSectionLabelKey = `admin.nav.${AdminSectionId}`;

/** Une ligne qui dit ce qu'on fait dans la section — le hub la pose sous le libellé. */
export type AdminSectionHintKey = `admin.nav.${AdminSectionId}.hint`;

export type AdminGroupLabelKey = `admin.group.${AdminGroupId}`;

export type AdminSection = {
  readonly id: AdminSectionId;
  readonly group: AdminGroupId;
  /** Clé du catalogue d'interface — jamais un libellé en dur. */
  readonly labelKey: AdminSectionLabelKey;
  /** La clé de LISTE de la section dans l'espace `/admin` ; `routeInSpace` la traduit dans l'espace courant. */
  readonly route: AdminRoute;
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
  /**
   * **LA SECTION EST-ELLE SERVIE ?** (#8876) — `false` tant que son écran n'est
   * pas livré : ni menu, ni tuile, ni lien d'entité ne mènent alors à elle
   * (loi 4). Toutes les sections du registre sont servies.
   */
  readonly ready: boolean;
  readonly glyph: AdminGlyphName;
};

/** Une section que l'administration SERT — la seule forme qu'un écran reçoit. */
export type ServedAdminSection = AdminSection;

export type AdminGroup = { readonly id: AdminGroupId; readonly labelKey: AdminGroupLabelKey };

/** Les sept groupes du menu, dans l'ordre où ils se lisent. */
export const ADMIN_GROUPS: readonly AdminGroup[] = [
  { id: 'overview', labelKey: 'admin.group.overview' },
  { id: 'people', labelKey: 'admin.group.people' },
  { id: 'exchanges', labelKey: 'admin.group.exchanges' },
  { id: 'content', labelKey: 'admin.group.content' },
  { id: 'moderation', labelKey: 'admin.group.moderation' },
  { id: 'growth', labelKey: 'admin.group.growth' },
  { id: 'platform', labelKey: 'admin.group.platform' },
];

type SectionFacts = {
  readonly permission: AdminPermissionKey;
  readonly glyph: AdminGlyphName;
  readonly ready: boolean;
  readonly adminRankOnly?: true;
};

/** Le groupe et la route d'une section viennent de la table (`admin-routes.ts`) : jamais écrits deux fois. */
const section = (id: AdminSectionId, facts: SectionFacts): AdminSection => ({
  id,
  group: adminGroupOf(id),
  labelKey: `admin.nav.${id}`,
  route: adminRouteOf(id),
  ...facts,
});

/**
 * Les dix-huit sections, dans l'ordre des sept groupes (#8876). La permission
 * est celle de la route QUE LA SECTION OUVRE — une tuile ne promet jamais plus
 * que sa garde serveur (#6843).
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  section('dashboard', { permission: 'canAccessAdmin', glyph: 'squaresFour', ready: true }),
  section('users', { permission: 'canManageUsers', glyph: 'users', ready: true }),
  /* LES ANONYMES (#7873) — les participants entrés par un lien sans compte.
     Même seuil que les comptes : ce sont des personnes, et leur fiche mène à
     la conversation qu'elles ont rejointe. */
  section('anonymous', { permission: 'canManageUsers', glyph: 'detective', ready: true }),
  /* LES DEMANDES DE CONTACT — ce que la passerelle sert sous « invitations »
     sont des demandes d'AMITIÉ entre membres, pas des invitations par e-mail. */
  section('invitations', { permission: 'canManageUsers', glyph: 'handshake', ready: true }),
  section('conversations', { permission: 'canManageConversations', glyph: 'chats', ready: true, adminRankOnly: true }),
  section('communities', { permission: 'canManageGroups', glyph: 'usersThree', ready: true }),
  section('shareLinks', { permission: 'canManageConversations', glyph: 'linkSimple', ready: true }),
  section('posts', { permission: 'canModerateContent', glyph: 'newspaper', ready: true }),
  section('reports', { permission: 'canModerateContent', glyph: 'flag', ready: true }),
  section('audit', { permission: 'canViewAuditLogs', glyph: 'scroll', ready: true }),
  section('analytics', { permission: 'canViewAnalytics', glyph: 'chartLine', ready: true }),
  section('ranking', { permission: 'canViewAnalytics', glyph: 'trophy', ready: true }),
  section('trackingLinks', { permission: 'canViewAnalytics', glyph: 'target', ready: true }),
  section('broadcasts', { permission: 'canManageNotifications', glyph: 'megaphone', ready: true }),
  section('monitoring', { permission: 'canViewAnalytics', glyph: 'heartbeat', ready: true, adminRankOnly: true }),
  section('languages', { permission: 'canViewAnalytics', glyph: 'translate', ready: true }),
  /* LE PILOTAGE DE L'AGENT (#6733) — `canManageAgent`, jamais `canAccessAdmin` :
     la tuile porte le seuil de ce qu'elle OUVRE. Et aucun `adminRankOnly` —
     sa garde serveur est une permission, pas un rang. */
  section('agent', { permission: 'canManageAgent', glyph: 'robot', ready: true }),
  section('settings', { permission: 'canAccessAdmin', glyph: 'gear', ready: true }),
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
  /** Le registre lu : celui de l'application, ou un registre SYNTHÉTIQUE qu'un témoin passe pour ne dépendre d'aucun drapeau. */
  registry: readonly AdminSection[] = ADMIN_SECTIONS,
): readonly ServedAdminSection[] {
  if (!canEnterAdmin(permissions)) return [];

  const rangAdministration = hasAdministrationRank(role);

  return registry.filter(
    (candidate) =>
      candidate.ready &&
      permissions?.[candidate.permission] === true &&
      // Une section de ce genre mène à une route qui exige AUSSI le rang :
      // l'offrir à un MODERATOR, qui porte pourtant la permission, le
      // conduirait à un écran qui ne peut lui rendre que des 403.
      (candidate.adminRankOnly !== true || rangAdministration),
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

/** Le rôle SERVI est-il de rang d'administration ? — le même prédicat pour le menu, le hub et les blocs d'écran. */
export function hasAdministrationRank(role: string | null | undefined): boolean {
  return RANGS_ADMINISTRATION.has(role ?? '');
}

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
