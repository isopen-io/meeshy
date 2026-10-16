import { useParams } from '@/lib/router';

/** L'HUMEUR D'UN CONTACT, EN GRAND (#10813) — squelette, la page arrive. */
export default function MoodScreen() {
  const { post } = useParams<'/mood/$post'>();
  return <main data-mood-page={post} />;
}
