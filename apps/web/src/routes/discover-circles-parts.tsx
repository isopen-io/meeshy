import type { RelationRequestLevel } from '@meeshy/shared/types/relation';
import { memo, useState, type ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { Sheet } from '@/components/sheet';
import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';
import type { RelationLink } from '@/lib/api/relations';
import { personNameOf } from '@/lib/discover/view';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { progressSummary, raiseOffer, requestedLevelOf, type CircleLevel } from '@/lib/relations/circles';
import { relationLevelIcon } from '@/lib/relations/level-labels';
import { levelTitle, progressText } from '@/lib/relations/progress-text';
import { CircleBringBlockSwitch } from '@/routes/circle-bring-block';
import { PERSON_ROW_HEIGHT, PersonAvatar, PersonText } from '@/routes/discover-parts';

/**
 * **LES PIÈCES DE « MES CERCLES »** (#13938) — miroir de `CircleRowView`,
 * `CircleRequestRow`, l'en-tête de section de `CirclesTab` et `CircleLinkSheet`
 * (`apps/ios/Meeshy/Features/Contacts/`). Chaque pièce est PURE : primitives en
 * props, aucun magasin global ; `discover-circles.test.tsx` les rend sans
 * TanStack Query.
 *
 * **Aucune pastille de présence**, comme le reste de Découvrir : la présence
 * d'un lien n'est pas servie par `GET /relations`, et l'écran n'en fabrique pas.
 *
 * **Divergences d'encre assumées** (AA) : iOS colore le titre d'une section et
 * la capsule « Demander » de la couleur du niveau (jaune pour Proche, bleu clair
 * pour Connaissance) ; ici la couleur du niveau ne porte que la PUCE décorative
 * de l'en-tête, le texte reste à l'encre et la capsule à l'indigo 600, comme
 * « Ajouter » — du blanc sur le jaune de Proche ne tient pas 2:1.
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
const BRAND_FILL = 'var(--ios-indigo-600)';
const EDGE = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';
const FIELD_FILL = 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/** La couleur d'un niveau, tirée des jetons (iso `CircleLevelColor`) — jamais une teinte écrite. */
const LEVEL_TINT: Readonly<Record<CircleLevel, string>> = {
  BLOOD: 'var(--color-error)',
  CLOSE: 'var(--color-warning)',
  FRIEND: 'var(--color-success)',
  ACQUAINTANCE: 'var(--ios-info)',
};

export const circlePersonName = (language: InterfaceLanguage, person: PersonSummary | null): string =>
  personNameOf(person, translate(language, 'discover.unknown'));

/** L'en-tête d'une section : l'icône du niveau, son nom et son compte — un titre pour le lecteur d'écran. */
export function CircleSectionHeader({ language, level, count }: { readonly language: InterfaceLanguage; readonly level: CircleLevel; readonly count: number }) {
  const title = levelTitle(language, level);
  return (
    <h2 data-circle-section={level} aria-label={`${title}, ${count}`} className="flex items-center gap-2 px-5 pt-5 pb-1.5 text-body font-bold" style={{ color: INK }}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_TINT[level] }} />
      <span aria-hidden="true">{relationLevelIcon(level)}</span>
      <span aria-hidden="true">{title}</span>
      <span aria-hidden="true" className="text-caption font-semibold tabular-nums" style={{ color: INK_2 }}>
        {count}
      </span>
    </h2>
  );
}

function PendingCapsule({ language, level }: { readonly language: InterfaceLanguage; readonly level: RelationRequestLevel }) {
  return (
    <span data-circle-pending={level} className="max-w-[9rem] shrink-0 text-end text-caption font-semibold" style={{ color: INK_2 }}>
      {translateCircles(language, 'circles.pending', { level: levelTitle(language, level) })}
    </span>
  );
}

/**
 * La ligne d'un lien — `CircleRowView` : la personne, ce qui manque pour monter,
 * et « Demander {cran} » quand la loi de demande le laisse proposer. Toucher la
 * ligne ouvre la fiche du lien ; le cran en attente se lit dans le panier des
 * envoyées, l'optimiste compris.
 */
