import type { LandingCopy } from './landing-copy';
import { LANDING_LANGUAGES, LANGUAGE_AUTONYMS, landingDirection, type LandingLanguage } from './landing-languages';
import { GlobeIcon, LanguageSelect, SiteFooter, SiteHeader } from './site-chrome';

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
 * les pages statiques `/help`, `/faq`, `/privacy`, `/terms`, `/download`. Son
 * en-tête et son pied sont ceux de tout meeshy.me (`site-chrome.tsx`, #10071).
 */
export type LandingPageProps = {
  readonly language: LandingLanguage;
  readonly copy: LandingCopy;
};

export function LandingPage({ language, copy }: LandingPageProps) {
  return (
    <div className="ld" data-landing={language}>
      <div className="ld-glow" aria-hidden="true" />
      <SiteHeader language={language} copy={copy} onLanding languageControl={<LanguageSelect language={language} copy={copy} />} />

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
            <a href="/chats" className="ld-btn ld-btn--primary ld-btn--large ld-return" data-world-return hidden>
              {copy.returnToWorld}
            </a>
            <form id="rejoindre" className="ld-form" aria-label={copy.formLabel} data-world-form data-world-entry>
              <div className="ld-step" data-world-step="name">
                <label className="ld-field">
                  {copy.nameLabel}
                  <input type="text" name="name" required maxLength={40} autoComplete="nickname" placeholder={copy.namePlaceholder} />
                </label>
                <button type="submit" className="ld-btn ld-btn--primary ld-btn--large">
                  {copy.join}
                </button>
              </div>
              <fieldset className="ld-step ld-step--language" data-world-step="language" aria-describedby="ld-language-hint" hidden>
                <legend>{copy.languageTitle}</legend>
                <p id="ld-language-hint" className="ld-note">
                  {copy.languageHint}
                </p>
                <div className="ld-langs">
                  {LANDING_LANGUAGES.map((code) => (
                    <label key={code} className="ld-lang" lang={code} dir={landingDirection(code)}>
                      <input type="radio" name="language" value={code} defaultChecked={code === language} />
                      {LANGUAGE_AUTONYMS[code]}
                    </label>
                  ))}
                </div>
                <button type="button" className="ld-btn ld-btn--ghost ld-btn--large" data-world-back>
                  {copy.back}
                </button>
                <button type="submit" className="ld-btn ld-btn--primary ld-btn--large">
                  {copy.enter}
                </button>
              </fieldset>
              <p className="ld-note ld-error" role="alert" data-world-error hidden>
                {copy.entryFailed}
              </p>
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

      <SiteFooter language={language} copy={copy} onLanding />
    </div>
  );
}
