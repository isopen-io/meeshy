import type { Interpreted } from '@/lib/admin/interpret/types';
import { interpretRole } from '@/lib/admin/interpret/enums';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import type { AdminTone } from '@/lib/admin/interpret/types';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminGlyph, type AdminGlyphName } from './admin-glyph';
import { TONE_COLOR, toneBackground } from './tone';

/**
 * UN BADGE D'ÉTAT (#8876) — le mot d'abord, le ton ensuite : la couleur ne
 * porte JAMAIS seule le sens (un daltonien lit « Suspendu », pas « orange »).
 * Fond = le ton à 14 %, texte = le ton.
 */
export function AdminBadge({
  tone,
  children,
  glyph,
  anchor,
}: {
  readonly tone: AdminTone;
  readonly children: string;
  readonly glyph?: AdminGlyphName;
  readonly anchor?: string;
}) {
  return (
    <span
      {...(anchor === undefined ? {} : { 'data-admin-badge': anchor })}
      className="inline-flex max-w-full items-center gap-1 rounded-chip px-2 py-0.5 text-caption font-medium"
      style={{ backgroundColor: toneBackground(tone), color: TONE_COLOR[tone] }}
    >
      {glyph === undefined ? null : <AdminGlyph name={glyph} size={12} />}
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/** Un `Interpreted` peint : `title` porte l'explication, `data-admin-raw` le code brut (ancre de test, jamais lu à l'œil). */
export function AdminInterpretedBadge({ value }: { readonly value: Interpreted }) {
  return (
    <span data-admin-raw={value.raw} {...(value.explain === null ? {} : { title: value.explain })}>
      <AdminBadge tone={value.tone} {...(value.glyph === undefined ? {} : { glyph: value.glyph })}>
        {value.label}
      </AdminBadge>
    </span>
  );
}

export function AdminRoleBadge({ language, role }: { readonly language: AdminLanguage; readonly role: string | null }) {
  return <AdminInterpretedBadge value={interpretRole(role, language)} />;
}

/** Le NOM de la langue, dans la langue d'interface — jamais « ES ». */
export function AdminLanguageBadge({ language, code }: { readonly language: AdminLanguage; readonly code: string | null }) {
  return (
    <AdminBadge tone="neutral" glyph="globe">
      {sentenceCase(languageName(code, language), language)}
    </AdminBadge>
  );
}
