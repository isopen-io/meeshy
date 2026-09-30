import type { AdminGlyphName } from '@/components/glyphs-admin';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { AdminTone, Interpreted } from './interpret/types';

/**
 * **LE VOCABULAIRE DU JOURNAL D'AUDIT** (#8876, #6727) — chaque code d'action que
 * la passerelle écrit dans `AdminAuditLog`, dit en mots : un libellé, une phrase
 * qui explique, un glyphe, un ton, une famille.
 *
 * Les codes viennent de TROIS mains : l'énumération partagée `UserAuditAction`
 * (les gestes sur un compte), les `withAudit({ action: '…' })` des routes
 * d'administration, et les `adminAuditLog.create` des diffusions et du retrait
 * d'une publication. La table est FIGÉE : `audit-vocabulary.test.ts` lit ces
 * sources et échoue dès qu'un code y apparaît sans entrée ici — c'est lui qui
 * force à la mettre à jour.
 *
 * Une **lecture souveraine** (`sovereign`) est une lecture de ce qui est privé,
 * tracée parce qu'elle laisse une empreinte : le contenu d'une conversation,
 * l'adresse secrète d'un lien, la fiche d'un membre. Elle traverse les domaines —
 * filtrer « les liens » remonte la révélation d'un lien, filtrer « les lectures
 * souveraines » remonte toutes les lectures de tous les domaines.
 *
 * Un code que la table ne connaît pas se dit « Action non répertoriée » : le code
 * brut ne vit que dans `raw` (attribut de test), jamais peint.
 */
export const AUDIT_FAMILIES = [
  'accounts',
  'security',
  'roles',
  'bans',
  'conversations',
  'links',
  'posts',
  'broadcasts',
  'agent',
  'reports',
  'communities',
] as const;

export type AuditFamily = (typeof AUDIT_FAMILIES)[number];

/** Les familles du FILTRE : les domaines, et la lecture souveraine qui les traverse. */
export const AUDIT_FILTER_FAMILIES = ['sovereign', ...AUDIT_FAMILIES] as const;

export type AuditFilterFamily = (typeof AUDIT_FILTER_FAMILIES)[number];

export const isAuditFilterFamily = (value: string): value is AuditFilterFamily => AUDIT_FILTER_FAMILIES.some((family) => family === value);

type ActionEntry = {
  readonly family: AuditFamily;
  readonly glyph: AdminGlyphName;
  readonly tone: AdminTone;
  readonly sovereign?: true;
};

const entry = (family: AuditFamily, glyph: AdminGlyphName, tone: AdminTone, sovereign?: true): ActionEntry =>
  sovereign === undefined ? { family, glyph, tone } : { family, glyph, tone, sovereign };

