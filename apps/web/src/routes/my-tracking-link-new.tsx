import { useMemo, useState, type FormEvent } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { performCreateTrackingLink, type CreateFamilyLinkOutcome } from '@/lib/api/link-family-actions';
import { emptyTrackingLinkDraft, normalizedUrl, TRACKING_NAME_MAX, TRACKING_UTM_MAX, trackingLinkUrl, type MyTrackingLink, type TrackingLinkDraft, type TrackingLinkDraftField } from '@/lib/api/my-tracking-links';
import { appQueryClient } from '@/lib/api/query-client';
import { apiConfig } from '@/lib/api/config';
import { translateLinkFamilies, type PlainLinkFamiliesKey } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { webOriginOf } from '@/lib/links/web-origin';
import { useOnline } from '@/lib/net/online';
import { Field, FormError, SubmitButton } from '@/routes/link-family-form';
import { LinksGlyph, LinksHeader, LinksOfflineNotice } from '@/routes/links-parts';
import { href, navigate } from '@/routes/route-table';
import { FormSection } from '@/routes/share-link-form';

/**
 * **NOUVEAU LIEN DE SUIVI** (#6408) — miroir `CreateTrackingLinkView.swift` :
 * l'URL de destination (seul champ requis), un nom interne, les trois
 * paramètres UTM, et un jeton personnalisé facultatif dont l'adresse finale
 * se lit pendant la saisie.
 *
 * Une adresse tapée sans protocole se lit en https (`normalizedUrl`) : iOS
 * accepte toute chaîne que `URL(string:)` lit, y compris « abc », que la
 * passerelle refuse ensuite ; le web ne laisse partir qu'une adresse web.
 *
 * **La création attend la passerelle** : le bouton dit « Création en cours… »,
 * puis l'écran est REMPLACÉ par le détail du lien créé. Un jeton déjà pris
 * (409) se dit SOUS son champ.
 */

type Feedback = 'linkFamilies.create.error.offline' | 'linkFamilies.create.error.default';

const FIELD_ERROR: Readonly<Record<TrackingLinkDraftField | 'taken', PlainLinkFamiliesKey>> = {
  originalUrl: 'linkFamilies.tracking.create.url.invalid',
  name: 'linkFamilies.tracking.create.name.invalid',
  customToken: 'linkFamilies.tracking.create.token.invalid',
  taken: 'linkFamilies.tracking.create.token.taken',
};

