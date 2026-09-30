import type { CSSProperties, ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import type { UserPresenceStatus } from '@/lib/api/types';
import {
  adminListRoute,
  sectionOfEntity,
  type AdminEntityKind,
  type AdminSectionId,
  type AdminSpace,
  type AdminTarget,
} from '@/lib/admin/admin-routes';
import { personInitials } from '@/lib/admin/interpret/labels';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { participantAvatarOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

import { AdminGlyph, type AdminGlyphName } from './admin-glyph';
import { BRAND, INK, INK2 } from './tone';

/**
 * UNE ENTITÉ, NOMMÉE (#8876) — la référence que portent les cellules, les
 * fiches et les chronologies : le genre, l'identifiant (pour le lien), et le
 * nom DÉJÀ résolu par la bibliothèque d'interprétation.
 */
export type AdminEntityRef = {
  readonly kind: AdminEntityKind;
  readonly id: string;
  readonly label: string;
  readonly secondary?: string | null;
  readonly avatarUrl?: string | null;
  readonly presence?: UserPresenceStatus;
  /** Barré, avec le mot « supprimé » : l'entité existait, elle n'existe plus. */
  readonly deleted?: boolean;
};

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const FOCUS_STYLE = { outlineColor: BRAND } as const;

type LinkStyling = {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly anchor?: string;
  readonly ariaLabel?: string;
};

function attributes(styling: LinkStyling, search: Readonly<Record<string, string>> | undefined) {
  return {
    ...(styling.className === undefined ? {} : { className: styling.className }),
    ...(styling.style === undefined ? {} : { style: styling.style }),
    ...(styling.ariaLabel === undefined ? {} : { 'aria-label': styling.ariaLabel }),
    ...(styling.anchor === undefined ? {} : { 'data-admin-link': styling.anchor }),
    ...(search === undefined ? {} : { search }),
  };
}

function sectionLink(section: AdminSectionId, space: AdminSpace, children: ReactNode, attrs: ReturnType<typeof attributes>) {
  return (
    <Link to={adminListRoute(section, space)} {...attrs}>
      {children}
    </Link>
  );
}

/** UN `switch` exhaustif par genre : chaque fiche a son paramètre (`user`, `link`, `participant`…), et `never` refuse un genre oublié. */
function entityLink(kind: AdminEntityKind, id: string, space: AdminSpace, children: ReactNode, attrs: ReturnType<typeof attributes>) {
  const adm = space === 'adm';
  switch (kind) {
    case 'user':
      return (
        <Link to={adm ? 'admUser' : 'adminUser'} params={{ user: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'anonymous':
      return (
        <Link to={adm ? 'admAnonymousOne' : 'adminAnonymousOne'} params={{ participant: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'invitation':
      return (
        <Link to={adm ? 'admInvitation' : 'adminInvitation'} params={{ invitation: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'conversation':
      return (
        <Link to={adm ? 'admConversation' : 'adminConversation'} params={{ conversation: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'community':
      return (
        <Link to={adm ? 'admCommunity' : 'adminCommunity'} params={{ community: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'shareLink':
      return (
        <Link to={adm ? 'admShareLink' : 'adminShareLink'} params={{ link: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'post':
      return (
        <Link to={adm ? 'admPost' : 'adminPost'} params={{ post: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'report':
      return (
        <Link to={adm ? 'admReport' : 'adminReport'} params={{ report: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'trackingLink':
      return (
        <Link to={adm ? 'admTrackingLink' : 'adminTrackingLink'} params={{ link: id }} {...attrs}>
          {children}
        </Link>
      );
    case 'broadcast':
      return (
        <Link to={adm ? 'admBroadcast' : 'adminBroadcast'} params={{ broadcast: id }} {...attrs}>
          {children}
        </Link>
      );
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Genre d'entité d'administration non géré : ${String(value)}`);
}

type LinkProps = {
  readonly target: AdminTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly anchor?: string;
  readonly ariaLabel?: string;
};

/**
 * LE LIEN, SANS GARDE (#8876) — résout la cible dans l'espace donné. Exporté pour
 * que les dix genres d'entité se mesurent TOUS, y compris ceux dont la section
 * n'est pas encore prête (`AdminLink` ne les rendrait pas en lien) : c'est ici que
 * vit le `switch` exhaustif, et un lot qui bascule son drapeau ne doit pas être le
 * premier à l'exécuter. Un appelant du produit passe par `AdminLink`.
 */
export function AdminRouteLink({ target, space, children, className, style, anchor, ariaLabel }: LinkProps & { readonly space: AdminSpace }) {
  const attrs = attributes(
    {
      className: `${className ?? ''} ${FOCUS}`.trim(),
      style: { ...FOCUS_STYLE, ...style },
      ...(anchor === undefined ? {} : { anchor }),
      ...(ariaLabel === undefined ? {} : { ariaLabel }),
    },
    target.search,
  );
  return target.kind === 'section' ? sectionLink(target.section, space, children, attrs) : entityLink(target.entity, target.id, space, children, attrs);
}

/**
 * UN LIEN D'ADMINISTRATION (#8876) — vers une section ou la fiche d'une entité,
 * TOUJOURS dans l'espace courant (`/adm` reste `/adm`, D-76).
 *
 * **Il ne MENT pas** : si le lecteur ne peut pas ouvrir la section cible
 * (permission manquante, ou section pas encore prête), il rend le texte SEUL —
 * jamais un lien vers un refus ou un écran d'attente (loi 4).
 */
export function AdminLink({ target, children, className, style, anchor, ariaLabel }: LinkProps) {
  const reach = useAdminReach();
  const section = target.kind === 'section' ? target.section : sectionOfEntity(target.entity);

  if (!reach.opens(section)) {
    return (
      <span {...(className === undefined ? {} : { className })} {...(style === undefined ? {} : { style })}>
        {children}
      </span>
    );
  }

  return (
    <AdminRouteLink
      target={target}
      space={reach.space}
      {...(className === undefined ? {} : { className })}
      {...(style === undefined ? {} : { style })}
      {...(anchor === undefined ? {} : { anchor })}
      {...(ariaLabel === undefined ? {} : { ariaLabel })}
    >
      {children}
    </AdminRouteLink>
  );
}

export function AdminEntityLink({
  entity,
  children,
  className,
}: {
  readonly entity: AdminEntityRef;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <AdminLink
      target={{ kind: 'entity', entity: entity.kind, id: entity.id }}
      {...(className === undefined ? {} : { className })}
    >
      {children ?? entity.label}
    </AdminLink>
  );
}

const ENTITY_GLYPH: Readonly<Record<AdminEntityKind, AdminGlyphName>> = {
  user: 'user',
  anonymous: 'detective',
  invitation: 'handshake',
  conversation: 'chats',
  community: 'usersThree',
  shareLink: 'linkSimple',
  post: 'newspaper',
  report: 'flag',
  trackingLink: 'target',
  broadcast: 'megaphone',
};

const PEOPLE: readonly AdminEntityKind[] = ['user', 'anonymous'];

function ChipVisual({ entity, size }: { readonly entity: AdminEntityRef; readonly size: number }) {
  if (!PEOPLE.includes(entity.kind) && entity.avatarUrl === undefined) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: size, height: size, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)', color: INK2 }}
      >
        <AdminGlyph name={ENTITY_GLYPH[entity.kind]} size={Math.round(size * 0.55)} />
      </span>
    );
  }
  const photo = participantAvatarOf({ avatar: entity.avatarUrl ?? '' });
  return (
    <Avatar
      initials={personInitials(entity.label)}
      color="var(--color-ios-brand)"
      size={size}
      name={entity.label}
      {...(photo === undefined ? {} : { src: photo })}
      {...(entity.presence === undefined ? {} : { presence: entity.presence })}
    />
  );
}

/**
 * L'IDENTITÉ D'UNE ENTITÉ, SANS LIEN (#8876) — avatar (ou glyphe du genre), VRAI
 * NOM, secondaire. C'est ce qu'une colonne PRIMAIRE de liste pose : la liste
 * enveloppe elle-même la cellule dans le lien vers la fiche, et un lien dans un
 * lien n'est pas du HTML valide. Partout ailleurs, `AdminEntityChip`.
 */
export function AdminEntityIdentity({
  language,
  entity,
  size = 'md',
}: {
  readonly language: InterfaceLanguage;
  readonly entity: AdminEntityRef;
  readonly size?: 'sm' | 'md';
}) {
  const deleted = entity.deleted === true;
  return (
    <span className="flex min-w-0 items-center gap-3" data-admin-entity={entity.kind}>
      <ChipVisual entity={entity} size={size === 'sm' ? 28 : 36} />
      <span className="min-w-0">
        <span className="block truncate font-medium" style={{ color: INK, textDecoration: deleted ? 'line-through' : 'none' }}>
          {entity.label}
        </span>
        {entity.secondary === undefined || entity.secondary === null ? null : (
          <span className="block truncate text-caption" style={{ color: INK2 }}>
            {entity.secondary}
          </span>
        )}
        {deleted ? (
          <span className="block text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.kit.entity.deleted')}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * LA PUCE D'ENTITÉ (#8876) — avatar (ou glyphe du genre), VRAI NOM, secondaire.
 * La puce ENTIÈRE est le lien vers la fiche (cible de 44 px) quand le lecteur
 * peut l'ouvrir ; sinon une étiquette — et une entité supprimée n'a plus de
 * fiche à ouvrir. L'identifiant n'apparaît jamais ici.
 */
export function AdminEntityChip({
  language,
  entity,
  size = 'md',
}: {
  readonly language: InterfaceLanguage;
  readonly entity: AdminEntityRef;
  readonly size?: 'sm' | 'md';
}) {
  const identity = <AdminEntityIdentity language={language} entity={entity} size={size} />;
  if (entity.deleted === true) return identity;
  return (
    <AdminLink
      target={{ kind: 'entity', entity: entity.kind, id: entity.id }}
      className="flex min-w-0 items-center"
      style={{ minHeight: 44 }}
      ariaLabel={translateAdmin(language, 'admin.kit.entity.open', { name: entity.label })}
    >
      {identity}
    </AdminLink>
  );
}
