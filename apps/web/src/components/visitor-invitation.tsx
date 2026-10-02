import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { resolveLinkSharer, type LinkSharer } from '@/lib/api/tracking-links';
import { loadVisitorCatalog, translateVisitor } from '@/lib/i18n-visitor-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { isTrackingToken } from '@/lib/links/tracking-redirect';
import { useRoute } from '@/lib/router';
import { safeNextPath } from '@/lib/session-guard';
import { participantAvatarOf, initialsOf } from '@/lib/view/conversation';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { useViewer } from '@/lib/view/use-viewer';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { BUTTON } from './ui-chrome';

/**
 * **UN VISITEUR SANS COMPTE VOIT LE CONTENU PARTAGÉ** (#9149) — directive
 * porteur du 2026-10-02 : « les pages web ne doivent pas bloquer si pas
 * connecté ! Il faut afficher le contenu et demander à se connecter avec une
 * modale par-dessus », et « surtout INDIQUER qui a envoyé le lien ».
 *
 * UN hôte pour les trois lecteurs (réel, publication, story) : chacun dit
 * l'ÉTAT de son contenu — `pending` (en lecture), `served` (là, derrière),
 * `refused` (refusé ou introuvable, rien derrière) — et monte `dialog`. Les
 * gestes qui exigent un compte (aimer, commenter, répondre, partager)
 * appellent `ask` : la même modale revient, jamais un 401 en silence.
 *
 * - `?via=<jeton>` — posé par `/l/<jeton>` (`sharedContentPath`) — se relit
 *   ici pour nommer le partageur (`GET /tracking-links/:token/resolve`,
 *   champ `sharer`). Aucune identité ne voyage dans l'adresse.
 * - « Créer un compte » et « Se connecter » portent `next` = l'adresse
 *   COURANTE, `via` compris : l'inscription comme la connexion y ramènent
 *   (`landingAfterSession`, `landingAfterRegistration`).
 * - Un contenu SERVI laisse le visiteur regarder (« Continuer à regarder ») ;
 *   un contenu REFUSÉ n'a rien derrière la modale, qui ne se ferme donc pas.
 */

export type VisitorContentKind = 'reel' | 'post' | 'story' | 'mood';
export type VisitorContentState = 'pending' | 'served' | 'refused';

export function visitorReturnPath(pathname: string, search: string): string | null {
  return safeNextPath(`${pathname}${search}`);
}

export function viaTokenOf(search: URLSearchParams): string | null {
  const via = search.get('via');
  return via !== null && isTrackingToken(via) ? via : null;
}

/** Le REFUS d'un contenu — 403 et 404 confondus (D-6) : seul ce verdict
 * devient « ce contenu n'est pas accessible ». Une panne ou une coupure garde
 * l'état d'erreur de l'écran, avec son « Réessayer ». */
export function isContentRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export function invitationOpen(input: { readonly visitor: boolean; readonly state: VisitorContentState; readonly dismissed: boolean }): boolean {
  if (!input.visitor || input.state === 'pending') return false;
  return input.state === 'refused' || !input.dismissed;
}

const SHARED_BY: Readonly<Record<VisitorContentKind, (language: InterfaceLanguage, name: string) => string>> = {
  reel: (language, name) => translateVisitor(language, 'visitor.sharedBy.reel', { name }),
  post: (language, name) => translateVisitor(language, 'visitor.sharedBy.post', { name }),
  story: (language, name) => translateVisitor(language, 'visitor.sharedBy.story', { name }),
  mood: (language, name) => translateVisitor(language, 'visitor.sharedBy.mood', { name }),
};

const sharerName = (sharer: LinkSharer): string => sharer.displayName?.trim() || sharer.username;

