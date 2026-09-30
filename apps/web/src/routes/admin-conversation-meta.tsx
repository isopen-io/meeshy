import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { conversationStateOf } from '@/lib/admin/conversation-model';
import { interpretConversationType, interpretEncryption, interpretWriteRole } from '@/lib/admin/interpret/enums';
import { booleanPhrase, excerptOf, personLabel, personSecondary } from '@/lib/admin/interpret/labels';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import type { AdminConversationFiche } from '@/lib/api/admin-conversation-fiche';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES MÉTADONNÉES D'UNE CONVERSATION, INTERPRÉTÉES** (#8876) — chaque champ
 * servi a un libellé traduit et une valeur humaine : le type et l'état en mots,
 * le rang d'écriture nommé, le mode lent en durée, les booléens en phrases, le
 * chiffrement avec sa conséquence, les dates absolues ET relatives, et
 * l'identifiant technique seul dans sa ligne copiable.
 *
 * ## Ce qu'une conversation N'A PAS n'est pas dessiné
 *
 * `direct` et `global` n'ont aucune hiérarchie d'écriture (la passerelle n'y
 * applique ni rang, ni mode lent, ni canal d'annonces —
 * `WRITE_HIERARCHY_FREE_TYPES`) : ces trois lignes y seraient des valeurs
 * servies que rien n'applique, donc un mensonge. Elles n'apparaissent que là où
 * elles gouvernent.
 *
 * ## Archivée et fermée disent la même chose à l'écriture
 *
 * `isConversationClosed` refuse l'envoi dès que `isActive` est faux OU que
 * `closedAt` est posé. L'état affiché est le plus fort des deux (fermée), et
 * la phrase qui l'accompagne dit l'effet réel.
 */
const HIERARCHY_FREE: readonly string[] = ['direct', 'global'];

export function ConversationMeta({
  language,
  fiche,
  now,
  onAnnounce,
}: {
  readonly language: InterfaceLanguage;
  readonly fiche: AdminConversationFiche;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const moment = (iso: string | null) => adminMomentOf(iso, now, language);
  const state = conversationStateOf(fiche, language);
  const hierarchy = !HIERARCHY_FREE.includes(fiche.type);
  const e2ee = fiche.settings.encryptionMode === 'e2ee';
  const encryption = interpretEncryption(fiche.settings.encryptionMode ?? 'none', language);
  const description = excerptOf(fiche.description, 240);
  const slowMode = fiche.settings.slowModeSeconds;

  const stateExplain = fiche.closedAt !== null ? state.explain : fiche.isActive ? null : t('admin.conversation.meta.archivedExplain');

  const autoTranslate = e2ee
    ? t('admin.conversation.meta.autoTranslate.e2ee')
    : booleanPhrase(
        fiche.settings.autoTranslateEnabled,
        {
          yes: t('admin.conversation.meta.autoTranslate.yes'),
          no: t('admin.conversation.meta.autoTranslate.no'),
          unknown: t('admin.conversation.meta.autoTranslate.unknown'),
        },
        language,
      );

  return (
    <AdminMetaPanel title={t('admin.kit.meta.title')}>
      <AdminMetaRow
        anchor="type"
        label={t('admin.conversation.meta.type')}
        value={<AdminInterpretedBadge value={interpretConversationType(fiche.type, language)} />}
      />
      <AdminMetaRow
        anchor="state"
        label={t('admin.conversation.meta.state')}
        value={<AdminInterpretedBadge value={state} />}
        explain={stateExplain}
      />
      {fiche.closedAt === null ? null : (
        <AdminMetaRow
          anchor="closedOn"
          label={t('admin.conversation.meta.closedOn')}
          value={<AdminMomentText moment={moment(fiche.closedAt)} variant="both" />}
        />
      )}
      {fiche.closedBy === null ? null : (
        <AdminMetaRow
          anchor="closedBy"
          label={t('admin.conversation.meta.closedBy')}
          value={
            <AdminEntityChip
              language={language}
              size="sm"
              entity={{
                kind: 'user',
                id: fiche.closedBy.id,
                label: personLabel(fiche.closedBy, language),
                ...(personSecondary(fiche.closedBy.username) === null ? {} : { secondary: personSecondary(fiche.closedBy.username) }),
                ...(fiche.closedBy.avatar === null ? {} : { avatarUrl: fiche.closedBy.avatar }),
              }}
            />
          }
        />
      )}
      {fiche.community === null ? null : (
        <AdminMetaRow
          anchor="community"
          label={t('admin.conversation.meta.community')}
          value={<AdminEntityChip language={language} size="sm" entity={{ kind: 'community', id: fiche.community.id, label: fiche.community.name }} />}
        />
      )}
      {description === null ? null : <AdminMetaRow anchor="description" label={t('admin.conversation.meta.description')} value={description} />}
      {fiche.identifier === null ? null : (
        <AdminMetaRow
          anchor="identifier"
          label={t('admin.conversation.meta.identifier')}
          value={<span className="font-mono text-caption">{fiche.identifier}</span>}
          explain={t('admin.conversation.meta.identifierExplain')}
        />
      )}
      {hierarchy ? (
        <>
          <AdminMetaRow
            anchor="writeRole"
            label={t('admin.conversation.meta.writeRole')}
            value={interpretWriteRole(fiche.settings.defaultWriteRole ?? 'everyone', language).label}
            explain={t('admin.conversation.meta.writeRoleExplain')}
          />
          <AdminMetaRow
            anchor="announcement"
            label={t('admin.conversation.meta.announcement')}
            value={booleanPhrase(
              fiche.settings.isAnnouncementChannel,
              { yes: t('admin.conversation.meta.announcement.yes'), no: t('admin.conversation.meta.announcement.no') },
              language,
            )}
          />
          <AdminMetaRow
            anchor="slowMode"
            label={t('admin.conversation.meta.slowMode')}
            value={
              slowMode === 0
                ? t('admin.conversation.meta.slowMode.off')
                : translateAdmin(language, 'admin.conversation.meta.slowMode.on', { duration: formatDuration(slowMode, 's', language) })
            }
            explain={slowMode === 0 ? null : t('admin.conversation.meta.slowModeExplain')}
          />
        </>
      ) : null}
      <AdminMetaRow anchor="autoTranslate" label={t('admin.conversation.meta.autoTranslate')} value={autoTranslate} />
      <AdminMetaRow
        anchor="encryption"
        label={t('admin.conversation.meta.encryption')}
        value={<AdminInterpretedBadge value={encryption} />}
        explain={encryption.explain}
      />
      <AdminMetaRow anchor="created" label={t('admin.conversation.meta.created')} value={<AdminMomentText moment={moment(fiche.createdAt)} variant="both" />} />
      <AdminMetaRow anchor="updated" label={t('admin.conversation.meta.updated')} value={<AdminMomentText moment={moment(fiche.updatedAt)} variant="both" />} />
      <AdminMetaRow
        anchor="lastMessage"
        label={t('admin.conversation.meta.lastMessage')}
        value={
          fiche.lastMessageAt === null ? (
            t('admin.conversation.meta.noMessage')
          ) : (
            <AdminMomentText moment={moment(fiche.lastMessageAt)} variant="both" />
          )
        }
      />
      <AdminTechnicalId language={language} id={fiche.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}
