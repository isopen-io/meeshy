import type {
  AdminRecentMember,
  AdminRecentReport,
  AdminSendingBroadcasts,
} from '@/lib/api/admin-overview-queue';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { interpretReportStatus, interpretReportType, interpretReportedEntity } from './interpret/enums';
import { personLabel, personSecondary } from './interpret/labels';
import { formatCount } from './interpret/numbers';
import { adminMomentOf } from './interpret/time';
import type { Interpreted } from './interpret/types';

/**
 * **LES LIGNES DES LISTES DU TABLEAU DE BORD, EN MOTS** (#8876, § 4) — les
 * signalements récents, les diffusions en cours, les derniers inscrits. Des
 * fonctions PURES : ce que les décodeurs ont lu, la langue et l'horloge
 * entrent ; des lignes DÉJÀ nommées sortent.
 *
 * **Un identifiant n'est jamais un libellé** : un signalement se dit par ce
 * qu'il désigne (« Message de Awa Diop », « Famille », « Awa Diop »), une
 * diffusion par son nom, un inscrit par son nom affiché. L'`id` ne sert qu'à
 * bâtir le lien vers la fiche.
 */
export type DashReportRow = {
  readonly id: string;
  /** Ce qui est signalé, nommé. */
  readonly name: string;
  /** Le motif, le moment — et « supprimé » si ce qui était signalé n'existe plus. */
  readonly secondary: string;
  readonly status: Interpreted;
};

const joinLine = (parts: readonly (string | null)[]): string => parts.filter((part): part is string => part !== null && part !== '').join(' · ');

/**
 * Le nom de ce qui est signalé : son propre nom (membre, conversation,
 * communauté, son), sinon « {genre} de {propriétaire} » (message, publication,
 * commentaire — qui n'ont pas de titre), sinon le seul genre.
 */
export function reportedEntityName(entity: AdminRecentReport['entity'], language: InterfaceLanguage): string {
  const kind = interpretReportedEntity(entity?.kind, language).label;
  if (entity === null) return kind;
  if (entity.label !== null) return entity.label;
  if (entity.owner === null) return kind;
  return translateAdmin(language, 'admin.dash.moderation.entityOf', { kind, owner: personLabel(entity.owner, language) });
}

export function recentReportRows(reports: readonly AdminRecentReport[], now: Date, language: InterfaceLanguage): readonly DashReportRow[] {
  return reports.map((report) => {
    const named = report.entity?.label !== null && report.entity !== null;
    return {
      id: report.id,
      name: reportedEntityName(report.entity, language),
      secondary: joinLine([
        named ? interpretReportedEntity(report.entity?.kind, language).label : null,
        interpretReportType(report.reportType, language).label,
        adminMomentOf(report.createdAt, now, language)?.relative ?? null,
        report.entity?.deleted === true ? translateAdmin(language, 'admin.kit.entity.deleted') : null,
      ]),
      status: interpretReportStatus(report.status, language),
    };
  });
}

export type DashBroadcastRow = {
  readonly id: string;
  readonly name: string;
  readonly subject: string | null;
  /** 0–100, arrondi : la part des destinataires déjà servis. */
  readonly percent: number;
  readonly progress: string;
  readonly failed: string | null;
};

export function broadcastRows(
  data: AdminSendingBroadcasts,
  language: InterfaceLanguage,
): { readonly rows: readonly DashBroadcastRow[]; readonly more: string | null } {
  const rows = data.rows.map((row): DashBroadcastRow => ({
    id: row.id,
    name: row.name ?? row.subject ?? translateAdmin(language, 'admin.dash.broadcasts.unnamed'),
    subject: row.name === null ? null : row.subject,
    percent: row.totalRecipients > 0 ? Math.min(100, Math.round((row.sentCount / row.totalRecipients) * 100)) : 0,
    progress: translateAdmin(language, 'admin.dash.broadcasts.progress', {
      sent: formatCount(row.sentCount, language),
      total: formatCount(row.totalRecipients, language),
    }),
    failed: row.failedCount > 0 ? translateAdmin(language, 'admin.dash.broadcasts.failed', { count: formatCount(row.failedCount, language) }) : null,
  }));
  const hidden = data.total - data.rows.length;
  return { rows, more: hidden > 0 ? translateAdmin(language, 'admin.dash.broadcasts.more', { count: formatCount(hidden, language) }) : null };
}

export type DashMemberRow = {
  readonly id: string;
  readonly label: string;
  readonly secondary: string | null;
  readonly avatar: string | null;
};

export function recentMemberRows(members: readonly AdminRecentMember[], now: Date, language: InterfaceLanguage): readonly DashMemberRow[] {
  return members.map((member) => {
    const joined = adminMomentOf(member.createdAt, now, language);
    const secondary = joinLine([
      personSecondary(member.username),
      joined === null ? null : translateAdmin(language, 'admin.dash.members.joined', { when: joined.relative }),
    ]);
    return { id: member.id, label: personLabel(member, language), secondary: secondary === '' ? null : secondary, avatar: member.avatar };
  });
}
