import type { CSSProperties, ReactNode } from 'react';

import { ADMIN_GLYPHS, type AdminGlyphName } from '@/components/glyphs-admin';
import { GlyphSvg } from '@/components/glyph';
import { InfoHintButton, InfoHintText, InfoNoted, useInfoHint, type InfoHint } from '@/components/info-hint';

export type { AdminGlyphName };

/**
 * UN GLYPHE DU JEU D'ÉCRAN D'ADMINISTRATION (#8876), par son nom. Même rendu et
 * mêmes règles d'accessibilité que `Glyph` (décoratif par défaut ; `title`
 * en fait le nom accessible d'un glyphe seul) — `GlyphSvg` est le site unique
 * du `<svg>`.
 */
export function AdminGlyph({
  name,
  size = 18,
  title,
  className,
  style,
}: {
  readonly name: AdminGlyphName;
  readonly size?: number;
  readonly title?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <GlyphSvg
      glyph={ADMIN_GLYPHS[name]}
      size={size}
      {...(title === undefined ? {} : { title })}
      {...(className === undefined ? {} : { className })}
      {...(style === undefined ? {} : { style })}
    />
  );
}

/**
 * **LE (i) DE L'ADMINISTRATION** (épure #17584, règle 1) — un libellé NOMME, la
 * note l'explique. Le nom accessible du bouton est la QUESTION à laquelle la
 * note répond (`question`, déjà traduite), jamais « Plus d'infos » ; la note
 * reste dans le DOM, lue du lecteur d'écran, et ne se montre qu'au toucher.
 *
 * Deux formes, un seul tracé : `AdminNoted` pose le (i) À LA FIN d'un nom
 * (titre de bloc, rangée) ; `AdminInfoAlone` le pose SEUL, à côté d'un texte
 * que l'hôte dessine lui-même — et, loin de tout nom qui dirait de quoi il
 * parle, il ÉCRIT sa question à côté du glyphe : un (i) orphelin au milieu d'un
 * bloc ne se lit pas, et un bloc qui n'a plus que lui paraît vide.
 */
export const adminInfo = (question: string, text: string): InfoHint => ({ label: question, text, glyph: ADMIN_GLYPHS.info });

export function AdminNoted({
  question,
  text,
  inline = false,
  className,
  children,
}: {
  readonly question: string;
  readonly text: string | undefined;
  readonly inline?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <InfoNoted note={text === undefined ? undefined : adminInfo(question, text)} inline={inline} {...(className === undefined ? {} : { className })}>
      {children}
    </InfoNoted>
  );
}

export function AdminInfoAlone({ question, text, anchor }: { readonly question: string; readonly text: string; readonly anchor?: string }) {
  const hint = adminInfo(question, text);
  const state = useInfoHint();
  return (
    <div className="grid gap-1" {...(anchor === undefined ? {} : { 'data-admin-info': anchor })}>
      <div className="flex items-center">
        <InfoHintButton hint={hint} state={state} showsLabel />
      </div>
      <InfoHintText hint={hint} state={state} />
    </div>
  );
}
