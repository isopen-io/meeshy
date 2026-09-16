import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import {
  ADMIN_MESSAGES_PAGE_SIZE,
  adminConversationMessagesQueryKey,
  loadAdminSovereignMessages,
  MOTIF_LONGUEUR_MINIMALE,
  type AdminSovereignAttachment,
  type AdminSovereignMessage,
} from '@/lib/api/admin-conversations';
import { apiDeps } from '@/lib/api/deps';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LA LECTURE D'UNE CONVERSATION** (#6862) — l'écran qui ouvre le contenu, et
 * le seul du dépôt à le faire depuis l'administration.
 *
 * Directive porteur du 2026-09-16 : « lectures des messages, audio, images
 * associé lorsqu'on est au moins de rang bigboss » — étendue le même jour aux
 * ADMIN, « pour le moment ».
 *
 * ## Le motif est demandé AVANT la requête, et ce n'est pas une politesse
 *
 * Le schéma AJV de la route refuse `reason` sous dix caractères, par un 400,
 * avant son handler. Demander le motif d'abord évite donc à l'administrateur
 * de découvrir la règle par un échec — et surtout, cela rend le geste
 * DÉLIBÉRÉ : on n'ouvre pas une conversation privée en cliquant sur une ligne,
 * on l'ouvre en écrivant pourquoi. La trace `AdminAuditLog` consigne ce texte.
 *
 * La requête n'est donc PAS armée tant que le motif n'est pas validé
 * (`enabled`), et le motif validé est figé : le modifier après coup relancerait
 * une lecture sous un autre motif sans que personne ne l'ait demandé.
 *
 * ## Les trois états d'un message, qu'il ne faut pas confondre
 *
 * 1. **contenu servi** — le cas nominal ;
 * 2. **contenu `null` + `isProtected`** — vue unique, flou, expiration
 *    consommée ou chiffrement. Ce n'est NI un message vide NI une erreur : la
 *    passerelle a retenu le texte, et l'écran le DIT. Rendre une bulle vide
 *    mentirait sur ce qui s'est passé ;
 * 3. **contenu vide sans protection** — un message qui ne porte que des
 *    pièces (un vocal, une photo). Son contenu utile est en dessous.
 *
 * ## Les pièces : ce qui se montre, ce qui se dit
 *
 * Une image libre s'affiche, un audio s'écoute (#6860 les fait enfin voyager).
 * Une pièce protégée n'a **pas d'URL** — la passerelle les met à `null` — et
 * l'écran affiche alors son nom, son poids et sa durée avec la mention qui
 * explique l'absence. Essayer de charger une URL nulle produirait une image
 * cassée, c'est-à-dire un ÉCHEC là où il y a une DÉCISION.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * La clé descend d'`ADMIN_SOUVERAIN_PREFIXE`, qu'exclut le filtre de
 * déshydratation de `query-client.ts`, et `gcTime: 0` ne la garde pas en
 * mémoire au-delà de l'écran.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

const CARTE = {
  backgroundColor: 'var(--color-ios-surface)',
  border: '1px solid var(--color-edge)',
} as const;

function estImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function estAudio(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

function Piece({
  piece,
  language,
}: {
  readonly piece: AdminSovereignAttachment;
  readonly language: InterfaceLanguage;
}) {
  // Une pièce protégée n'a pas d'URL : la montrer comme un média cassé
  // transformerait une DÉCISION en ÉCHEC.
  if (piece.isProtected || piece.fileUrl === null) {
    return (
      <li data-admin-attachment={piece.id} className="flex items-center gap-2 rounded-card px-3 py-2" style={CARTE}>
        <span className="min-w-0 flex-1 truncate text-caption" style={{ color: INK2 }}>
          {piece.originalName === '' ? piece.id : piece.originalName}
        </span>
        <span className="shrink-0 text-caption" style={{ color: 'var(--color-danger)' }}>
          {translate(language, 'admin.convDetail.attachmentProtected')}
        </span>
      </li>
    );
  }

  return (
    <li data-admin-attachment={piece.id} className="grid gap-1 rounded-card px-3 py-2" style={CARTE}>
      {estImage(piece.mimeType) ? (
        <img
          src={piece.fileUrl}
          alt={piece.originalName}
          loading="lazy"
          className="max-h-64 w-full rounded-card object-contain"
        />
      ) : estAudio(piece.mimeType) ? (
        // `controls` et rien d'autre : une lecture d'administration ne
        // s'autodéclenche pas, et `preload="none"` évite de tirer le fichier
        // avant que quelqu'un ne demande à l'entendre.
        <audio controls preload="none" src={piece.fileUrl} className="w-full" />
      ) : null}
      <span className="truncate text-caption" style={{ color: INK2 }}>
        {piece.originalName === '' ? piece.mimeType : piece.originalName}
        {piece.duration === null ? '' : ` · ${Math.round(piece.duration)}s`}
      </span>
    </li>
  );
}

function Message({
  message,
  language,
}: {
  readonly message: AdminSovereignMessage;
  readonly language: InterfaceLanguage;
}) {
  return (
    <li data-admin-message={message.id} className="grid gap-2 rounded-card px-4 py-3" style={CARTE}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-caption font-medium" style={{ color: INK }}>
          {message.sender?.displayName === '' || message.sender === null
            ? (message.sender?.userId ?? '—')
            : message.sender.displayName}
        </span>
        <span className="shrink-0 text-caption" style={{ color: INK2 }}>
          {message.createdAt ?? ''}
          {message.isEdited ? ` · ${translate(language, 'admin.convDetail.edited')}` : ''}
        </span>
      </div>

      {message.isProtected ? (
        <p className="text-caption italic" style={{ color: 'var(--color-danger)' }} data-admin-message-protected>
          {translate(language, 'admin.convDetail.protected')}
        </p>
      ) : message.content === null ? null : (
        <p className="whitespace-pre-wrap text-body" style={{ color: INK }}>
          {message.content}
        </p>
      )}

      {message.attachments.length === 0 ? null : (
        <ul className="grid gap-2">
          {message.attachments.map((piece) => (
            <Piece key={piece.id} piece={piece} language={language} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AdminConversationScreen() {
  const language = currentInterfaceLanguage();
  const route = useRoute();
  const conversationId = String((route.params as Record<string, unknown>).conversation ?? '');

  const [saisie, setSaisie] = useState('');
  /** Le motif VALIDÉ — figé une fois la lecture demandée. */
  const [motif, setMotif] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const autorise = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role).some(
    (section) => section.id === 'conversations',
  );

  const page = useQuery({
    queryKey: adminConversationMessagesQueryKey(conversationId, offset),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminSovereignMessages({
        ...apiDeps,
        conversationId,
        offset,
        reason: motif ?? '',
        signal,
      });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    // La lecture n'est ARMÉE qu'une fois le motif écrit et validé.
    enabled: autorise && motif !== null,
    retry: false,
    gcTime: 0,
  });

  const titre = translate(language, 'admin.convDetail.title');
  const motifSuffisant = saisie.trim().length >= MOTIF_LONGUEUR_MINIMALE;

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={4} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  if (motif === null) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <label className="grid gap-1 pb-2">
          <span className="text-caption" style={{ color: INK2 }}>
            {translate(language, 'admin.convDetail.reasonLabel')}
          </span>
          <textarea
            value={saisie}
            data-admin-reason
            rows={3}
            onChange={(event) => setSaisie(event.target.value)}
            className="rounded-card px-4 py-2 text-body"
            style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK }}
          />
          <span className="text-caption" style={{ color: INK2 }}>
            {translate(language, 'admin.convDetail.reasonHint')}
          </span>
        </label>
        <button
          type="button"
          data-admin-reason-submit
          disabled={!motifSuffisant}
          onClick={() => setMotif(saisie.trim())}
          className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
          style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
        >
          {translate(language, 'admin.convDetail.read')}
        </button>
      </AdminScreenFrame>
    );
  }

  const lot = page.data;

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      {page.isPending ? (
        <AdminSkeleton rows={6} />
      ) : lot === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.convList.unavailable')}
        </p>
      ) : lot.messages.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.convDetail.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {lot.messages.map((message) => (
              <Message key={message.id} message={message} language={language} />
            ))}
          </ul>
          <div className="flex justify-between gap-2 pt-4">
            <button
              type="button"
              data-admin-messages-prev
              disabled={offset === 0}
              onClick={() => setOffset((valeur) => Math.max(0, valeur - ADMIN_MESSAGES_PAGE_SIZE))}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
              style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
            >
              {translate(language, 'admin.users.previous')}
            </button>
            <button
              type="button"
              data-admin-messages-next
              disabled={!lot.hasMore}
              onClick={() => setOffset((valeur) => valeur + ADMIN_MESSAGES_PAGE_SIZE)}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
              style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
            >
              {translate(language, 'admin.users.next')}
            </button>
          </div>
        </>
      )}
    </AdminScreenFrame>
  );
}
