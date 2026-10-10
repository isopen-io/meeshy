import type { Interpreted } from '@/lib/admin/interpret/types';
import { interpretRole } from '@/lib/admin/interpret/enums';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import type { AdminTone } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

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

/**
 * Un `Interpreted` peint : `title` porte l'explication pour la souris, un texte visuellement caché la
 * porte pour le tactile, le clavier et les lecteurs d'écran (un `title` n'est annoncé qu'au survol, et
 * pas par tous) ; `data-admin-raw` est le code brut (ancre de test, jamais lu à l'œil).
 */
export function AdminInterpretedBadge({ value }: { readonly value: Interpreted }) {
  return (
    <>
      <span data-admin-raw={value.raw} {...(value.explain === null ? {} : { title: value.explain })}>
        <AdminBadge tone={value.tone} {...(value.glyph === undefined ? {} : { glyph: value.glyph })}>
          {value.label}
        </AdminBadge>
      </span>
      {/* Frère du badge, non son enfant : le badge garde son texte (le mot d'état) et l'explication
          s'ajoute APRÈS lui pour les technologies d'assistance, sans déplacer rien à l'écran. */}
      {value.explain === null ? null : <span className="sr-only">. {value.explain}</span>}
    </>
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

/**
 * **VÉRIFIÉ OU NON** (repris de la fiche d'un membre, #8289 → #9463) — le MOT porte l'état, la
 * couleur ne fait que l'appuyer, et le ✓ ne marque que le vérifié. Ses teintes sont celles du
 * succès et de l'encre discrète, pas celles d'`AdminBadge` : un contact non vérifié n'est pas
 * une alerte, c'est une information.
 */
export function AdminVerifiedBadge({ verified, language }: { readonly verified: boolean; readonly language: AdminLanguage }) {
  const tint = verified ? 'var(--color-success)' : 'var(--color-ios-ink-2)';
  return (
    <span
      data-admin-verified={verified ? 'true' : 'false'}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold"
      style={{
        color: tint,
        backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tint} 40%, transparent)`,
      }}
    >
      {verified ? <span aria-hidden="true">✓</span> : null}
      {translateAdmin(language, verified ? 'admin.contact.verified' : 'admin.contact.unverified')}
    </span>
  );
}
