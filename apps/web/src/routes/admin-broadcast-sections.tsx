import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminTabs, useAdminTab } from '@/components/admin/tabs';
import { EDGE, INK, INK2 } from '@/components/admin/tone';
import { ProgressBar } from '@/components/progress-bar';
import { audienceSentence, breakdownBars } from '@/lib/admin/broadcast-audience';
import { deliveryProgress, inAppStateOf, type InAppState } from '@/lib/admin/broadcast-gestures';
import { interpretBroadcastStatus } from '@/lib/admin/interpret/enums';
import { personLabel, personSecondary } from '@/lib/admin/interpret/labels';
import { countryName, languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import type { AdminBroadcast, AdminBroadcastPerson, AdminBroadcastPreview, AdminBroadcastTranslation } from '@/lib/api/admin-broadcasts';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES BLOCS D'UNE FICHE DE DIFFUSION** (#8876, #6731) — le contenu dans sa langue
 * d'écriture, les traductions en onglets NOMMÉS, l'audience dite en une phrase (et,
 * après la préparation, répartie par langue et par pays), la livraison par e-mail
 * et dans l'application, les personnes, les métadonnées interprétées.
 *
 * Aucun identifiant n'est peint hors de la ligne « Identifiant technique » ; une
 * date est absolue ET relative ; une énumération est un mot ; un compte est une
 * puce nommée, qui s'ouvre si l'on peut ouvrir ses fiches.
 */
const INK_BODY = { color: INK, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;
const BAR_LIMIT = 8;

type Moment = ReturnType<typeof adminMomentOf>;

const momentOf = (iso: string | null, now: Date, language: InterfaceLanguage): Moment => adminMomentOf(iso, now, language);

function Text({ lang, children }: { readonly lang: string; readonly children: string }) {
  return (
    <p lang={lang} dir="auto" className="text-body" style={INK_BODY}>
      {children}
    </p>
  );
}

export function ContentSection({ language, broadcast }: { readonly language: InterfaceLanguage; readonly broadcast: AdminBroadcast }) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  return (
    <AdminFicheSection id="content" title={t('admin.broadcast.section.content')}>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.broadcast.content.writtenIn', { language: languageName(broadcast.sourceLanguage, language) })}
      </p>
      <div className="grid gap-1">
        <span className="text-caption" style={{ color: INK2 }}>
          {t('admin.broadcast.content.subject')}
        </span>
        <p data-admin-subject lang={broadcast.sourceLanguage} dir="auto" className="text-body font-semibold" style={{ color: INK, overflowWrap: 'anywhere' }}>
          {broadcast.subject}
        </p>
      </div>
      <div className="grid gap-1">
        <span className="text-caption" style={{ color: INK2 }}>
          {t('admin.broadcast.content.body')}
        </span>
        <p data-admin-body lang={broadcast.sourceLanguage} dir="auto" className="text-body" style={INK_BODY}>
          {broadcast.body}
        </p>
      </div>
    </AdminFicheSection>
  );
}

function TranslationPanel({ translation }: { readonly translation: AdminBroadcastTranslation }) {
  return (
    <div role="tabpanel" data-admin-translation={translation.language} className="grid gap-3 pt-3">
      {translation.subject === null ? null : (
        <p lang={translation.language} dir="auto" className="text-body font-semibold" style={{ color: INK, overflowWrap: 'anywhere' }}>
          {translation.subject}
        </p>
      )}
      {translation.body === null ? null : <Text lang={translation.language}>{translation.body}</Text>}
    </div>
  );
}

function TranslationTabs({ language, translations }: { readonly language: InterfaceLanguage; readonly translations: readonly AdminBroadcastTranslation[] }) {
  const ids = translations.map((translation) => translation.language);
  const [active, setActive] = useAdminTab(ids, ids[0] ?? '');
  const current = translations.find((translation) => translation.language === active) ?? translations[0];
  return (
    <>
      <AdminTabs
        label={translateAdmin(language, 'admin.broadcast.translations.tabs')}
        tabs={translations.map((translation) => ({ id: translation.language, label: sentenceCase(languageName(translation.language, language), language) }))}
        active={active}
        onChange={setActive}
      />
      {current === undefined ? null : <TranslationPanel translation={current} />}
    </>
  );
}

export function TranslationsSection({ language, broadcast }: { readonly language: InterfaceLanguage; readonly broadcast: AdminBroadcast }) {
  const none = broadcast.status === 'DRAFT' ? 'admin.broadcast.translations.none.draft' : 'admin.broadcast.translations.none.prepared';
  return (
    <AdminFicheSection id="translations" title={translateAdmin(language, 'admin.broadcast.section.translations')}>
      {broadcast.translations.length === 0 ? (
        <p data-admin-translations-none className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, none)}
        </p>
      ) : (
        <TranslationTabs language={language} translations={broadcast.translations} />
      )}
    </AdminFicheSection>
  );
}

