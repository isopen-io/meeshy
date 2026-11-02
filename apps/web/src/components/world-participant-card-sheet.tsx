import { useEffect, useId, useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import type { ApiFailure } from '@/lib/api/http';
import {
  isWorldParticipantCardRefusal,
  loadWorldParticipantCard,
  worldParticipantCardQueryKey,
  type WorldParticipantCardDeps,
} from '@/lib/api/world-participant-card';
import { loadWorldParticipantCardCatalog, translateWorldParticipantCard } from '@/lib/i18n-world-participant-card-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { worldParticipantCardView, type WorldParticipantCardRow, type WorldParticipantCardView } from '@/lib/view/world-participant-card-view';

import { Avatar } from './avatar';
import { GlyphSvg } from './glyph';
import { THREAD_IDENTITY_GLYPHS } from './glyphs-thread-identity';
import { Sheet } from './sheet';

/**
 * **LA FICHE D'UN PARTICIPANT DE WORLD WIDE** (#10102) — ce que l'équipe lit
 * d'une personne qu'elle modère, par-dessus le fil qu'elle lisait : sous quel
 * nom elle parle et si elle a un compte, ses langues, son pays, son poste, son
 * arrivée et le lien par lequel elle est entrée, son rôle.
 *
 * Une FEUILLE BASSE sur un téléphone, une fenêtre centrée sur un ordinateur
 * (`Sheet`, `presentation="bottom"`) — le geste des précisions qu'on ouvre d'un
 * toucher et qu'on referme aussitôt. Les lignes sont celles des réglages iOS :
 * un libellé, une valeur, groupés par sujet.
 *
 * ÉTATS DESSINÉS : lecture (squelette, cache VIDE seulement — une fiche déjà
 * lue s'affiche aussitôt et se relit en silence), fiche, personne partie
 * (404), échec avec « Réessayer ». **Un REFUS (403) ne dessine rien** : la
 * feuille se referme — la porte s'est fermée côté passerelle, et l'écran ne
 * dit pas qu'il existait une fiche à refuser.
 *
 * Chaque lecture est tracée au journal d'audit par la passerelle ; la feuille
 * le dit, et la fraîcheur d'une minute évite d'en écrire une à chaque rendu.
 */

export async function prepareWorldParticipantCardSheet(): Promise<void> {
  await loadWorldParticipantCardCatalog(currentInterfaceLanguage()).catch(() => undefined);
}

class WorldParticipantCardFailure extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.error);
  }
}

const CARD_FRESHNESS_MS = 60 * 1000;
const CARD_MEMORY_MS = 5 * 60 * 1000;

export function WorldParticipantCardSheet({
  participantId,
  deps,
  client,
  onClose,
  onRefused,
}: {
  readonly participantId: string;
  readonly deps: WorldParticipantCardDeps;
  readonly client: QueryClient;
  readonly onClose: () => void;
  /** Un 403 : la passerelle a refusé. L'hôte referme la feuille ET relit le
   * rôle servi — sinon un rôle retiré laisserait des auteurs touchables pour
   * rien jusqu'à la péremption de la matrice. */
  readonly onRefused?: () => void;
}) {
  const language = currentInterfaceLanguage();
  const query = useQuery(
    {
      queryKey: worldParticipantCardQueryKey(participantId),
      queryFn: async ({ signal }) => {
        const result = await loadWorldParticipantCard({ ...deps, participantId, signal });
        if (!result.ok) throw new WorldParticipantCardFailure(result);
        return result.data;
      },
      staleTime: CARD_FRESHNESS_MS,
      gcTime: CARD_MEMORY_MS,
      retry: false,
    },
    client,
  );
  const failure = query.error instanceof WorldParticipantCardFailure ? query.error.failure : null;
  const refused = failure !== null && isWorldParticipantCardRefusal(failure);

  useEffect(() => {
    if (refused) (onRefused ?? onClose)();
  }, [refused, onClose, onRefused]);

  const view = useMemo(
    () => (query.data === undefined ? null : worldParticipantCardView(query.data, { language, t: (key) => translateWorldParticipantCard(language, key) })),
    [query.data, language],
  );

  if (refused) return null;

  return (
    <Sheet
      title={translateWorldParticipantCard(language, 'worldCard.title')}
      bodyAs="div"
      presentation="bottom"
      dialogData={{ 'data-world-participant-card': participantId }}
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-1">
        {view !== null ? (
          <CardBody view={view} purpose={translateWorldParticipantCard(language, 'worldCard.purpose')} />
        ) : failure !== null && failure.status === 404 ? (
          <p className="py-8 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateWorldParticipantCard(language, 'worldCard.notFound')}
          </p>
        ) : query.isError ? (
          <div className="grid justify-items-center gap-3 py-8 text-center">
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translateWorldParticipantCard(language, 'worldCard.error')}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-full px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)', color: 'var(--accent, var(--color-ios-brand))', outlineColor: 'var(--accent, var(--color-ios-brand))' }}
            >
              {translateWorldParticipantCard(language, 'worldCard.retry')}
            </button>
          </div>
        ) : (
          <CardSkeleton label={translateWorldParticipantCard(language, 'worldCard.loading')} />
        )}
      </div>
    </Sheet>
  );
}

