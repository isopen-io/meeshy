/**
 * Le XMP d'une carte de gain HDR, réduit à ce qui la décrit (#11840).
 *
 * Une carte de gain se décrit dans le XMP : `hdrgm:` (Adobe, Ultra HDR
 * d'Android), `HDRGainMap:` et `apdi:` (Apple). Le reste d'un paquet XMP peut
 * porter n'importe quoi — auteur, logiciel, et le GPS lui-même
 * (`exif:GPSLatitude`). Plutôt que de retirer ce qu'on sait dangereux, on
 * RECONSTRUIT un paquet neuf à partir d'une liste BLANCHE : seules les
 * propriétés des trois espaces de noms ci-dessus, et seulement si leur valeur
 * est un nombre, un booléen ou un identifiant (`urn:com:apple:…`) — jamais un
 * texte libre. Les préfixes se résolvent par l'URI déclarée, pas par leur nom.
 */

const NAMESPACES = {
  hdrgm: 'http://ns.adobe.com/hdr-gain-map/1.0/',
  HDRGainMap: 'http://ns.apple.com/HDRGainMap/1.0/',
  apdi: 'http://ns.apple.com/pixeldatainfo/1.0/',
} as const;

type GainMapPrefix = keyof typeof NAMESPACES;

const XMP_SIGNATURE = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1');
const SAFE_VALUE = /^[A-Za-z0-9:.+-]{1,80}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const XMP_PROPERTY_HEADER = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">';
const XMP_PROPERTY_FOOTER = '</rdf:RDF></x:xmpmeta>';

/** Une propriété gardée : un scalaire, ou une séquence (une valeur par canal). */
export type GainMapProperty = { readonly prefix: GainMapPrefix; readonly name: string; readonly values: readonly string[] };

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function declaredPrefixes(xml: string, uri: string): readonly string[] {
  const pattern = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*["']${escapeRegExp(uri)}["']`, 'g');
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function propertiesOf(xml: string, prefix: GainMapPrefix, written: string): readonly GainMapProperty[] {
  const p = escapeRegExp(written);
  const attributes = [...xml.matchAll(new RegExp(`\\s${p}:(\\w+)\\s*=\\s*"([^"]*)"`, 'g'))]
    .map((match) => ({ prefix, name: match[1], values: [match[2].trim()] }));
  const scalars = [...xml.matchAll(new RegExp(`<${p}:(\\w+)>([^<]*)</${p}:\\1>`, 'g'))]
    .map((match) => ({ prefix, name: match[1], values: [match[2].trim()] }));
  const sequences = [...xml.matchAll(new RegExp(`<${p}:(\\w+)>\\s*<rdf:Seq>([\\s\\S]*?)</rdf:Seq>\\s*</${p}:\\1>`, 'g'))]
    .map((match) => ({ prefix, name: match[1], values: [...match[2].matchAll(/<rdf:li>([^<]*)<\/rdf:li>/g)].map((li) => li[1].trim()) }));
  return [...attributes, ...scalars, ...sequences];
}

const isSafe = (property: GainMapProperty): boolean =>
  SAFE_NAME.test(property.name) && property.values.length > 0 && property.values.every((value) => SAFE_VALUE.test(value));

/** Les propriétés de carte de gain d'un paquet XMP, filtrées par la liste blanche. */
export function gainMapProperties(xml: string): readonly GainMapProperty[] {
  const found = (Object.keys(NAMESPACES) as GainMapPrefix[]).flatMap((prefix) =>
    declaredPrefixes(xml, NAMESPACES[prefix]).flatMap((written) => propertiesOf(xml, prefix, written)),
  );
  const unique = new Map(found.filter(isSafe).map((property) => [`${property.prefix}:${property.name}`, property]));
  return [...unique.values()];
}

/** Le texte d'un segment APP1 XMP, ou `null` si le segment n'en est pas un. */
export function xmpPacketOf(segment: Buffer): string | null {
  const payload = segment.subarray(4);
  return payload.subarray(0, XMP_SIGNATURE.length).equals(XMP_SIGNATURE) ? payload.subarray(XMP_SIGNATURE.length).toString('utf8') : null;
}

export type ContainerItem = { readonly semantic: 'Primary' | 'GainMap'; readonly length?: number };

function element(property: GainMapProperty): string {
  const tag = `${property.prefix}:${property.name}`;
  if (property.values.length === 1) return `<${tag}>${property.values[0]}</${tag}>`;
  return `<${tag}><rdf:Seq>${property.values.map((value) => `<rdf:li>${value}</rdf:li>`).join('')}</rdf:Seq></${tag}>`;
}

function containerDirectory(items: readonly ContainerItem[]): string {
  const entries = items.map(({ semantic, length }) =>
    `<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="${semantic}" Item:Mime="image/jpeg"${length === undefined ? '' : ` Item:Length="${length}"`}/></rdf:li>`,
  );
  return `<Container:Directory><rdf:Seq>${entries.join('')}</rdf:Seq></Container:Directory>`;
}

/**
 * Un paquet XMP neuf : les propriétés de carte de gain gardées, et, pour
 * l'image principale d'un Ultra HDR, son répertoire `GContainer` recalculé.
 */
export function gainMapXmpPacket(properties: readonly GainMapProperty[], container?: readonly ContainerItem[]): string {
  const used = [...new Set(properties.map((property) => property.prefix))];
  const namespaces = used.map((prefix) => ` xmlns:${prefix}="${NAMESPACES[prefix]}"`).join('');
  const containerNamespaces = container
    ? ' xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/"'
    : '';
  const attributes = properties
    .filter((property) => property.prefix === 'hdrgm' && property.values.length === 1)
    .map((property) => ` hdrgm:${property.name}="${property.values[0]}"`)
    .join('');
  const elements = properties
    .filter((property) => !(property.prefix === 'hdrgm' && property.values.length === 1))
    .map(element)
    .join('');
  const body = `${elements}${container ? containerDirectory(container) : ''}`;
  const description = `<rdf:Description rdf:about=""${namespaces}${containerNamespaces}${attributes}>${body}</rdf:Description>`;
  return `${XMP_PROPERTY_HEADER}${description}${XMP_PROPERTY_FOOTER}`;
}

/** Le même paquet, dans un segment APP1 JPEG. */
export function gainMapXmpSegment(properties: readonly GainMapProperty[], container?: readonly ContainerItem[]): Buffer {
  const payload = Buffer.concat([XMP_SIGNATURE, Buffer.from(gainMapXmpPacket(properties, container), 'utf8')]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
