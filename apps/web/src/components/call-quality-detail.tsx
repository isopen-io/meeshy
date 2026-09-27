import type { CallQuality } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE DÉTAIL DE LA QUALITÉ D'UN APPEL** (#8047) — le dernier relevé (perte,
 * latence, gigue, débits) dans les unités de la langue (`Intl.NumberFormat`),
 * ouvert d'un toucher sur l'indicateur de `call-quality.tsx`. Chunk à part :
 * l'écran d'appel ne le charge qu'au premier geste.
 */

const PANEL = 'rgba(17,16,24,0.94)';

const measure = (language: InterfaceLanguage, value: number, options: Intl.NumberFormatOptions): string => new Intl.NumberFormat(language, { maximumFractionDigits: 0, ...options }).format(value);

export function CallQualityDetail({ quality, language, onClose }: { readonly quality: CallQuality; readonly language: InterfaceLanguage; readonly onClose: () => void }) {
  const rows = [
    ['call.quality.loss', measure(language, quality.packetLoss / 100, { style: 'percent', maximumFractionDigits: 1 })],
    ['call.quality.latency', measure(language, quality.rtt, { style: 'unit', unit: 'millisecond' })],
    ['call.quality.jitter', measure(language, quality.jitter, { style: 'unit', unit: 'millisecond' })],
    ['call.quality.audioRate', measure(language, quality.audioKbps, { style: 'unit', unit: 'kilobit-per-second' })],
    ['call.quality.videoRate', measure(language, quality.videoKbps, { style: 'unit', unit: 'kilobit-per-second' })],
  ] as const;
  return (
    <div role="dialog" aria-label={translate(language, 'call.quality.detail')} className="fixed inset-x-4 z-10 mx-auto max-w-xs rounded-card p-3 shadow-lg" style={{ background: PANEL, color: '#fff', top: 'calc(env(safe-area-inset-top) + 3.5rem)' }} data-call-quality-detail="">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-body font-semibold">{translate(language, 'call.quality.detail')}</span>
        <button type="button" aria-label={translate(language, 'call.quality.close')} onClick={onClose} className="grid size-11 place-items-center rounded-full" data-call-quality-close="">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-mini">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt style={{ color: 'rgba(255,255,255,0.72)' }}>{translate(language, key)}</dt>
            <dd className="text-end tabular-nums" data-call-quality-row={key}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
