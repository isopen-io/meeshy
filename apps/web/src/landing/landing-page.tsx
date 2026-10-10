import { BRAND_LOGO_PATH } from '@/lib/brand';

import type { LandingCopy } from './landing-copy';
import { LANDING_LANGUAGES, LANGUAGE_AUTONYMS, landingPath, type LandingLanguage } from './landing-languages';

/**
 * LA LANDING DE meeshy.me (#10002, planche « Main »).
 *
 * Un composant, deux rendus : le PRÉRENDU (`scripts/prerender-landing.tsx`,
 * `react-dom/server`, une page statique par langue, zéro script applicatif) et
 * l'écran `/` de l'application (`routes/home.tsx`), quand c'est la coquille qui
 * reçoit `/` (service worker, développement). Il ne lit ni session, ni réseau,
 * ni magasin : tout ce qui change d'un lecteur à l'autre est posé par
 * `landingBoot` sur des attributs `data-*` — d'où un HTML identique pour tous,
 * que les robots lisent tel quel.
 *
 * Les adresses sont celles de l'application : `/login`, `/signup`, `/chats`, et
 * les pages statiques `/help`, `/faq`, `/privacy`, `/terms`, `/download`.
 */
export type LandingPageProps = {
  readonly language: LandingLanguage;
  readonly copy: LandingCopy;
};

const GlobeIcon = ({ size }: { readonly size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

export function LandingPage({ language, copy }: LandingPageProps) {
  return (
    <div className="ld" data-landing={language}>
      <div className="ld-glow" aria-hidden="true" />
      <header className="ld-header glass">
        <div className="ld-wrap ld-bar">
          <a href={landingPath(language)} className="ld-brand">
            <img src={BRAND_LOGO_PATH} alt="" width={36} height={36} />
            <span className="ld-wordmark">Meeshy</span>
          </a>
          <nav className="ld-nav" aria-label={copy.navLabel}>
            <a href="#comment">{copy.navHow}</a>
            <a href="#world">{copy.navWorld}</a>
            <a href="/faq">{copy.navFaq}</a>
          </nav>
          <span className="ld-spacer" />
          <label className="ld-language">
            <GlobeIcon size={16} />
            <span className="ld-sr">{copy.languageLabel}</span>
            <select data-landing-language defaultValue={language}>
              {LANDING_LANGUAGES.map((code) => (
                <option key={code} value={code} lang={code}>
                  {LANGUAGE_AUTONYMS[code]}
                </option>
              ))}
            </select>
          </label>
          <a href="/login" className="ld-btn ld-btn--ghost" data-session-visitor>
            {copy.signIn}
          </a>
          <a href="#rejoindre" className="ld-btn ld-btn--primary" data-session-visitor data-world-entry data-world-cta>
            {copy.enterWithoutAccount}
          </a>
          <a href="/chats" className="ld-btn ld-btn--primary" data-session-member data-my-conversations>
            {copy.myConversations}
          </a>
        </div>
      </header>

      <main>
        <section className="ld-wrap ld-hero">
          <div className="ld-hero-copy">
            <p className="ld-presence" data-world-presence hidden>
              <span className="ld-presence-dot" aria-hidden="true" />
              <span data-world-count />
            </p>
            <h1>
              {copy.headline}
              <span className="ld-accent">{copy.headlineAccent}</span>
            </h1>
            <p className="ld-lede">{copy.lede}</p>
            <form id="rejoindre" className="ld-form" aria-label={copy.formLabel} data-world-form data-world-entry>
              <label className="ld-field">
                {copy.nameLabel}
                <input type="text" name="name" required maxLength={40} autoComplete="nickname" placeholder={copy.namePlaceholder} />
              </label>
              <button type="submit" className="ld-btn ld-btn--primary ld-btn--large">
                {copy.join}
              </button>
            </form>
            <p className="ld-note" data-world-entry>
              {copy.joinNote}
            </p>
            <p className="ld-note" data-world-unavailable hidden>
              {copy.unavailable}
            </p>
          </div>

          <aside className="ld-preview" aria-label={copy.previewLabel}>
            <div className="ld-preview-head">
              <span className="ld-preview-title">
                World Wide
                <span className="ld-preview-sub">{copy.previewSubtitle}</span>
              </span>
              <span className="ld-globe">
                <GlobeIcon size={22} />
              </span>
            </div>
            <div className="ld-rows">
              <div className="ld-row ld-row--kenji">
                <span className="ld-avatar" aria-hidden="true">KT</span>
                <div>
                  <div className="ld-author">Kenji</div>
                  <div className="ld-text">{copy.previewKenji}</div>
                  <div className="ld-translated">{copy.previewKenjiFrom}</div>
                </div>
              </div>
              <div className="ld-row ld-row--luiza">
                <span className="ld-avatar" aria-hidden="true">LS</span>
                <div>
                  <div className="ld-author">Luiza</div>
                  <div className="ld-voice">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="ld-wave" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>0:12</span>
                  </div>
                  <div className="ld-translated">{copy.previewLuizaNote}</div>
                </div>
              </div>
              <div className="ld-row ld-row--you">
                <span className="ld-avatar" aria-hidden="true">VO</span>
                <div>
                  <div className="ld-author">{copy.previewYourself}</div>
                  <div className="ld-text">{copy.previewYou}</div>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section id="comment" className="ld-wrap ld-section">
          <h2>{copy.howTitle}</h2>
          <ol className="ld-grid">
            {copy.steps.map((step, index) => (
              <li key={step.title} className="ld-card">
                <span className="ld-step" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="world" className="ld-wrap ld-section">
          <div className="ld-world">
            <div className="ld-world-copy">
              <h2>{copy.worldTitle}</h2>
              <p>{copy.worldText}</p>
            </div>
            <div className="ld-world-actions">
              <a href="#rejoindre" className="ld-btn ld-btn--primary ld-btn--large" data-world-entry data-world-cta>
                {copy.enterWithoutAccount}
              </a>
              <a href="/signup" className="ld-btn ld-btn--ghost ld-btn--large" data-session-visitor>
                {copy.createAccount}
              </a>
              <a href="/chats" className="ld-btn ld-btn--ghost ld-btn--large" data-session-member>
                {copy.myConversations}
              </a>
            </div>
          </div>
        </section>

        <section className="ld-wrap ld-section">
          <div className="ld-features">
            {copy.features.map((feature) => (
              <div key={feature.title} className="ld-feature">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="ld-footer">
        <div className="ld-wrap ld-footer-row">
          <span className="ld-footer-name">Meeshy</span>
          <nav aria-label={copy.footerLabel}>
            <a href="/help">{copy.help}</a>
            <a href="/faq">{copy.faq}</a>
            <a href="/privacy">{copy.privacy}</a>
            <a href="/terms">{copy.terms}</a>
            <a href="/download">{copy.download}</a>
          </nav>
          <span className="ld-spacer" />
          <nav aria-label={copy.languageLabel}>
            {LANDING_LANGUAGES.map((code) => (
              <a key={code} href={landingPath(code)} hrefLang={code} lang={code} {...(code === language ? { 'aria-current': 'page' as const } : {})}>
                {LANGUAGE_AUTONYMS[code]}
              </a>
            ))}
          </nav>
          <span>© Meeshy</span>
        </div>
      </footer>
    </div>
  );
}
