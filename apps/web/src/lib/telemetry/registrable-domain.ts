/**
 * **LE DOMAINE ENREGISTRABLE (eTLD+1)** (#10505, décision § 2) — ce qu'un
 * lien sortant dit de sa destination, et seulement cela : jamais l'URL, son
 * chemin, sa requête, ses identifiants ni son sous-domaine. Une petite table
 * des suffixes publics à deux niveaux les plus courants tient lieu de liste
 * PSL complète, que le bundle ne paierait pas pour un repli marginal.
 */
const TWO_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.mx', 'org.mx', 'gob.mx',
  'com.ar', 'gob.ar',
  'co.in', 'net.in', 'org.in', 'gov.in',
  'co.za', 'org.za', 'gov.za',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.hk', 'com.sg', 'com.tw', 'com.my', 'com.ph', 'com.vn', 'co.id', 'co.th',
  'com.tr', 'gov.tr', 'com.eg', 'com.sa', 'co.il',
  'com.ng', 'co.ke', 'co.tz', 'co.ug', 'com.gh', 'co.ma', 'co.ci', 'com.tn', 'co.cm', 'com.sn',
  'gouv.fr', 'asso.fr', 'com.fr', 'gouv.ci', 'gouv.sn',
  'com.es', 'org.es', 'com.pt', 'com.pl', 'com.ua', 'co.at', 'or.at',
  'github.io', 'blogspot.com', 'herokuapp.com', 'vercel.app', 'netlify.app', 'pages.dev',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function registrableDomain(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === '' || host.startsWith('[') || IPV4.test(host)) return null;
  const labels = host.split('.').filter((label) => label !== '');
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join('.');
  const take = TWO_LEVEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.length < take ? null : labels.slice(-take).join('.');
}
