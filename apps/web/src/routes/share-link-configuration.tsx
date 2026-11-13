import { useEffect, useState } from 'react';

import { Sheet } from '@/components/sheet';
import type { ShareLinkUpdateOutcome } from '@/lib/api/link-actions';
import type { MyShareLink, ShareLinkPatch, ShareLinkPolicy } from '@/lib/api/links';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ConfigurationCard } from '@/routes/share-link-detail-parts';
import { EditLinkForm } from '@/routes/share-link-edit';

/**
 * **LA CONFIGURATION EN LECTURE, LE FORMULAIRE DERRIÈRE « MODIFIER »** (épure
 * #17584, règle 6 ; #17595) — la carte en lecture et le formulaire redisaient
 * les mêmes huit réglages l'un sous l'autre. Au repos, la fiche porte la
 * configuration ; « Modifier » ouvre le formulaire dans une fiche, avec ses
 * gestes (Désactiver, Supprimer) — rien n'est retiré, tout reste atteignable.
 *
 * L'ancre `#link-edit` ouvre la fiche d'emblée (adresse partagée, retour
 * arrière du navigateur) ; enregistrer avec succès la referme.
 */

const EDIT_ANCHOR = '#link-edit';

const opensFromAddress = (): boolean => typeof window !== 'undefined' && window.location.hash === EDIT_ANCHOR;

export function LinkConfiguration({
  language,
  link,
  policy,
  now,
  onSave,
  onToggleActive,
  onDelete,
}: {
  readonly language: InterfaceLanguage;
  readonly link: MyShareLink;
  readonly policy: ShareLinkPolicy | null;
  readonly now: () => Date;
  readonly onSave: (patch: ShareLinkPatch) => Promise<ShareLinkUpdateOutcome>;
  readonly onToggleActive: () => void;
  readonly onDelete: () => void;
}) {
  const [editing, setEditing] = useState(opensFromAddress);
  useEffect(() => {
    const follow = (): void => setEditing(opensFromAddress());
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  const close = (): void => {
    setEditing(false);
    if (opensFromAddress()) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  };
  return (
    <>
      <ConfigurationCard language={language} link={link} policy={policy} onEdit={policy === null ? () => undefined : () => setEditing(true)} />
      {editing && policy !== null ? (
        <Sheet title={translateInvite(language, 'linkDetail.edit.title')} presentation="centered" bodyAs="div" onClose={close}>
          <EditLinkForm
            language={language}
            link={link}
            policy={policy}
            now={now}
            bare
            onSave={async (patch) => {
              const outcome = await onSave(patch);
              if (outcome === 'done') close();
              return outcome;
            }}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        </Sheet>
      ) : null}
    </>
  );
}
