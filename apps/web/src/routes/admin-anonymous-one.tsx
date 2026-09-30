import { useQuery } from '@tanstack/react-query';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInterpretedBadge, AdminLanguageBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFiche, AdminFicheSection, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminErrorState, AdminOfflineNotice } from '@/components/admin/states';
import { INK, INK2, TONE_COLOR } from '@/components/admin/tone';
import { shareLinkStateOf } from '@/lib/admin/interpret/enums';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { personInitials, shareLinkLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import {
  anonymousConversationRefOf,
  anonymousEntityOf,
  anonymousPermissionPhrase,
  anonymousPresenceOf,
  anonymousStateOf,
} from '@/lib/admin/user-anonymous';
import type { AdminDeps } from '@/lib/api/admin';
import { adminAnonymousOneQueryOptions, type AdminAnonymousOne } from '@/lib/api/admin-anonymous';
import { ApiError } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { AdminAnnouncement, AdminSkeleton } from './admin-parts';

/**
 * **LA FICHE D'UN ANONYME** (#7873, #8876) — `/admin/anonymous/$participant` et
 * `/adm/anonymous/$participant`, sur le kit : ce qu'un administrateur doit savoir
 * d'une personne sans compte, LUE EN MOTS. Sous quel nom elle parle, dans quelle
 * langue (nommée), dans quelle conversation et par quel lien (deux puces qui
 * mènent à leurs fiches), depuis quand, combien de messages, avec quelles
 * permissions — dites en phrases, jamais `canSendFiles`.
 *
 * Ni jeton, ni adresse IP, ni empreinte d'appareil : la passerelle ne les sert
 * plus (#4157) et le décodeur ne les garderait pas. Le lien d'arrivée se nomme et
 * s'interprète (actif, expiré, fermé) sans jamais montrer son identifiant public
 * ni ses clés de jointure.
 *
 * **Aucun geste** : la passerelle n'en sert aucun sur un anonyme (exclure un invité
 * est une issue de suivi). Le seul contrôle est la copie de l'identifiant technique.
 *
 * Les puces ne sont cliquables que si le lecteur ouvre la section cible
 * (`AdminEntityChip` lit la portée) : jamais un lien vers un refus.
 */

function FicheState({ language, onRetry, denied, notFound }: { readonly language: InterfaceLanguage; readonly onRetry: () => void; readonly denied: boolean; readonly notFound: boolean }) {
  if (denied) return <AdminDeniedInline language={language} />;
  return (
    <AdminErrorState
      language={language}
      message={translateAdmin(language, notFound ? 'admin.people.anonymous.notFound' : 'admin.user.unavailable')}
      onRetry={onRetry}
    />
  );
}

function PermissionList({ fiche, language }: { readonly fiche: AdminAnonymousOne; readonly language: InterfaceLanguage }) {
  return (
    <div className="grid gap-3">
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.people.anonymous.section.permissions.hint')}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" data-admin-permissions>
        {fiche.permissions.map((permission) => (
          <li key={permission.key} data-admin-permission={permission.key} className="flex items-start gap-2 text-body" style={{ color: permission.granted ? INK : INK2 }}>
            <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: permission.granted ? TONE_COLOR.success : INK2 }}>
              <AdminGlyph name={permission.granted ? 'checkCircle' : 'prohibit'} size={16} />
            </span>
            <span className="min-w-0 break-words">{anonymousPermissionPhrase(permission.key, permission.granted, language)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryLink({ fiche, language, now }: { readonly fiche: AdminAnonymousOne; readonly language: InterfaceLanguage; readonly now: Date }) {
  const link = fiche.shareLink;
  if (link === null) {
    return (
      <p className="text-body" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.people.anonymous.entry.none')}
      </p>
    );
  }
  const state = shareLinkStateOf({ isActive: link.isActive, expiresAt: link.expiresAt }, now, language);
  const expiry = adminMomentOf(link.expiresAt, now, language);
  return (
    <dl className="grid gap-3">
      <AdminEntityChip
        language={language}
        entity={{ kind: 'shareLink', id: link.id, label: shareLinkLabel(link, language), secondary: state.label }}
      />
      <AdminMetaRow anchor="entryState" label={translateAdmin(language, 'admin.col.status')} value={<AdminInterpretedBadge value={state} />} explain={state.explain} />
      <AdminMetaRow
        anchor="entryExpiry"
        label={translateAdmin(language, 'admin.people.anonymous.entry.expires')}
        value={expiry === null ? translateAdmin(language, 'admin.people.anonymous.entry.noExpiry') : <AdminMomentText moment={expiry} variant="both" />}
      />
    </dl>
  );
}

export function AdminAnonymousFiche({
  participantId,
  language,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly participantId: string;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const announcer = useLiveAnnouncer();
  const query = useQuery(adminAnonymousOneQueryOptions(deps, participantId));

  if (query.isPending) return <AdminSkeleton rows={6} />;

  const fiche = query.data;
  if (fiche === undefined) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    return <FicheState language={language} denied={status === 403} notFound={status === 404} onRetry={() => void query.refetch()} />;
  }

  const moment = now();
  const entity = anonymousEntityOf(fiche, language, moment);
  const state = anonymousStateOf(fiche, language);
  const presence = anonymousPresenceOf(fiche, moment, language);
  const hiddenPresence = !fiche.isOnline && fiche.lastActiveAt === null;
  const granted = fiche.permissions.filter((permission) => permission.granted).length;
  const arrived = adminMomentOf(fiche.joinedAt, moment, language);
  const languageLabel = fiche.language === '' ? translateAdmin(language, 'admin.value.noLanguage') : sentenceCase(languageName(fiche.language, language), language);
  const when = (iso: string | null) => <AdminMomentText moment={adminMomentOf(iso, moment, language)} variant="both" />;
  const title = translateAdmin(language, 'admin.anonymous.title');

  return (
    <div className="grid gap-6" data-admin-anonymous-one={fiche.id}>
      <AdminPageHeader
        language={language}
        title={title}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.people') },
          { label: translateAdmin(language, 'admin.nav.anonymous'), target: { kind: 'section', section: 'anonymous' } },
          { label: entity.label },
        ]}
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="anonymous"
        header={
          <AdminIdentityHeader
            language={language}
            title={entity.label}
            secondary={translateAdmin(language, 'admin.people.anonymous.kind')}
            avatar={{
              initials: personInitials(entity.label),
              color: 'var(--color-ios-ink-3)',
              src: entity.avatarUrl ?? null,
              ...(entity.presence === undefined ? {} : { presence: entity.presence }),
            }}
            badges={
              <>
                <AdminInterpretedBadge value={state} />
                {hiddenPresence ? null : <AdminInterpretedBadge value={presence} />}
                {fiche.language === '' ? null : <AdminLanguageBadge language={language} code={fiche.language} />}
              </>
            }
          />
        }
        stats={
          <AdminStatStrip
            items={[
              { id: 'messages', label: translateAdmin(language, 'admin.people.anonymous.stat.messages'), value: formatCount(fiche.messageCount, language) },
              ...(fiche.permissions.length === 0
                ? []
                : [
                    {
                      id: 'permissions',
                      label: translateAdmin(language, 'admin.people.anonymous.stat.permissions'),
                      value: translateAdmin(language, 'admin.people.anonymous.stat.permissionsValue', {
                        granted: formatCount(granted, language),
                        total: formatCount(fiche.permissions.length, language),
                      }),
                    },
                  ]),
              { id: 'arrived', label: translateAdmin(language, 'admin.people.anonymous.stat.arrived'), value: arrived === null ? '—' : arrived.relative },
            ]}
          />
        }
        aside={
          <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
            <AdminMetaRow anchor="state" label={translateAdmin(language, 'admin.col.status')} value={<AdminInterpretedBadge value={state} />} explain={state.explain} />
            <AdminMetaRow anchor="language" label={translateAdmin(language, 'admin.col.language')} value={languageLabel} explain={fiche.language === '' ? null : translateAdmin(language, 'admin.people.anonymous.meta.languageExplain')} />
            <AdminMetaRow anchor="presence" label={translateAdmin(language, 'admin.people.anonymous.presence')} value={presence.label} explain={hiddenPresence ? presence.explain : null} />
            <AdminMetaRow anchor="joined" label={translateAdmin(language, 'admin.col.joined')} value={when(fiche.joinedAt)} />
            <AdminMetaRow
              anchor="lastActive"
              label={translateAdmin(language, 'admin.col.lastActive')}
              value={fiche.lastActiveAt === null ? presence.label : when(fiche.lastActiveAt)}
              explain={fiche.lastActiveAt === null ? presence.explain : null}
            />
            {fiche.leftAt === null ? null : <AdminMetaRow anchor="left" label={translateAdmin(language, 'admin.people.anonymous.meta.left')} value={when(fiche.leftAt)} />}
            <AdminMetaRow anchor="messages" label={translateAdmin(language, 'admin.col.messages')} value={formatCount(fiche.messageCount, language)} />
            <AdminTechnicalId language={language} id={fiche.id} onAnnounce={announcer.announce} />
          </AdminMetaPanel>
        }
      >
        <AdminFicheSection id="conversation" title={translateAdmin(language, 'admin.people.anonymous.section.conversation')}>
          {fiche.conversation === null ? (
            <p className="text-body" style={{ color: INK2 }}>
              —
            </p>
          ) : (
            <AdminEntityChip language={language} entity={anonymousConversationRefOf(fiche.conversation, language)} />
          )}
        </AdminFicheSection>
        <AdminFicheSection id="entry" title={translateAdmin(language, 'admin.people.anonymous.section.entry')}>
          <EntryLink fiche={fiche} language={language} now={moment} />
        </AdminFicheSection>
        {fiche.permissions.length === 0 ? null : (
          <AdminFicheSection id="permissions" title={translateAdmin(language, 'admin.people.anonymous.section.permissions')}>
            <PermissionList fiche={fiche} language={language} />
          </AdminFicheSection>
        )}
      </AdminFiche>
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminAnonymousOneScreen() {
  const language = currentInterfaceLanguage();
  const { participant } = useParams<'/admin/anonymous/$participant'>();

  return (
    <AdminSectionScreen section="anonymous" language={language} title={translateAdmin(language, 'admin.anonymous.title')}>
      {() => <AdminAnonymousFiche participantId={participant} language={language} />}
    </AdminSectionScreen>
  );
}
