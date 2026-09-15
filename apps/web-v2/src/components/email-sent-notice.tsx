import type { ReactNode } from 'react';

import { Glyph } from './glyph';
import { AUTH_GLYPHS } from './glyphs-auth';
import { InfoHintButton, InfoHintText, useInfoHint, type InfoHint } from './info-hint';

/**
 * « E-MAIL ENVOYÉ » — UN écran pour les deux liens que Meeshy envoie par e-mail
 * (#6643).
 *
 * La connexion par e-mail et le mot de passe oublié envoient tous deux un lien,
 * et la passerelle rend 200 dans les deux cas, même pour une adresse inconnue
 * (anti-énumération) : l'écran ne peut ni promettre l'envoi ni le démentir. Le
 * mot de passe oublié disait « Si un compte existe avec …, un lien de
 * réinitialisation a été envoyé » quand la connexion disait « Ouvrez le lien
 * reçu à … » : deux phrases pour le même fait, et la première parlait de
 * réinitialiser à qui n'a jamais eu de mot de passe (#6642). Les deux écrans
 * montent celui-ci. Ce qui diffère entre par `status` (le compte à rebours de la
 * connexion) et `children` (le renvoi, ou le retour à la connexion).
 */

/**
 * CE QUE LA PASSERELLE NE DIT PAS, ET QUE L'ÉCRAN DOIT DIRE (#6404).
 *
 * Ne pouvant rien affirmer de l'envoi, l'écran nomme la première cause d'un
 * e-mail « jamais reçu » : le dossier indésirables. #6404 l'écrivait en clair ;
 * #6626 le replie derrière un (i) dont le libellé est la question qu'on se pose
 * à cet instant, et qui reste LU à côté du glyphe — posé seul sous l'adresse, un
 * (i) muet ne dirait pas de quoi il parle.
 */
const NOTHING_RECEIVED: InfoHint = {
  label: 'Rien reçu ?',
  text: 'Regardez vos indésirables (spam) : le message peut y être tombé.',
  glyph: AUTH_GLYPHS.info,
};

export function EmailSentNotice({
  email,
  status,
  children,
}: {
  readonly email: string;
  readonly status?: ReactNode;
  readonly children?: ReactNode;
}) {
  const nothingReceived = useInfoHint();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <div
        aria-hidden="true"
        className="grid place-items-center rounded-full"
        style={{ width: 120, height: 120, backgroundColor: 'color-mix(in srgb, var(--ios-indigo-600) 10%, transparent)' }}
      >
        <Glyph name="envelopeOpen" size={48} style={{ color: 'var(--ios-indigo-500)' }} />
      </div>

      <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        E-mail envoyé
      </h2>
      <p style={{ color: 'var(--color-ios-ink-2)' }}>
        Ouvrez le lien reçu à <strong style={{ color: 'var(--ios-indigo-400)' }}>{email}</strong>
      </p>

      {status}

      <div className="grid justify-items-center">
        <InfoHintButton hint={NOTHING_RECEIVED} state={nothingReceived} showsLabel />
        <InfoHintText hint={NOTHING_RECEIVED} state={nothingReceived} />
      </div>

      {children}
    </div>
  );
}
