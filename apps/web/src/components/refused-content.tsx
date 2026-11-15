import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * **UN CONTENU REFUSÉ SE PRÉSENTE COMME UN RÉEL REFUSÉ** (#10314, #10318 —
 * décision porteur du 2026-10-12 : « faire le même traitement que pour les
 * réels »). Un lien de réel, de publication ou de story que le lecteur ne peut
 * pas voir s'ouvre sur le noir de média du lecteur de réels, et rien d'autre
 * du contenu :
 *
 * - un VISITEUR sans compte y voit l'invitation par-dessus
 *   (`VisitorInvitationDialog`, état `refused`) ;
 * - un MEMBRE connecté hors audience y voit le refus du lecteur de réels iOS
 *   (`ReelOpenFailureView` sur un échec `forbidden`/`notFound`) : les mêmes
 *   mots (`feed.post.detail.unavailable.*`, clés d'iOS), « Retour », et aucun
 *   « Réessayer » — réessayer un refus ne peut pas aboutir.
 *
 * Neutre PAR CONSTRUCTION : ni le fond ni la notice ne reçoivent une donnée du
 * contenu — ils ne peuvent donc porter ni texte, ni média, ni auteur. La
 * passerelle n'en sert d'ailleurs aucun : 403 et 404 confondus (D-6), le même
 * refus qu'un contenu inexistant (`anonymousPostGate` pour un visiteur).
 */
export function RefusedContentBackdrop() {
  return <div aria-hidden="true" data-refused-backdrop className="fixed inset-0 bg-media-backdrop" />;
}

export type RefusalView = 'invitation' | 'notice';

/** Qui voit quoi devant un refus : l'invitation pour un visiteur, la notice
 * pour un membre — sur le même fond. */
export function refusalViewOf(input: { readonly visitor: boolean }): RefusalView {
  return input.visitor ? 'invitation' : 'notice';
}

export function RefusedContentNotice({ language, onBack }: { readonly language: InterfaceLanguage; readonly onBack: () => void }) {
  return (
    <>
      <RefusedContentBackdrop />
      <div
        role="alert"
        data-refused-notice
        className="fixed inset-0 grid content-center justify-items-center gap-3 px-8 text-center text-on-media"
      >
        <span style={{ color: 'var(--color-on-media-3)' }}>
          <Glyph name="lock" size={40} />
        </span>
        <p className="text-title font-bold">{translate(language, 'feed.post.detail.unavailable.title')}</p>
        <p className="text-body" style={{ color: 'var(--color-on-media-3)' }}>
          {translate(language, 'feed.post.detail.unavailable.body')}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-full px-5 text-body font-semibold"
          style={{ border: '1px solid var(--color-media-hairline)' }}
        >
          {translate(language, 'feed.post.detail.unavailable.back')}
        </button>
      </div>
    </>
  );
}