export const AUDIT_ACTIONS = {
  // ── Lectures et gestes sur un compte (UserAuditAction) ─────────────────────
  VIEW_USER: entry('accounts', 'eye', 'info', true),
  VIEW_USER_LIST: entry('accounts', 'list', 'info', true),
  VIEW_AUDIT_LOG: entry('security', 'scroll', 'info', true),
  CREATE_USER: entry('accounts', 'plus', 'success'),
  UPDATE_PROFILE: entry('accounts', 'pencilSimple', 'neutral'),
  UPDATE_EMAIL: entry('accounts', 'pencilSimple', 'neutral'),
  UPDATE_PHONE: entry('accounts', 'phoneCall', 'neutral'),
  UPDATE_ROLE: entry('roles', 'shieldCheck', 'brand'),
  UPDATE_STATUS: entry('accounts', 'pencilSimple', 'warning'),
  UPDATE_PREFERENCES: entry('accounts', 'gear', 'neutral'),
  UPLOAD_AVATAR: entry('accounts', 'image', 'neutral'),
  DELETE_AVATAR: entry('accounts', 'image', 'warning'),
  DEACTIVATE_USER: entry('accounts', 'userMinus', 'warning'),
  ACTIVATE_USER: entry('accounts', 'user', 'success'),
  DELETE_USER: entry('accounts', 'trash', 'danger'),
  RESTORE_USER: entry('accounts', 'arrowClockwise', 'success'),
  BAN_USER: entry('bans', 'prohibit', 'danger'),
  UNBAN_USER: entry('bans', 'checkCircle', 'success'),
  // ── Sécurité et accès ──────────────────────────────────────────────────────
  CHANGE_PASSWORD: entry('security', 'lock', 'neutral'),
  RESET_PASSWORD: entry('security', 'lock', 'warning'),
  ENABLE_2FA: entry('security', 'shieldCheck', 'success'),
  DISABLE_2FA: entry('security', 'lockOpen', 'warning'),
  UNLOCK_ACCOUNT: entry('security', 'lockOpen', 'success'),
  REVOKE_SESSION: entry('security', 'lock', 'warning'),
  VERIFY_EMAIL: entry('security', 'checkCircle', 'success'),
  VERIFY_PHONE: entry('security', 'checkCircle', 'success'),
  VERIFY_AGE: entry('security', 'checkCircle', 'success'),
  REQUEST_VERIFICATION: entry('security', 'paperPlaneTilt', 'info'),
  UPDATE_CONSENT: entry('security', 'shieldCheck', 'warning'),
  // ── Échanges ───────────────────────────────────────────────────────────────
  ADMIN_INVITATION_STATUS_SET: entry('accounts', 'handshake', 'warning'),
  ADMIN_CONVERSATION_MESSAGES_VIEWED: entry('conversations', 'eye', 'info', true),
  ADMIN_CONVERSATION_UPDATED: entry('conversations', 'pencilSimple', 'neutral'),
  ADMIN_CONVERSATION_MEMBER_ROLE_CHANGED: entry('conversations', 'shieldCheck', 'brand'),
  ADMIN_CONVERSATION_MEMBER_REMOVED: entry('conversations', 'userMinus', 'danger'),
  ADMIN_SHARE_LINK_REVEALED: entry('links', 'eye', 'info', true),
  ADMIN_SHARE_LINK_CLOSED: entry('links', 'linkBreak', 'warning'),
  ADMIN_SHARE_LINK_REOPENED: entry('links', 'linkSimple', 'success'),
  ADMIN_TRACKING_LINK_DEACTIVATED: entry('links', 'prohibit', 'warning'),
  ADMIN_TRACKING_LINK_REACTIVATED: entry('links', 'arrowClockwise', 'success'),
  ADMIN_COMMUNITY_UPDATED: entry('communities', 'usersThree', 'neutral'),
  // ── Contenus, diffusions, agent, signalements ──────────────────────────────
  DELETE_POST: entry('posts', 'trash', 'danger'),
  CREATE_BROADCAST: entry('broadcasts', 'plus', 'neutral'),
  SEND_BROADCAST: entry('broadcasts', 'paperPlaneTilt', 'info'),
  SEND_BROADCAST_INAPP: entry('broadcasts', 'megaphone', 'info'),
  DELETE_BROADCAST: entry('broadcasts', 'trash', 'danger'),
  AGENT_LLM_CONFIG_UPDATED: entry('agent', 'robot', 'warning'),
  AGENT_FULL_RESET: entry('agent', 'trash', 'danger'),
  ADMIN_REPORT_UPDATED: entry('reports', 'flag', 'neutral'),
  ADMIN_REPORT_DELETED: entry('reports', 'trash', 'danger'),
  ADMIN_REPORT_ASSIGNED: entry('reports', 'user', 'info'),
} as const satisfies Readonly<Record<string, ActionEntry>>;

export type AuditActionCode = keyof typeof AUDIT_ACTIONS;

const isKnownAction = (code: string): code is AuditActionCode => Object.hasOwn(AUDIT_ACTIONS, code);

export type AuditActionInterpreted = Interpreted & {
  /** La famille de domaine ; `null` pour un code que la table ne connaît pas. */
  readonly family: AuditFamily | null;
  /** Une lecture souveraine : elle laisse une empreinte parce qu'elle ouvre du privé. */
  readonly sovereign: boolean;
  readonly known: boolean;
};

/** Le code d'une action, dit en mots ; un code inconnu devient « Action non répertoriée ». */
export function interpretAuditAction(code: string, language: InterfaceLanguage): AuditActionInterpreted {
  if (!isKnownAction(code)) {
    return {
      label: translateAdmin(language, 'admin.audit.action.unknown'),
      tone: 'neutral',
      explain: translateAdmin(language, 'admin.audit.action.unknown.explain'),
      glyph: 'scroll',
      raw: code,
      family: null,
      sovereign: false,
      known: false,
    };
  }

  const facts: ActionEntry = AUDIT_ACTIONS[code];
  return {
    label: translateAdmin(language, `admin.audit.action.${code}`),
    tone: facts.tone,
    explain: translateAdmin(language, `admin.audit.action.${code}.explain`),
    glyph: facts.glyph,
    raw: code,
    family: facts.family,
    sovereign: facts.sovereign === true,
    known: true,
  };
}

/** Les codes d'une famille de filtre — ce que le filtre envoie à la passerelle dans `action=a,b,c`. */
export function auditActionsOfFamily(family: AuditFilterFamily): readonly AuditActionCode[] {
  const codes = Object.keys(AUDIT_ACTIONS).filter(isKnownAction);
  return family === 'sovereign'
    ? codes.filter((code) => 'sovereign' in AUDIT_ACTIONS[code])
    : codes.filter((code) => AUDIT_ACTIONS[code].family === family);
}
