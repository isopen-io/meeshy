import type { ReactNode } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * « E-MAIL ENVOYÉ » — UN écran pour les deux liens que Meeshy envoie par e-mail
 * (#6643).
 *
 * La connexion par e-mail et le mot de passe oublié envoient tous deux un lien,
 * et la passerelle rend 200 dans les deux cas, même pour une adresse inconnue
 * (anti-énumération) : l'écran ne peut ni promettre l'envoi ni le démentir. Le
 * mot de passe oublié disait « Si un compte existe avec …, un lien de
 * réinitialisation vient d’être envoyé » quand la connexion disait « Ouvrez le
 * lien reçu à … » : deux phrases pour le même fait, et la première parlait de
 * réinitialiser à qui n'a jamais eu de mot de passe (#6642). Les deux écrans
 * montent désormais celui-ci en entier, conseil sur les indésirables compris. Ce qui diffère entre par `status` (le compte à rebours de
 * la connexion) et `children` (le renvoi, ou le retour à la connexion).
 */

/**
 * LES INDÉSIRABLES, DITS EN CLAIR (#16452) — la première cause d'un e-mail
 * « jamais reçu ». La passerelle rend 200 même pour une adresse inconnue
 * (anti-énumération) : l'écran ne peut ni promettre l'envoi ni le démentir,
 * mais il peut dire où regarder. Replié derrière un (i) « Rien reçu ? »
 * depuis #6626, le conseil revient visible sur demande du porteur
 * (2026-11-06) : PARTOUT où un e-mail part — lien, code, vérification,
 * réinitialisation — la même phrase, depuis ce seul composant.
 */
export function SpamFolderHint({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p data-spam-hint className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
      {translate(language, 'emailSent.checkSpam')}
    </p>
  );
}

/** L'adresse se met en valeur DANS la phrase traduite : l'ordre des mots est
 * celui de la langue, jamais celui du français. */
const EMAIL_SLOT = '\u0000';

function OpenLinkSentence({ email, language }: { readonly email: string; readonly language: InterfaceLanguage }) {
  const [before = '', after = ''] = translate(language, 'emailSent.openLink', { email: EMAIL_SLOT }).split(EMAIL_SLOT);
  return (
    <>
      {before}
      <strong style={{ color: 'var(--ios-indigo-400)' }}>{email}</strong>
      {after}
    </>
  );
}

export function EmailSentNotice({
  email,
  lead,
  status,
  children,
}: {
  readonly email: string;
  /** La phrase sous le titre, quand l'e-mail envoyé porte AUTRE CHOSE qu'un
   * lien — le code à 6 chiffres de la connexion par e-mail (#8034). */
  readonly lead?: ReactNode;
  readonly status?: ReactNode;
  readonly children?: ReactNode;
}) {
  const language = currentInterfaceLanguage();
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
        {translate(language, 'emailSent.title')}
      </h2>
      <p style={{ color: 'var(--color-ios-ink-2)' }}>{lead ?? <OpenLinkSentence email={email} language={language} />}</p>

      {status}

      <SpamFolderHint language={language} />

      {children}
    </div>
  );
}