/**
 * LA PASTILLE DE NATURE SE LIT (WCAG 1.4.3) — la teinte (violet du masque pour
 * un anonyme, accent du fil sinon) colore le FOND et le glyphe ; le texte est
 * à l'encre. Teinte sur sa propre teinte à 14 %, il tombait à 3,2:1 en clair
 * (violet) et 3,6:1 (indigo), sous le 4,5:1 d'un libellé de 12 px.
 */
export function worldCardKindChipColors(kind: WorldParticipantCardView['header']['kind']): {
  readonly ink: string;
  readonly tint: string;
  readonly ground: string;
} {
  const tint = kind === 'anonymous' ? 'var(--ios-purple-500)' : 'var(--accent, var(--color-ios-brand))';
  return { ink: 'var(--color-ios-ink)', tint, ground: `color-mix(in srgb, ${tint} 14%, transparent)` };
}

function CardBody({ view, purpose }: { readonly view: WorldParticipantCardView; readonly purpose: string }) {
  const { header } = view;
  const chip = worldCardKindChipColors(header.kind);
  return (
    <div className="grid gap-5">
      <div
        className="flex items-center gap-3.5 rounded-[18px] p-3.5"
        style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent, var(--color-ios-brand)) 16%, var(--color-ios-card)), var(--color-ios-card))' }}
      >
        <Avatar initials={header.initials} color="var(--accent, var(--color-ios-brand))" size={56} {...(header.avatar === null ? {} : { src: header.avatar })} />
        <div className="grid min-w-0 gap-1">
          <p className="truncate text-thread font-bold leading-tight" style={{ color: 'var(--color-ios-ink)' }}>
            {header.name}
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption">
            <span
              data-world-card-kind={header.kind}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
              style={{ color: chip.ink, backgroundColor: chip.ground }}
            >
              {header.kind === 'anonymous' ? <GlyphSvg glyph={THREAD_IDENTITY_GLYPHS.maskHappy} size={13} style={{ color: chip.tint }} /> : null}
              {header.kindLabel}
            </span>
            {header.handle === null ? null : (
              <span className="truncate" style={{ color: 'var(--color-ios-ink-2)' }} dir="ltr">
                {header.handle}
              </span>
            )}
          </p>
        </div>
      </div>

      {view.withheldNotice === null ? null : (
        <p
          data-world-card-withheld
          className="rounded-[14px] px-3.5 py-2.5 text-caption"
          style={{ color: 'var(--color-ios-ink)', backgroundColor: 'color-mix(in srgb, var(--color-warning) 14%, var(--color-ios-card))' }}
        >
          {view.withheldNotice}
        </p>
      )}

      {view.sections.map((section) => (
        <CardSection key={section.id} title={section.title} rows={section.rows} />
      ))}

      <p className="px-1 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
        {purpose}
      </p>
    </div>
  );
}

function CardSection({ title, rows }: { readonly title: string; readonly rows: readonly WorldParticipantCardRow[] }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="grid gap-1.5">
      <h3 id={titleId} className="px-1 text-mini font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-3)' }}>
        {title}
      </h3>
      <dl className="overflow-hidden rounded-[14px]" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        {rows.map((row, index) => (
          <div
            key={row.id}
            data-world-card-row={row.id}
            className="flex items-start gap-3 px-3.5 py-2.5"
            style={{ minHeight: 44, borderTop: index === 0 ? undefined : '0.5px solid var(--color-ios-hairline)' }}
          >
            <dt className="shrink-0 pt-px text-caption" style={{ color: 'var(--color-ios-ink-2)', maxWidth: '45%' }}>
              {row.label}
            </dt>
            <dd className="m-0 grid min-w-0 flex-1 justify-items-end gap-0.5 text-end">
              <span
                className={`inline-flex min-w-0 items-center gap-1.5 text-body${row.tone === 'withheld' ? ' italic' : ''}`}
                style={{ color: row.tone === undefined ? 'var(--color-ios-ink)' : 'var(--color-ios-ink-3)' }}
              >
                {row.leading === undefined ? null : (
                  <span aria-hidden className="shrink-0">
                    {row.leading}
                  </span>
                )}
                <span className="min-w-0 break-words">{row.value}</span>
              </span>
              {row.detail === undefined ? null : (
                <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }} dir="ltr">
                  {row.detail}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CardSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-5">
      <span className="offscreen">{label}</span>
      <div aria-hidden className="flex items-center gap-3.5 rounded-[18px] p-3.5" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        <span className="block size-14 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-surface)' }} />
        <span className="grid flex-1 gap-2">
          <span className="block h-4 w-2/5 animate-pulse rounded motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-surface)' }} />
          <span className="block h-3 w-1/4 animate-pulse rounded motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-surface)' }} />
        </span>
      </div>
      {[0, 1, 2].map((block) => (
        <div key={block} aria-hidden className="h-24 animate-pulse rounded-[14px] motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      ))}
    </div>
  );
}
