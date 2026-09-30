import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { AdminSectionId } from './admin-routes';
import { ADMIN_SECTIONS, type AdminPermissionKey, type AdminSection } from './sections';

/**
 * **VOTRE ACCÈS, DIT EN MOTS** (#8876, #6732) — les dix capacités que la passerelle
 * sert (`GET /me/permissions`), accordées ou non, et ce que chacune OUVRE.
 *
 * Ce que chacune ouvre se LIT dans le registre des sections : c'est la permission que
 * porte chaque `AdminSection` qui décide, jamais une seconde matrice écrite ici. Une
 * capacité ACCORDÉE liste ce que le lecteur atteint vraiment (`reached` — le rang
 * d'administration compris) ; une capacité NON accordée dit ce qu'elle OUVRIRAIT (les
 * sections prêtes qui la demandent), pour que « pourquoi je ne vois pas le journal ? »
 * trouve sa réponse dans l'écran.
 *
 * Cet écran n'accorde rien : il DIT ce que la plateforme a décidé.
 */
export const CAPABILITY_KEYS = [
  'canAccessAdmin',
  'canManageUsers',
  'canManageGroups',
  'canManageConversations',
  'canModerateContent',
  'canViewAnalytics',
  'canViewAuditLogs',
  'canManageNotifications',
  'canManageAgent',
  'canManageTranslations',
] as const satisfies readonly AdminPermissionKey[];

export type CapabilityRow = {
  readonly key: AdminPermissionKey;
  readonly granted: boolean;
  readonly opens: readonly AdminSectionId[];
};

export function capabilityRows(params: {
  readonly granted: (key: AdminPermissionKey) => boolean;
  readonly reached: readonly AdminSection[];
  readonly registry?: readonly AdminSection[];
}): readonly CapabilityRow[] {
  const registry = params.registry ?? ADMIN_SECTIONS;
  return CAPABILITY_KEYS.map((key) => {
    const granted = params.granted(key);
    const sections = granted ? params.reached : registry.filter((section) => section.ready);
    return { key, granted, opens: sections.filter((section) => section.permission === key).map((section) => section.id) };
  });
}

/** La phrase : « Ouvre : Comptes et Anonymes », « Ouvrirait : … », ou « N’ouvre aucune section à elle seule. » */
export function capabilityOpensText(row: CapabilityRow, language: InterfaceLanguage): string {
  if (row.opens.length === 0) return translateAdmin(language, 'admin.settings.access.opensNothing');
  const sections = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(
    row.opens.map((id) => translateAdmin(language, `admin.nav.${id}`)),
  );
  return translateAdmin(language, row.granted ? 'admin.settings.access.opens' : 'admin.settings.access.wouldOpen', { sections });
}

/**
 * Les gestes que le rang de CRÉATEUR ouvre (`requireSovereign()`, BIGBOSS et lui seul) :
 * ils ouvrent du privé ou touchent toute la plateforme, exigent presque toujours un motif
 * écrit, et laissent leur trace dans le journal d'audit.
 */
export const SOVEREIGN_GESTURES = ['readMessages', 'listConversations', 'revealLink', 'consents', 'agentModel', 'agentReset'] as const;