export const CircleLinkRow = memo(function CircleLinkRow({
  language,
  link,
  person,
  pendingLevel,
  now,
  onOpen,
  onRaise,
}: {
  readonly language: InterfaceLanguage;
  readonly link: RelationLink;
  readonly person: PersonSummary | null;
  readonly pendingLevel: RelationRequestLevel | null;
  readonly now: Date;
  readonly onOpen: (link: RelationLink) => void;
  readonly onRaise: (link: RelationLink, target: RelationRequestLevel) => void;
}) {
  const name = circlePersonName(language, person);
  const line = progressText(language, progressSummary(link, now));
  const offer = raiseOffer(link, now);
  const description = [name, levelTitle(language, link.effectiveLevel), line].filter((part): part is string => part !== null).join(', ');
  return (
    <li data-circle-link={link.userId} data-circle-level={link.effectiveLevel} className="flex items-center gap-3 px-5 py-2.5" style={{ minHeight: PERSON_ROW_HEIGHT }}>
      <PersonAvatar person={person} name={name} />
      <button
        type="button"
        data-circle-open
        aria-label={description}
        onClick={() => onOpen(link)}
        className={`flex min-w-0 flex-1 items-center rounded-tile text-start ${FOCUS}`}
        style={{ minHeight: 44, outlineColor: BRAND }}
      >
        <PersonText person={person} name={name}>
          {line === null ? null : (
            <span data-circle-progress className="line-clamp-2 text-caption" style={{ color: INK_2 }}>
              {line}
            </span>
          )}
        </PersonText>
      </button>
      {pendingLevel !== null ? (
        <PendingCapsule language={language} level={pendingLevel} />
      ) : offer.kind === 'available' ? (
        <button
          type="button"
          data-circle-raise={offer.target}
          aria-label={translateCircles(language, 'circles.action.requestLabel', { level: levelTitle(language, offer.target), name })}
          onClick={() => onRaise(link, offer.target)}
          className={`grid shrink-0 place-items-center rounded-chip ${FOCUS}`}
          style={{ minHeight: 44, outlineColor: BRAND }}
        >
          <span className="flex h-[30px] items-center rounded-chip px-3 text-caption font-semibold text-ios-on-brand" style={{ backgroundColor: BRAND_FILL }}>
            {translateCircles(language, 'circles.action.request', { level: levelTitle(language, offer.target) })}
          </span>
        </button>
      ) : null}
    </li>
  );
});

export type CircleRequestHandlers = {
  readonly onAccept: (request: FriendRequestRecord) => void;
  readonly onDecline: (request: FriendRequestRecord) => void;
  readonly onCancel: (request: FriendRequestRecord) => void;
  readonly onRitual: (userId: string, person: PersonSummary | null) => void;
};

function RoundButton({ data, label, tone, onClick, children }: { readonly data: string; readonly label: string; readonly tone: 'muted' | 'accept' | 'blood'; readonly onClick: () => void; readonly children: ReactNode }) {
  const style =
    tone === 'muted'
      ? { color: INK_2, backgroundColor: FIELD_FILL }
      : tone === 'blood'
        ? { color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)' }
        : {
            color: 'var(--color-ios-on-brand)',
            backgroundImage:
              'linear-gradient(135deg, color-mix(in srgb, var(--color-success) 78%, var(--color-media-backdrop)), color-mix(in srgb, var(--color-success) 58%, var(--color-media-backdrop)))',
          };
  return (
    <button type="button" data-circle-request-action={data} aria-label={label} onClick={onClick} className={`grid size-11 shrink-0 place-items-center rounded-full ${FOCUS}`} style={{ ...style, outlineColor: BRAND }}>
      {children}
    </button>
  );
}

/**
 * La ligne d'une demande de montée — `CircleRequestRow` : reçue (refuser /
 * accepter) ou envoyée (annuler). Une demande de SANG n'a pas d'« accepter » :
 * c'est le rituel qui la scelle, et c'est lui que la ligne ouvre.
 */
export const CircleRequestRow = memo(function CircleRequestRow({
  language,
  request,
  direction,
  person,
  handlers,
}: {
  readonly language: InterfaceLanguage;
  readonly request: FriendRequestRecord;
  readonly direction: 'incoming' | 'outgoing';
  readonly person: PersonSummary | null;
  readonly handlers: CircleRequestHandlers;
}) {
  const name = circlePersonName(language, person);
  const level = requestedLevelOf(request);
  const isBlood = level === 'BLOOD';
  const otherId = direction === 'incoming' ? request.senderId : request.receiverId;
  const caption = translateCircles(language, direction === 'incoming' ? 'circles.requests.incoming' : 'circles.requests.outgoing', { level: levelTitle(language, level) });
  const ritual = (
    <RoundButton data="ritual" tone="blood" label={translateCircles(language, 'circles.requests.ritualLabel', { name })} onClick={() => handlers.onRitual(otherId, person)}>
      <span aria-hidden="true">{relationLevelIcon('BLOOD')}</span>
    </RoundButton>
  );
  return (
    <li data-circle-request={request.id} data-circle-request-direction={direction} className="flex items-center gap-3 px-5 py-2.5" style={{ minHeight: PERSON_ROW_HEIGHT }}>
      <PersonAvatar person={person} name={name} />
      <PersonText person={person} name={name}>
        <span data-circle-request-level={level} className="line-clamp-2 text-caption" style={{ color: INK_2 }}>
          {caption}
        </span>
      </PersonText>
      {direction === 'incoming' ? (
        <span className="flex shrink-0 items-center gap-2">
          <RoundButton data="decline" tone="muted" label={translateCircles(language, 'circles.requests.declineLabel', { name })} onClick={() => handlers.onDecline(request)}>
            <Glyph name="x" size={16} />
          </RoundButton>
          {isBlood ? (
            ritual
          ) : (
            <RoundButton data="accept" tone="accept" label={translateCircles(language, 'circles.requests.acceptLabel', { name })} onClick={() => handlers.onAccept(request)}>
              <Glyph name="check" size={16} />
            </RoundButton>
          )}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          {isBlood ? ritual : null}
          <RoundButton data="cancel" tone="muted" label={translateCircles(language, 'circles.requests.cancelLabel', { name })} onClick={() => handlers.onCancel(request)}>
            <Glyph name="x" size={16} />
          </RoundButton>
        </span>
      )}
    </li>
  );
});

