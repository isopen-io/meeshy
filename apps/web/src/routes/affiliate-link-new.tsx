import { useState, type FormEvent } from 'react';

import { AFFILIATE_NAME_MAX, emptyAffiliateTokenDraft, type AffiliateDraftField, type AffiliateTokenDraft } from '@/lib/api/affiliate-tokens';
import { apiDeps } from '@/lib/api/deps';
import { performCreateAffiliateToken } from '@/lib/api/link-family-actions';
import { appQueryClient } from '@/lib/api/query-client';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { AFFILIATE_TINT } from '@/routes/link-families-parts';
import { Field, FormError, SubmitButton } from '@/routes/link-family-form';
import { LinksGlyph, LinksHeader, LinksOfflineNotice } from '@/routes/links-parts';
import { href, navigate } from '@/routes/route-table';
import { FormSection, RuleToggle } from '@/routes/share-link-form';

/**
 * **NOUVEAU LIEN DE PARRAINAGE** (#6409) — miroir `AffiliateCreateView.swift` :
 * un nom, et un plafond d'inscriptions facultatif. La création attend la
 * passerelle, puis ramène à la liste où le lien neuf se lit EN TÊTE.
 *
 * iOS lit le plafond dans un champ libre (« Illimité » vide) ; ici une bascule
 * dit l'intention et le champ n'apparaît qu'avec elle, comme le plafond des
 * liens de partage — même geste, même place.
 */

type Feedback = 'linkFamilies.create.error.offline' | 'linkFamilies.create.error.default';

export default function AffiliateLinkNewScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const [draft, setDraft] = useState<AffiliateTokenDraft>(emptyAffiliateTokenDraft);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [invalid, setInvalid] = useState<AffiliateDraftField | null>(null);

  const edit = <K extends keyof AffiliateTokenDraft>(key: K, value: AffiliateTokenDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
    if (invalid === key || (invalid === 'maxUses' && key === 'limitUses')) setInvalid(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    const outcome = await performCreateAffiliateToken({ draft, deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine }, now: new Date() });
    if (outcome.status === 'created') {
      navigate(href('affiliateLinks'), true);
      return;
    }
    setSubmitting(false);
    if (outcome.status === 'invalid') setInvalid(outcome.field);
    else setFeedback(outcome.status === 'offline' ? 'linkFamilies.create.error.offline' : 'linkFamilies.create.error.default');
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader language={language} back="affiliateLinks" backLabel={translateLinkFamilies(language, 'linkFamilies.affiliate.title')} title={translateLinkFamilies(language, 'linkFamilies.affiliate.create.title')} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <form noValidate onSubmit={(event) => void submit(event)} className="mx-auto grid max-w-xl gap-6 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          <FormSection id="affiliate-section-identity" title={translateLinkFamilies(language, 'linkFamilies.affiliate.create.name')} subtitle={null} icon={<LinksGlyph name="tag" size={12} />}>
            <Field
              id="affiliate-name"
              required
              maxLength={AFFILIATE_NAME_MAX}
              label={translateLinkFamilies(language, 'linkFamilies.affiliate.create.name')}
              placeholder={translateLinkFamilies(language, 'linkFamilies.affiliate.create.name.placeholder')}
              value={draft.name}
              error={invalid === 'name' ? translateLinkFamilies(language, 'linkFamilies.affiliate.create.name.invalid') : null}
              onChange={(value) => edit('name', value)}
            />
          </FormSection>
          <FormSection id="affiliate-section-limit" title={translateLinkFamilies(language, 'linkFamilies.affiliate.create.limit')} subtitle={null} icon={<LinksGlyph name="gauge" size={12} />}>
            <RuleToggle
              id="affiliate-limit"
              label={translateLinkFamilies(language, 'linkFamilies.affiliate.create.limit')}
              caption={translateLinkFamilies(language, 'linkFamilies.affiliate.create.limit.caption')}
              icon={<LinksGlyph name="userPlus" size={15} />}
              tint={AFFILIATE_TINT}
              checked={draft.limitUses}
              disabled={false}
              onToggle={(next) => edit('limitUses', next)}
            />
            {draft.limitUses ? (
              <Field
                id="affiliate-max-uses"
                inputMode="numeric"
                maxLength={6}
                label={translateLinkFamilies(language, 'linkFamilies.affiliate.create.maxUses')}
                placeholder="100"
                value={draft.maxUses}
                error={invalid === 'maxUses' ? translateLinkFamilies(language, 'linkFamilies.affiliate.create.maxUses.invalid') : null}
                onChange={(value) => edit('maxUses', value)}
              />
            ) : null}
          </FormSection>
          <FormError text={feedback === null ? null : translateLinkFamilies(language, feedback)} />
          <SubmitButton
            label={translateLinkFamilies(language, submitting ? 'linkFamilies.create.inprogress' : 'linkFamilies.affiliate.create.button')}
            disabled={submitting || !online || draft.name.trim() === ''}
          />
        </form>
      </main>
    </div>
  );
}
