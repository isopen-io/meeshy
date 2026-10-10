import { useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { PhoneCodeForm, phoneSecondaryButton, type PhoneCodeDeps } from './phone-code-form';

/**
 * **« AJOUTEZ VOTRE NUMÉRO », LÀ OÙ IL SERT** (#8843, demande porteur
 * 2026-09-30) — miroir web de la vue iOS présentée avant la recherche par
 * contacts. Le web n'a pas de carnet d'adresses : la proposition vit dans
 * « Découvrir », là où l'on cherche des gens.
 *
 * Elle dit À QUOI sert le numéro avant de le demander, l'ajoute par le
 * parcours SMS existant (`PhoneCodeForm`), et « Plus tard » la ferme sans rien
 * envoyer — jamais bloquant. L'hôte ne la monte que si le profil n'a pas de
 * numéro.
 */
export function PhoneAddPrompt({
  language,
  deps,
  onDismiss,
  onVerified,
}: {
  readonly language: InterfaceLanguage;
  readonly deps: PhoneCodeDeps;
  readonly onDismiss: () => void;
  readonly onVerified: () => void;
}) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p data-phone-add-prompt="" role="status" className="rounded-card px-4 py-3 text-body font-semibold" style={{ color: 'var(--ios-success)', backgroundColor: 'var(--color-ios-card)' }}>
        {translate(language, 'phonePrompt.done')}
      </p>
    );
  }

  return (
    <section
      data-phone-add-prompt=""
      aria-label={translate(language, 'phonePrompt.title')}
      className="grid gap-3 rounded-card p-4"
      style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
    >
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'phonePrompt.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'phonePrompt.body')}
      </p>
      <PhoneCodeForm
        language={language}
        deps={deps}
        onVerified={() => {
          setDone(true);
          onVerified();
        }}
      />
      <button
        type="button"
        onClick={onDismiss}
        className="grid place-items-center rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...phoneSecondaryButton, border: 0, color: 'var(--color-ios-ink-2)' }}
      >
        {translate(language, 'phonePrompt.later')}
      </button>
    </section>
  );
}
