import type { ReactNode } from 'react';

import type { AdminTone } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { AdminGlyph, type AdminGlyphName } from './admin-glyph';
import { BRAND, EDGE, INK, INK2, SURFACE, TONE_COLOR, toneBackground } from './tone';

const CARD = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/** L'état VIDE, dessiné — absolu (« rien à traiter ») ou filtré (« aucun résultat ») : c'est l'appelant qui choisit les mots. */
export function AdminEmptyState({
  title,
  hint,
  glyph,
  action,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly glyph?: AdminGlyphName;
  readonly action?: ReactNode;
}) {
  return (
    <div data-admin-empty className="grid justify-items-center gap-3 rounded-card p-8 text-center" style={CARD}>
      {glyph === undefined ? null : (
        <span className="grid size-12 place-items-center rounded-full" style={{ backgroundColor: toneBackground('neutral'), color: INK2 }}>
          <AdminGlyph name={glyph} size={24} />
        </span>
      )}
      <p className="text-body font-semibold" style={{ color: INK }}>
        {title}
      </p>
      {hint === undefined ? null : (
        <p className="max-w-prose text-caption" style={{ color: INK2 }}>
          {hint}
        </p>
      )}
      {action}
    </div>
  );
}

/** L'ERREUR avec son « Réessayer » : jamais un écran qui échoue sans issue. */
export function AdminErrorState({
  language,
  message,
  onRetry,
}: {
  readonly language: AdminLanguage;
  readonly message?: string;
  readonly onRetry: () => void;
}) {
  return (
    <div role="alert" data-admin-error className="grid justify-items-center gap-3 rounded-card p-8 text-center" style={CARD}>
      <span className="grid size-12 place-items-center rounded-full" style={{ backgroundColor: toneBackground('danger'), color: TONE_COLOR.danger }}>
        <AdminGlyph name="warningCircle" size={24} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {message ?? translateAdmin(language, 'admin.kit.error')}
      </p>
      <button
        type="button"
        data-admin-retry
        onClick={onRetry}
        className={`inline-flex items-center gap-2 rounded-chip px-5 text-body font-semibold text-ios-on-brand ${FOCUS}`}
        style={{ minHeight: 44, backgroundColor: BRAND, outlineColor: BRAND }}
      >
        <AdminGlyph name="arrowClockwise" size={16} />
        {translateAdmin(language, 'admin.kit.retry')}
      </button>
    </div>
  );
}

/** UN BLOC refusé (403) dans un écran ouvert : le reste de l'écran continue de servir. */
export function AdminDeniedInline({ language }: { readonly language: AdminLanguage }) {
  return (
    <div data-admin-denied-inline className="flex items-center gap-3 rounded-card p-4" style={CARD}>
      <span aria-hidden="true" style={{ color: INK2 }}>
        <AdminGlyph name="lock" size={20} />
      </span>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.kit.denied')}
      </p>
    </div>
  );
}

const NOTICE_GLYPH: Readonly<Record<AdminTone, AdminGlyphName>> = {
  neutral: 'info',
  brand: 'info',
  info: 'info',
  success: 'checkCircle',
  warning: 'warning',
  danger: 'warningCircle',
};

/** Un message dans un écran ouvert — ton + glyphe + mot, jamais la couleur seule. */
export function AdminInlineNotice({
  tone,
  text,
  action,
}: {
  readonly tone: AdminTone;
  readonly text: string;
  readonly action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-admin-notice={tone}
      className="flex flex-wrap items-center gap-3 rounded-card px-4 py-3"
      style={{ backgroundColor: toneBackground(tone), color: INK }}
    >
      <span aria-hidden="true" style={{ color: TONE_COLOR[tone] }}>
        <AdminGlyph name={NOTICE_GLYPH[tone]} size={18} />
      </span>
      <p className="min-w-0 flex-1 text-caption">{text}</p>
      {action}
    </div>
  );
}

/** HORS LIGNE : les données en cache restent affichées, les gestes se désactivent (l'écran lit `useOnline`). */
export function AdminOfflineNotice({ language }: { readonly language: AdminLanguage }) {
  const online = useOnline();
  if (online) return null;
  return <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.kit.offline')} />;
}
