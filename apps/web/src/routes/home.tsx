import { useEffect, useRef } from 'react';

import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';

import '@/styles/landing.css';

import { landingBoot } from '@/landing/landing-boot';
import { LANDING_COPY } from '@/landing/landing-copy';
import { ROOT_LANDING_LANGUAGE, landingPaths } from '@/landing/landing-languages';
import { LandingPage } from '@/landing/landing-page';
import { WORLD_GUEST_ENTRY_TEMPLATE } from '@/landing/world-entry';
import { apiConfig } from '@/lib/api/config';
import { SESSION_STORAGE_KEY } from '@/lib/api/session';
import { INTERFACE_LANGUAGE_KEY } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * `/` QUAND C'EST LA COQUILLE QUI LA REÇOIT (#10002).
 *
 * meeshy.me sert la landing PRÉRENDUE (`landing.html`, nginx `location = /`) :
 * cet écran ne se monte que lorsque l'application elle-même tient l'adresse —
 * le service worker qui sert sa coquille, le serveur de développement, une
 * navigation interne. Il rend le MÊME composant que le prérendu, dans la langue
 * d'interface courante, et lui donne le MÊME comportement (`landingBoot`,
 * appelé directement ici, inliné par son texte là-bas) : deux chemins, une
 * page.
 */
export default function HomeScreen() {
  const language = currentInterfaceLanguage();
  const copy = LANDING_COPY[language];
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (scope === null) return;
    document.title = copy.metaTitle;
    landingBoot(
      window,
      {
        language,
        rootLanguage: ROOT_LANDING_LANGUAGE,
        paths: landingPaths(),
        apiBase: apiConfig.base,
        worldPath: worldEndpoints.root,
        sessionKey: SESSION_STORAGE_KEY,
        languageKey: INTERFACE_LANGUAGE_KEY,
        entryTemplate: WORLD_GUEST_ENTRY_TEMPLATE,
        presence: copy.presence,
      },
      { scope },
    );
    return () => document.documentElement.removeAttribute('data-session');
  }, [language, copy]);

  return (
    <div ref={root}>
      <LandingPage language={language} copy={copy} />
    </div>
  );
}
