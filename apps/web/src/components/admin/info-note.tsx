import type { ReactNode } from 'react';

import { ADMIN_GLYPHS } from '@/components/glyphs-admin';
import { InfoHintButton, InfoHintText, InfoNoted, useInfoHint, type InfoHint } from '@/components/info-hint';

/**
 * **LE (i) DE L'ADMINISTRATION** (épure #17584, règle 1) — un libellé NOMME, la
 * note l'explique. Le nom accessible du bouton est la QUESTION à laquelle la
 * note répond (`question`, déjà traduite), jamais « Plus d'infos » ; la note
 * reste dans le DOM, lue du lecteur d'écran, et ne se montre qu'au toucher.
 *
 * Deux formes, un seul tracé : `AdminNoted` pose le (i) À LA FIN d'un nom
 * (titre de bloc, rangée) ; `AdminInfoAlone` le pose SEUL, à côté d'un texte
 * que l'hôte dessine lui-même.
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
        <InfoHintButton hint={hint} state={state} />
      </div>
      <InfoHintText hint={hint} state={state} />
    </div>
  );
}
