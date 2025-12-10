'use client';

import Script from 'next/script';

/**
 * Composant Google Analytics pour Meeshy
 * Tracking ID: G-VGMPQM7M5D
 */
export function GoogleAnalytics() {
  const GA_MEASUREMENT_ID = 'G-VGMPQM7M5D';

  return (
    <>
      {/* Google tag (gtag.js) - Script de chargement */}
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />

      {/* Google Analytics - Configuration */}
      <Script
        id="google-analytics-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `,
        }}
      />
    </>
  );
}