const UNKNOWN_COUNTRY = 'unknown';

function PreviewCharts({ language, preview }: { readonly language: InterfaceLanguage; readonly preview: AdminBroadcastPreview }) {
  const others = translateAdmin(language, 'admin.kit.chart.others');
  const languages = breakdownBars({
    entries: preview.byLanguage.map((entry) => ({ key: entry.language, value: entry.count })),
    labelOf: (code) => sentenceCase(languageName(code, language), language),
    othersLabel: others,
    limit: BAR_LIMIT,
  });
  const countries = breakdownBars({
    entries: preview.byCountry.map((entry) => ({ key: entry.country ?? UNKNOWN_COUNTRY, value: entry.count })),
    labelOf: (code) => countryName(code === UNKNOWN_COUNTRY ? null : code, language),
    othersLabel: others,
    limit: BAR_LIMIT,
  });
  const format = (value: number) => formatCount(value, language);
  const summary = (bars: readonly { readonly label: string; readonly value: number }[]) => {
    const top = bars[0];
    return top === undefined ? '' : translateAdmin(language, 'admin.broadcast.audience.chart.summary', { name: top.label, value: format(top.value) });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2" data-admin-preview>
      <AdminBarChart
        language={language}
        id="broadcast-recipients-languages"
        title={translateAdmin(language, 'admin.broadcast.audience.chart.languages')}
        data={languages}
        format={format}
        summary={summary(languages)}
      />
      <AdminBarChart
        language={language}
        id="broadcast-recipients-countries"
        title={translateAdmin(language, 'admin.broadcast.audience.chart.countries')}
        data={countries}
        format={format}
        summary={summary(countries)}
      />
    </div>
  );
}

export function AudienceSection({
  language,
  broadcast,
  preview,
}: {
  readonly language: InterfaceLanguage;
  readonly broadcast: AdminBroadcast;
  readonly preview: AdminBroadcastPreview | undefined;
}) {
  const known = broadcast.status !== 'DRAFT';
  const recipients = preview?.recipientCount ?? broadcast.totalRecipients;
  return (
    <AdminFicheSection id="audience" title={translateAdmin(language, 'admin.broadcast.section.audience')}>
      <p data-admin-audience className="text-body font-semibold" style={{ color: INK }}>
        {audienceSentence(broadcast.targeting, language)}
      </p>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.broadcast.audience.explain')}
      </p>
      <dl className="grid gap-3">
        <AdminMetaRow
          anchor="recipients"
          label={translateAdmin(language, 'admin.broadcast.audience.recipients')}
          value={known ? formatCount(recipients, language) : translateAdmin(language, 'admin.broadcast.audience.recipients.draft')}
        />
      </dl>
      {preview === undefined ? null : <PreviewCharts language={language} preview={preview} />}
    </AdminFicheSection>
  );
}

export function EmailSection({ language, broadcast, now }: { readonly language: InterfaceLanguage; readonly broadcast: AdminBroadcast; readonly now: Date }) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const started = broadcast.status === 'SENDING' || broadcast.status === 'SENT' || broadcast.status === 'FAILED';
  const done = broadcast.sentCount + broadcast.failedCount;
  const completed = momentOf(broadcast.completedAt, now, language);
  return (
    <AdminFicheSection id="email" title={t('admin.broadcast.section.email')}>
      {started ? (
        <>
          <div className="grid gap-2">
            <ProgressBar
              progress={deliveryProgress(broadcast)}
              label={translateAdmin(language, 'admin.broadcast.email.progress', {
                done: formatCount(done, language),
                total: formatCount(broadcast.totalRecipients, language),
              })}
              tint="var(--color-ios-brand)"
            />
            <p aria-hidden="true" className="text-caption tabular-nums" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.broadcast.email.progress', { done: formatCount(done, language), total: formatCount(broadcast.totalRecipients, language) })}
            </p>
          </div>
          <dl className="grid gap-3">
            <AdminMetaRow anchor="sentAt" label={t('admin.broadcast.email.sentAt')} value={<AdminMomentText moment={momentOf(broadcast.sentAt, now, language)} variant="both" />} />
            <AdminMetaRow
              anchor="completedAt"
              label={t('admin.broadcast.email.completedAt')}
              value={
                completed === null && broadcast.status === 'SENDING' ? (
                  t('admin.broadcast.email.running')
                ) : (
                  <AdminMomentText moment={completed} variant="both" />
                )
              }
            />
          </dl>
          <p className="text-caption" style={{ color: INK2 }}>
            {t('admin.broadcast.email.skipped')}
          </p>
        </>
      ) : (
        <p data-admin-email-none className="text-body" style={{ color: INK2 }}>
          {t('admin.broadcast.email.notSent')}
        </p>
      )}
    </AdminFicheSection>
  );
}

