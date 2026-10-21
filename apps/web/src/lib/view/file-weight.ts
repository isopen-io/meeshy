/**
 * LE POIDS D'UN FICHIER, DANS LA LANGUE DE L'INTERFACE (#10748) — l'unité suit
 * `Intl` (« 32 kB » en anglais…) ; le français garde « Ko » / « Mo ». Jamais un « Ko » écrit en
 * français pour toutes les langues. Sous 1 Mo l'unité est le kilo-octet (au moins 1),
 * au-delà le méga-octet à une décimale.
 */
const KILOBYTE = 1024;

export function fileWeightLabel(bytes: number, language: string): string {
  const kilobytes = bytes / KILOBYTE;
  const useMegabytes = kilobytes >= KILOBYTE;
  const value = useMegabytes ? Math.round((kilobytes / KILOBYTE) * 10) / 10 : Math.max(1, Math.round(kilobytes));
  if (language === 'fr') return `${new Intl.NumberFormat('fr', { maximumFractionDigits: 1 }).format(value)} ${useMegabytes ? 'Mo' : 'Ko'}`;
  try {
    return new Intl.NumberFormat(language, { style: 'unit', unit: useMegabytes ? 'megabyte' : 'kilobyte', unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${value} ${useMegabytes ? 'MB' : 'kB'}`;
  }
}
