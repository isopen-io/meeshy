import { useMemo, useState } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import type { ResolveContactsRequest } from '@meeshy/shared/types/contact-card';
import { buildResolveContactsRequest } from '@meeshy/shared/utils/vcard';

import { attachmentSrc } from '@/lib/api/media-url';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import type { Attachment } from '@/lib/api/types';
import { contactActionPorts } from '@/lib/contact-card/contact-ports';
import { contactResolveQueryOptions, type ContactResolveDeps } from '@/lib/contact-card/resolve';
import { useContactActions, type ContactActionPorts } from '@/lib/contact-card/use-contact-actions';
import { vcardQueryOptions, type FetchText } from '@/lib/contact-card/vcard-file';
import { contactInitials } from '@/lib/contact-card/view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { ContactAccountRow } from './contact-card-account';
import { ContactCardSheet, type ClipboardWriter } from './contact-card-sheet';
import { Glyph } from './glyph';

const NO_IDENTIFIERS: ResolveContactsRequest = { phones: [], emails: [] };

/**
 * **LA CARTE DE VISITE DANS LA BULLE** (#8101) — une pièce `text/vcard`
 * n'est plus une pièce « fichier » : le NOM tel que dans la vCard (le carnet
 * de l'AUTEUR, jamais le nom du compte), le premier numéro dessous, et si
 * l'un des identifiants est un compte Meeshy, son mini-profil avec
 * « Se connecter » / « Écrire ». Toucher le nom ouvre la fiche de verre
 * (`contact-card-sheet.tsx`) qui liste tous les champs.
 *
 * CACHE D'ABORD : la vCard (immuable) et la résolution vivent dans le cache
 * de requêtes persisté — une carte déjà vue se peint sans réseau ni
 * indicateur. La résolution ne peint RIEN tant qu'elle n'a pas répondu : le
 * nom et le numéro sont l'essentiel, un compte qui apparaît ensuite ne
 * déplace que ce qui est sous eux.
 *
 * Chunk À LA DEMANDE (`attachment-blocks.tsx`) : le fil ne paie ni le lecteur
 * vCard ni la fiche tant qu'aucune carte n'est affichée.
 */
export default function ContactCard({
  attachment,
  queryClient = appQueryClient,
  deps = apiDeps,
  ports = contactActionPorts,
  fetchText,
  clipboard,
  language = currentInterfaceLanguage(),
}: {
  readonly attachment: Attachment;
  readonly queryClient?: QueryClient;
  readonly deps?: ContactResolveDeps;
  readonly ports?: ContactActionPorts;
  readonly fetchText?: FetchText;
  readonly clipboard?: ClipboardWriter;
  readonly language?: InterfaceLanguage;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const vcard = useQuery(
    vcardQueryOptions({ attachmentId: attachment.id, fileUrl: attachment.fileUrl, ...(fetchText !== undefined ? { fetchText } : {}) }),
    queryClient,
  );
  const card = vcard.data ?? null;
  const request = useMemo(() => (card === null ? NO_IDENTIFIERS : buildResolveContactsRequest(card)), [card]);
  const resolved = useQuery(contactResolveQueryOptions({ ...deps, request }), queryClient);
  const accounts = resolved.data ?? [];
  const actions = useContactActions({ queryClient, language, ports });

  if (vcard.isPending) {
    return (
      <div className="flex items-center gap-3 py-1" style={{ minHeight: 44, minWidth: 220 }} aria-busy="true" data-contact-card="loading">
        <span className="rounded-full" style={{ width: 40, height: 40, backgroundColor: 'var(--color-ios-card)' }} aria-hidden="true" />
        <span className="text-caption" style={{ opacity: 0.75 }}>
          {translate(language, 'contactCard.loading')}
        </span>
      </div>
    );
  }

  if (card === null) {
    return (
      <div className="flex flex-col gap-2 py-1" style={{ minWidth: 220 }} data-contact-card={vcard.isError ? 'error' : 'unreadable'}>
        <p className="text-body" style={{ opacity: 0.75 }}>
          {translate(language, vcard.isError ? 'contactCard.failed' : 'contactCard.unreadable')}
        </p>
        <div className="flex gap-2">
          {vcard.isError ? (
            <button
              type="button"
              onClick={() => void vcard.refetch()}
              className="rounded-chip px-4 text-body font-semibold"
              style={{ minHeight: 44, color: 'inherit', border: '1px solid currentColor' }}
            >
              {translate(language, 'contactCard.retry')}
            </button>
          ) : null}
          <a
            href={attachmentSrc(attachment.fileUrl)}
            download={attachment.originalName}
            className="flex items-center gap-2 rounded-chip px-4 text-body"
            style={{ minHeight: 44, color: 'inherit', textDecoration: 'underline' }}
          >
            <Glyph name="downloadSimple" size={18} />
            {translate(language, 'contactCard.download')}
          </a>
        </div>
      </div>
    );
  }

  const firstPhone = card.phones[0]?.value ?? card.emails[0]?.value ?? null;

  return (
    <div
      className="flex flex-col gap-3 py-1"
      style={{ minWidth: 220, maxWidth: 300 }}
      role="group"
      aria-label={translate(language, 'contactCard.a11y.card', { name: card.formattedName })}
      data-contact-card="ready"
    >
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex items-center gap-3 text-start"
        style={{ minHeight: 44 }}
        aria-haspopup="dialog"
        aria-label={translate(language, 'contactCard.open', { name: card.formattedName })}
        data-contact-open=""
      >
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center rounded-full text-body font-semibold"
          style={{ width: 40, height: 40, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-brand)' }}
        >
          {contactInitials(card.formattedName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold" data-contact-name="">
            {card.formattedName}
          </span>
          {firstPhone !== null ? (
            <span className="block truncate text-caption" style={{ opacity: 0.75 }} dir="ltr" data-contact-first="">
              {firstPhone}
            </span>
          ) : null}
        </span>
      </button>

      {accounts[0] !== undefined ? (
        <div className="rounded-card p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
          <ContactAccountRow account={accounts[0]} language={language} variant="compact" busy={actions.busy} onAction={actions.run} />
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className={actions.announcement === '' ? 'sr-only' : 'text-caption'}
        style={{ color: actions.announcementTone === 'error' ? 'var(--color-error)' : undefined }}
      >
        {sheetOpen ? '' : actions.announcement}
      </p>

      {sheetOpen ? (
        <ContactCardSheet
          card={card}
          accounts={accounts}
          language={language}
          busy={actions.busy}
          onAction={actions.run}
          onClose={() => setSheetOpen(false)}
          {...(clipboard !== undefined ? { clipboard } : {})}
        />
      ) : null}
    </div>
  );
}