export function VisitorInvitationDialog({
  language,
  kind,
  state,
  sharer,
  returnTo,
  onDismiss,
}: {
  readonly language: InterfaceLanguage;
  readonly kind: VisitorContentKind;
  readonly state: 'served' | 'refused';
  readonly sharer: LinkSharer | null;
  readonly returnTo: string | null;
  readonly onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const served = state === 'served';
  useBackDismiss(served ? onDismiss : () => {});

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const named = served && sharer !== null ? sharer : null;
  const title = served
    ? named === null
      ? translateVisitor(language, 'visitor.title')
      : SHARED_BY[kind](language, sharerName(named))
    : translateVisitor(language, 'visitor.refused.title');
  const next = { next: returnTo ?? undefined };
  const avatar = named === null ? undefined : participantAvatarOf({ avatar: named.avatar });

  return (
    <dialog
      ref={ref}
      data-visitor-invitation={state}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        if (!served) event.preventDefault();
      }}
      onClose={served ? onDismiss : undefined}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-card p-0 backdrop:bg-veil"
      style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: 0 }}
    >
      <div className="grid justify-items-center gap-4 p-6 text-center">
        {named !== null ? (
          <Avatar
            initials={initialsOf(sharerName(named))}
            color="var(--color-ios-brand)"
            size={64}
            name={sharerName(named)}
            {...(avatar === undefined ? {} : { src: avatar })}
          />
        ) : null}
        <h2 id={titleId} className="text-thread font-extrabold">
          {title}
        </h2>
        <p id={bodyId} className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateVisitor(language, served ? 'visitor.body' : 'visitor.refused.body')}
        </p>
        <div className="grid w-full gap-2">
          <Link to="signup" search={next} className={`${BUTTON.primary} w-full`}>
            {translateVisitor(language, 'visitor.signup')}
          </Link>
          <Link to="login" search={next} className={`${BUTTON.secondary} w-full`}>
            {translateVisitor(language, 'visitor.login')}
          </Link>
          {served ? (
            <button type="button" onClick={onDismiss} className="min-h-11 text-body font-semibold" style={{ color: 'var(--color-ios-brand)' }}>
              {translateVisitor(language, 'visitor.later')}
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

export type VisitorInvitation = {
  /** Aucun compte : ni session, ni l'invité d'un lien de conversation. */
  readonly visitor: boolean;
  /** Rouvre l'invitation — le geste d'un visiteur qui exige un compte. */
  readonly ask: () => void;
  readonly dialog: ReactNode;
};

export function useVisitorInvitation({ kind, state }: { readonly kind: VisitorContentKind; readonly state: VisitorContentState }): VisitorInvitation {
  const viewer = useViewer();
  const visitor = viewer.id === null || viewer.isAnonymous;
  const { search } = useRoute();
  const via = viaTokenOf(search);
  const [dismissed, setDismissed] = useState(false);
  const sharer = useQuery({
    queryKey: ['tracking-links', via ?? '', 'sharer'] as const,
    queryFn: () => resolveLinkSharer(apiDeps, via ?? '').then(unwrap),
    enabled: visitor && via !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  /* Le catalogue de la modale se charge pour un visiteur SEUL : un lecteur
     connecté n'en télécharge rien. La modale attend qu'il soit là. */
  const language = currentInterfaceLanguage();
  const catalog = useQuery({
    queryKey: ['visitor-catalog', language] as const,
    queryFn: () => loadVisitorCatalog(language),
    enabled: visitor,
    staleTime: Infinity,
  });
  const ask = useCallback(() => setDismissed(false), []);
  const dismiss = useCallback(() => setDismissed(true), []);
  const open = invitationOpen({ visitor, state, dismissed });
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname;
  const query = search.toString();

  return {
    visitor,
    ask,
    dialog:
      open && state !== 'pending' && catalog.data !== undefined ? (
        <VisitorInvitationDialog
          key={state}
          language={language}
          kind={kind}
          state={state}
          sharer={sharer.data ?? null}
          returnTo={visitorReturnPath(pathname, query === '' ? '' : `?${query}`)}
          onDismiss={dismiss}
        />
      ) : null,
  };
}