export default function MyTrackingLinkNewScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const origin = useMemo(() => webOriginOf(apiConfig.base, window.location.origin), []);
  const [draft, setDraft] = useState<TrackingLinkDraft>(emptyTrackingLinkDraft);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [invalid, setInvalid] = useState<TrackingLinkDraftField | 'taken' | null>(null);

  const edit = (key: keyof TrackingLinkDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
    if (invalid !== null && (invalid === key || (invalid === 'taken' && key === 'customToken'))) setInvalid(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    const outcome: CreateFamilyLinkOutcome<MyTrackingLink, TrackingLinkDraftField> = await performCreateTrackingLink({
      draft,
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
      now: new Date(),
    });
    if (outcome.status === 'created') {
      navigate(href('myTrackingLink', { token: outcome.link.token }), true);
      return;
    }
    setSubmitting(false);
    if (outcome.status === 'invalid') setInvalid(outcome.field);
    else if (outcome.status === 'conflict') setInvalid('taken');
    else setFeedback(outcome.status === 'offline' ? 'linkFamilies.create.error.offline' : 'linkFamilies.create.error.default');
  };

  const errorOf = (field: TrackingLinkDraftField): string | null =>
    invalid === field || (field === 'customToken' && invalid === 'taken') ? translateLinkFamilies(language, FIELD_ERROR[invalid ?? field]) : null;
  const token = draft.customToken.trim();
  const preview = token === '' ? null : translateLinkFamilies(language, 'linkFamilies.tracking.create.preview', { url: trackingLinkUrl(origin, token) });
  const ready = normalizedUrl(draft.originalUrl) !== null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader language={language} back="myTrackingLinks" backLabel={translateLinkFamilies(language, 'linkFamilies.tracking.back')} title={translateLinkFamilies(language, 'linkFamilies.tracking.create.title')} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <form noValidate onSubmit={(event) => void submit(event)} className="mx-auto grid max-w-xl gap-6 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          <FormSection id="tracking-section-destination" title={translateLinkFamilies(language, 'linkFamilies.tracking.create.section.destination')} subtitle={null} icon={<LinksGlyph name="arrowSquareOut" size={12} />}>
            <Field
              id="tracking-url"
              type="url"
              inputMode="url"
              dir="ltr"
              required
              label={translateLinkFamilies(language, 'linkFamilies.tracking.create.url')}
              placeholder={translateLinkFamilies(language, 'linkFamilies.tracking.create.url.placeholder')}
              value={draft.originalUrl}
              error={errorOf('originalUrl')}
              onChange={(value) => edit('originalUrl', value)}
            />
            <Field
              id="tracking-name"
              maxLength={TRACKING_NAME_MAX}
              label={translateLinkFamilies(language, 'linkFamilies.tracking.create.name')}
              placeholder={translateLinkFamilies(language, 'linkFamilies.tracking.create.name.placeholder')}
              value={draft.name}
              error={errorOf('name')}
              onChange={(value) => edit('name', value)}
            />
          </FormSection>
          <FormSection
            id="tracking-section-utm"
            title={translateLinkFamilies(language, 'linkFamilies.tracking.create.section.utm')}
            subtitle={translateLinkFamilies(language, 'linkFamilies.tracking.create.section.utm.subtitle')}
            icon={<LinksGlyph name="tag" size={12} />}
          >
            <Field id="tracking-campaign" maxLength={TRACKING_UTM_MAX} label={translateLinkFamilies(language, 'linkFamilies.tracking.campaign')} placeholder={translateLinkFamilies(language, 'linkFamilies.tracking.create.campaign.placeholder')} value={draft.campaign} onChange={(value) => edit('campaign', value)} />
            <Field id="tracking-source" maxLength={TRACKING_UTM_MAX} label={translateLinkFamilies(language, 'linkFamilies.tracking.source')} placeholder={translateLinkFamilies(language, 'linkFamilies.tracking.create.source.placeholder')} value={draft.source} onChange={(value) => edit('source', value)} />
            <Field id="tracking-medium" maxLength={TRACKING_UTM_MAX} label={translateLinkFamilies(language, 'linkFamilies.tracking.medium')} placeholder={translateLinkFamilies(language, 'linkFamilies.tracking.create.medium.placeholder')} value={draft.medium} onChange={(value) => edit('medium', value)} />
          </FormSection>
          <FormSection id="tracking-section-token" title={translateLinkFamilies(language, 'linkFamilies.tracking.create.section.token')} subtitle={null} icon={<LinksGlyph name="link" size={12} />}>
            <Field
              id="tracking-token"
              dir="ltr"
              maxLength={50}
              label={translateLinkFamilies(language, 'linkFamilies.tracking.create.token')}
              placeholder={translateLinkFamilies(language, 'linkFamilies.tracking.create.token.placeholder')}
              value={draft.customToken}
              help={preview ?? translateLinkFamilies(language, 'linkFamilies.tracking.create.token.help')}
              error={errorOf('customToken')}
              onChange={(value) => edit('customToken', value)}
            />
          </FormSection>
          <FormError text={feedback === null ? null : translateLinkFamilies(language, feedback)} />
          <SubmitButton
            label={translateLinkFamilies(language, submitting ? 'linkFamilies.create.inprogress' : 'linkFamilies.tracking.create.button')}
            disabled={submitting || !online || !ready}
          />
        </form>
      </main>
    </div>
  );
}
