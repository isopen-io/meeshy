import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { AdminBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { BRAND, INK, INK2, TONE_COLOR, toneBackground } from '@/components/admin/tone';
import { interpretAuditAction } from '@/lib/admin/audit-vocabulary';
import { auditPersonRef, auditTargetOf } from '@/lib/admin/audit-target';
import type { AdminTone } from '@/lib/admin/interpret/types';
import type { AdminAuditEntry, AdminAuditPerson, AdminAuditTarget } from '@/lib/api/admin-audit';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PIÈCES DU JOURNAL D'AUDIT** (#8876, #6727) — l'action avec son glyphe et son
 * badge « Lecture souveraine », l'administrateur et la cible en puces nommées. Partagées
 * par la liste et la feuille de détail : un seul endroit dit comment une action s'écrit.
 */

/** Le badge qui dit qu'une lecture a ouvert du privé — le mot « Lecture souveraine », jamais la seule couleur. */
export function SovereignBadge({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <span title={translateAdmin(language, 'admin.audit.badge.sovereign.explain')}>
      <AdminBadge tone="info" glyph="eye" anchor="sovereign">
        {translateAdmin(language, 'admin.audit.badge.sovereign')}
      </AdminBadge>
    </span>
  );
}

/** La pastille ronde du glyphe d'une action, teintée de son ton. */
export function ActionGlyph({ glyph, tone }: { readonly glyph: AdminGlyphName; readonly tone: AdminTone }) {
  return (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: toneBackground(tone), color: TONE_COLOR[tone] }}>
      <AdminGlyph name={glyph} size={18} />
    </span>
  );
}

/**
 * La cellule de l'action : un BOUTON de 44 px qui ouvre la feuille de détail. C'est
 * l'ancre accessible de la rangée — le détail d'une entrée n'a pas de route, donc pas de
 * lien : le geste est un bouton, et il dit ce qu'il ouvre.
 */
export function AuditActionCell({
  language,
  entry,
  onOpen,
}: {
  readonly language: InterfaceLanguage;
  readonly entry: AdminAuditEntry;
  readonly onOpen: (entry: AdminAuditEntry) => void;
}) {
  const action = interpretAuditAction(entry.action, language);
  return (
    <button
      type="button"
      data-admin-audit-open={entry.id}
      data-admin-raw={action.raw}
      aria-haspopup="dialog"
      aria-label={translateAdmin(language, 'admin.audit.row.open', { action: action.label })}
      onClick={() => onOpen(entry)}
      className="flex min-w-0 items-center gap-3 rounded-chip text-start focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, color: INK, outlineColor: BRAND }}
    >
      <ActionGlyph glyph={action.glyph ?? 'scroll'} tone={action.tone} />
      <span className="grid min-w-0 justify-items-start gap-1">
        <span className="min-w-0 break-words font-medium">{action.label}</span>
        {action.sovereign ? <SovereignBadge language={language} /> : null}
      </span>
    </button>
  );
}

/** Une personne du journal en puce nommée ; absente, « Système ou compte supprimé » — jamais un identifiant. */
export function AuditPerson({ language, person }: { readonly language: InterfaceLanguage; readonly person: AdminAuditPerson | null }) {
  if (person === null) {
    return (
      <span className="text-body" style={{ color: INK2 }} data-admin-audit-actor="unknown">
        {translateAdmin(language, 'admin.audit.actor.unknown')}
      </span>
    );
  }
  return <AdminEntityChip language={language} entity={auditPersonRef(person, language)} size="sm" />;
}

/** La cible : une puce vers la fiche quand le genre en a une, sinon le nom du genre en texte. */
export function AuditTarget({ language, target }: { readonly language: InterfaceLanguage; readonly target: AdminAuditTarget }) {
  const display = auditTargetOf(target, language);
  if (display.kind === 'entity') return <AdminEntityChip language={language} entity={display.entity} size="sm" />;
  return (
    <span className="grid gap-0.5">
      <span className="font-medium" style={{ color: INK }}>
        {display.label}
      </span>
      {display.secondary === null ? null : (
        <span className="text-caption" style={{ color: INK2 }}>
          {display.secondary}
        </span>
      )}
    </span>
  );
}
