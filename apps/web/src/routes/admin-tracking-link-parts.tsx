import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { interpretTrackingTarget } from '@/lib/admin/interpret/enums';
import { trackingLinkState, trackingTargetRef } from '@/lib/admin/tracking-link-model';
import type { AdminTrackingLinkRow } from '@/lib/api/admin-tracking-links';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { copyPlainText } from '@/lib/view/copy-text';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES PIÈCES COMMUNES DES LIENS DE SUIVI** (#8876, #6729) — l'état nommé, la
 * cible en puce, la campagne en trois lignes, et une adresse copiable.
 */
const INK2 = 'var(--color-ios-ink-2)';

export function TrackingStateBadge({ language, link, now }: { readonly language: AdminLanguage; readonly link: AdminTrackingLinkRow; readonly now: Date }) {
  return <AdminInterpretedBadge value={trackingLinkState(link, now, language)} />;
}

/**
 * La cible : une puce vers la publication, la conversation ou le profil visés ; pour
 * un site externe (ou une cible sans entité), le GENRE nommé en texte — jamais un
 * identifiant.
 */
export function TrackingTarget({ language, link }: { readonly language: AdminLanguage; readonly link: AdminTrackingLinkRow }) {
  const ref = trackingTargetRef(link, language);
  if (ref === null) return <span>{interpretTrackingTarget(link.targetType, language).label}</span>;
  return <AdminEntityChip language={language} entity={ref} />;
}

/** La campagne, la source et le support, chacun sous son libellé — « — » quand aucun n'est posé. */
export function TrackingUtm({ language, link }: { readonly language: AdminLanguage; readonly link: AdminTrackingLinkRow }) {
  const lines = [
    { id: 'campaign', label: translateAdmin(language, 'admin.tracking.utm.campaign'), value: link.campaign },
    { id: 'source', label: translateAdmin(language, 'admin.tracking.utm.source'), value: link.source },
    { id: 'medium', label: translateAdmin(language, 'admin.tracking.utm.medium'), value: link.medium },
  ].flatMap((line) => (line.value === null ? [] : [{ ...line, value: line.value }]));

  if (lines.length === 0) return <span>—</span>;
  return (
    <span className="grid gap-0.5 text-caption" style={{ color: INK2 }}>
      {lines.map((line) => (
        <span key={line.id} data-admin-utm={line.id} className="break-words">
          {translateAdmin(language, 'admin.tracking.utm.line', { label: line.label, value: line.value })}
        </span>
      ))}
    </span>
  );
}

/**
 * Une adresse en TEXTE (jamais un lien cliquable : celle d'une destination n'a pas à
 * être ouverte depuis l'administration) avec sa copie, annoncée — réussie ou non.
 */
export function CopyableAddress({
  language,
  value,
  anchor,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly value: string;
  readonly anchor: string;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const copy = async () => {
    const outcome = await copyPlainText(value);
    onAnnounce(translateAdmin(language, outcome === 'copied' ? 'admin.tracking.copied' : 'admin.kit.copyFailed'), outcome === 'copied' ? 'neutral' : 'error');
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <code data-admin-address={anchor} className="font-mono text-caption" style={{ color: 'var(--color-ios-ink)', overflowWrap: 'anywhere' }}>
        {value}
      </code>
      <button
        type="button"
        data-admin-action={`copy-${anchor}`}
        onClick={() => void copy()}
        className="inline-flex items-center gap-1 rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <AdminGlyph name="copy" size={14} />
        {translateAdmin(language, 'admin.tracking.copy')}
      </button>
    </span>
  );
}