const IN_APP_STATE: Readonly<Record<InAppState, { readonly key: AdminPlainCatalogKey; readonly tone: 'neutral' | 'info' | 'success' }>> = {
  never: { key: 'admin.broadcast.inApp.state.never', tone: 'neutral' },
  running: { key: 'admin.broadcast.inApp.state.running', tone: 'info' },
  done: { key: 'admin.broadcast.inApp.state.done', tone: 'success' },
};

export function InAppSection({ language, broadcast, now }: { readonly language: InterfaceLanguage; readonly broadcast: AdminBroadcast; readonly now: Date }) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const state = inAppStateOf(broadcast);
  const badge = IN_APP_STATE[state];
  return (
    <AdminFicheSection id="in-app" title={t('admin.broadcast.section.inApp')}>
      <dl className="grid gap-3">
        <AdminMetaRow anchor="inAppState" label={t('admin.broadcast.inApp.state')} value={<AdminBadge tone={badge.tone}>{t(badge.key)}</AdminBadge>} />
        {state === 'never' ? null : (
          <>
            <AdminMetaRow anchor="inAppSent" label={t('admin.broadcast.inApp.sent')} value={formatCount(broadcast.inAppSentCount, language)} />
            <AdminMetaRow anchor="inAppFailed" label={t('admin.broadcast.inApp.failed')} value={formatCount(broadcast.inAppFailedCount, language)} />
            <AdminMetaRow anchor="inAppSentAt" label={t('admin.broadcast.inApp.sentAt')} value={<AdminMomentText moment={momentOf(broadcast.inAppSentAt, now, language)} variant="both" />} />
            <AdminMetaRow
              anchor="inAppCompletedAt"
              label={t('admin.broadcast.inApp.completedAt')}
              value={
                state === 'running' ? t('admin.broadcast.email.running') : <AdminMomentText moment={momentOf(broadcast.inAppCompletedAt, now, language)} variant="both" />
              }
            />
          </>
        )}
      </dl>
    </AdminFicheSection>
  );
}

function PersonChip({ language, person }: { readonly language: InterfaceLanguage; readonly person: AdminBroadcastPerson | null }) {
  if (person === null) return <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.broadcast.people.unknown')}</span>;
  return (
    <AdminEntityChip
      language={language}
      entity={{ kind: 'user', id: person.id, label: personLabel(person, language), secondary: personSecondary(person.username), avatarUrl: person.avatar }}
    />
  );
}

export function PeopleSection({ language, broadcast }: { readonly language: InterfaceLanguage; readonly broadcast: AdminBroadcast }) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  return (
    <AdminFicheSection id="people" title={t('admin.broadcast.section.people')}>
      <dl className="grid gap-3">
        <AdminMetaRow anchor="createdBy" label={t('admin.broadcast.people.createdBy')} value={<PersonChip language={language} person={broadcast.createdBy} />} />
        {broadcast.sentAt === null ? null : (
          <AdminMetaRow anchor="sentBy" label={t('admin.broadcast.people.sentBy')} value={<PersonChip language={language} person={broadcast.sentBy} />} />
        )}
        {broadcast.inAppSentAt === null ? null : (
          <AdminMetaRow anchor="inAppBy" label={t('admin.broadcast.people.inAppBy')} value={<PersonChip language={language} person={broadcast.inAppSentBy} />} />
        )}
      </dl>
    </AdminFicheSection>
  );
}

export function BroadcastMeta({
  language,
  broadcast,
  now,
  onAnnounce,
}: {
  readonly language: InterfaceLanguage;
  readonly broadcast: AdminBroadcast;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const status = interpretBroadcastStatus(broadcast.status, language);
  const targets = broadcast.targetLanguages.map((code) => sentenceCase(languageName(code, language), language));
  const list = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' });
  return (
    <AdminMetaPanel title={t('admin.kit.meta.title')}>
      <AdminMetaRow anchor="status" label={t('admin.broadcast.meta.status')} value={<AdminInterpretedBadge value={status} />} explain={status.explain} />
      <AdminMetaRow anchor="sourceLanguage" label={t('admin.broadcast.meta.sourceLanguage')} value={sentenceCase(languageName(broadcast.sourceLanguage, language), language)} />
      <AdminMetaRow
        anchor="targetLanguages"
        label={t('admin.broadcast.meta.targetLanguages')}
        value={targets.length === 0 ? t('admin.broadcast.meta.targetLanguages.none') : list.format(targets)}
      />
      <AdminMetaRow anchor="created" label={t('admin.broadcast.meta.created')} value={<AdminMomentText moment={momentOf(broadcast.createdAt, now, language)} variant="both" />} />
      <AdminMetaRow anchor="updated" label={t('admin.broadcast.meta.updated')} value={<AdminMomentText moment={momentOf(broadcast.updatedAt, now, language)} variant="both" />} />
      <div style={{ borderTop: `1px solid ${EDGE}` }} />
      <AdminTechnicalId language={language} id={broadcast.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}
