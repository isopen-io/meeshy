import type { LandingCopy } from './landing-copy';
import type { LandingLanguage } from './landing-languages';
import { GlobeIcon, LanguageSelect, SiteFooter, SiteHeader } from './site-chrome';

/** L'image versionnée du QR (`public/world-qr.svg`, `scripts/generate-world-qr.mjs`). */
export const WORLD_QR_PATH = '/world-qr.svg';

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
 *
 * On n'entre plus dans World Wide sans compte d'un clic depuis la landing
 * (#10784, directive porteur du 2026-10-16) : ni formulaire, ni « Entrer sans
 * compte ». Le héros et la section World Wide portent un QR code vers
 * `https://meeshy.me/world`, qu'on FLASHE avec un téléphone, et son lien de
 * partage en clair pour qui lit la page sur ce téléphone (#10811) — que le
 * script masque quand `GET /world` dit l'entrée fermée (`data-world-entry`).
 */
export type LandingPageProps = {
  readonly language: LandingLanguage;
  readonly copy: LandingCopy;
};

export function LandingPage({ language, copy }: LandingPageProps) {
  return (
    <div className="ld" data-landing={language}>
      <div className="ld-glow" aria-hidden="true" />
      <SiteHeader language={language} copy={copy} onLanding languageControl={<LanguageSelect language={language} label={copy.languageLabel} />} />

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
            <WorldQr copy={copy} placement="hero" />
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
                <span className="ld-step-num" aria-hidden="true">
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
              <WorldQr copy={copy} placement="world" />
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

/**
 * LE QR VERS /world (#10784) — une IMAGE, jamais un lien : le parcours invité
 * s'ouvre sur le téléphone qui flashe, pas d'un clic sur la page.
 *
 * Dessous, le lien de partage EN CLAIR (#10811) : qui lit meeshy.me sur son
 * téléphone ne peut pas flasher son propre écran. Une adresse, pas un bouton ;
 * sur écran tactile, le QR et sa consigne s'effacent et elle reste seule.
 */
function WorldQr({ copy, placement }: { readonly copy: LandingCopy; readonly placement: 'hero' | 'world' }) {
  return (
    <figure className="ld-qr" data-world-qr data-world-entry>
      <img src={WORLD_QR_PATH} alt={copy.worldQrAlt} width={placement === 'hero' ? 168 : 144} height={placement === 'hero' ? 168 : 144} decoding="async" />
      <figcaption>
        <span className="ld-qr-scan">{copy.worldQrCaption}</span>
        <span className="ld-qr-share">
          {copy.worldLinkLead}{' '}
          <a href="/world" className="ld-qr-link" data-world-link>
            meeshy.me/world
          </a>
        </span>
      </figcaption>
    </figure>
  );
}