/** Le cache reste affiché ; l'échec de la relecture se dit au-dessus, discrètement, avec « Réessayer ». */
export function CirclesErrorBanner({ language, onRetry }: { readonly language: InterfaceLanguage; readonly onRetry: () => void }) {
  return (
    <div role="status" data-circles-error className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: EDGE }}>
      <span aria-hidden="true" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={16} />
      </span>
      <span className="min-w-0 flex-1 text-caption" style={{ color: INK_2 }}>
        {translateCircles(language, 'circles.error.load')}
      </span>
      <button type="button" data-circles-retry onClick={onRetry} className={`grid shrink-0 place-items-center rounded-chip px-2 text-caption font-semibold ${FOCUS}`} style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}>
        {translate(language, 'discover.retry')}
      </button>
    </div>
  );
}

const SETTINGS = ['circles.settings.listening', 'circles.settings.talkie', 'circles.settings.location'] as const;

/**
 * La fiche d'un lien — `CircleLinkSheet` : la personne, son niveau, ce qui
 * manque pour monter, et les réglages PAR PERSONNE (écoute, talkie, Bring,
 * position), qui n'existent côté serveur qu'au jalon 2 (#14229). Ils sont
 * MONTRÉS désactivés et l'interface le DIT : ni cachés (on chercherait où ils
 * sont), ni simulés (un interrupteur sans effet est un mensonge). Le premier
 * livré, « Bloquer ses Bring » (#13936), est ACTIF (`circle-bring-block.tsx`) ;
 * son échec se dit dans la fiche.
 */
export function CircleLinkSheet({
  language,
  link,
  person,
  now,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly link: RelationLink;
  readonly person: PersonSummary | null;
  readonly now: Date;
  readonly onClose: () => void;
}) {
  const name = circlePersonName(language, person);
  const line = progressText(language, progressSummary(link, now));
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <Sheet title={name} presentation="bottom" bodyAs="div" closeLabel={translateCircles(language, 'circles.sheet.close')} dialogData={{ 'data-circle-sheet': link.userId }} onClose={onClose}>
      <div className="grid gap-4 px-5 pb-6">
        <div className="flex items-center gap-3">
          <PersonAvatar person={person} name={name} />
          <span data-circle-sheet-level={link.effectiveLevel} className="text-body font-semibold" style={{ color: INK }}>
            <span aria-hidden="true">{relationLevelIcon(link.effectiveLevel)} </span>
            {levelTitle(language, link.effectiveLevel)}
          </span>
        </div>
        {line === null ? null : (
          <p className="text-body" style={{ color: INK_2 }}>
            {line}
          </p>
        )}
        <section aria-labelledby={`circle-settings-${link.userId}`} className="grid gap-1">
          <h3 id={`circle-settings-${link.userId}`} className="text-body font-bold" style={{ color: INK }}>
            {translateCircles(language, 'circles.sheet.settings.title')}
          </h3>
          <CircleBringBlockSwitch language={language} userId={link.userId} level={link.effectiveLevel} onNotice={setNotice} />
          {notice === null ? null : (
            <p role="status" data-circle-setting-notice className="text-caption" style={{ color: 'var(--color-error)' }}>
              {notice}
            </p>
          )}
          <p id={`circle-settings-note-${link.userId}`} className="text-caption" style={{ color: INK_2 }}>
            {translateCircles(language, 'circles.sheet.settings.unavailable')}
          </p>
          {SETTINGS.map((key) => (
            <label key={key} className="flex items-center gap-3 opacity-60" style={{ minHeight: 44, color: INK }}>
              <span className="min-w-0 flex-1 text-body">{translateCircles(language, key)}</span>
              <input type="checkbox" role="switch" data-circle-setting={key} checked={false} disabled aria-describedby={`circle-settings-note-${link.userId}`} readOnly className="size-5" />
            </label>
          ))}
        </section>
      </div>
    </Sheet>
  );
}
