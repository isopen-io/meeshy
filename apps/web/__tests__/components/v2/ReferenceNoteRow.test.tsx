import { render, screen } from '@testing-library/react';
import { ReferenceNoteRow } from '@/components/v2/ReferenceNoteRow';
import type { PostReference } from '@meeshy/shared/types/post-reference';

const ALICE: PostReference = { userId: 'u-a', username: 'alice', displayName: 'Alice B.', avatar: null, display: 'NOTE' };
const BOB: PostReference = { userId: 'u-b', username: 'bob', displayName: null, avatar: null, display: 'INLINE' };
const CAROL: PostReference = { userId: 'u-c', username: 'carol', displayName: 'Carol', avatar: null, display: 'SILENT' };

describe('ReferenceNoteRow', () => {
  it('displays NOTE references under their display name', () => {
    render(<ReferenceNoteRow references={[ALICE, BOB]} viewerId="u-x" />);
    expect(screen.getByText('Alice B.')).toBeInTheDocument();
  });

  it('does NOT display INLINE references — the text already carries them', () => {
    render(<ReferenceNoteRow references={[BOB]} viewerId="u-x" />);
    expect(screen.queryByText('bob')).toBeNull();
  });

  it('NEVER shows a SILENT reference to a third party', () => {
    render(<ReferenceNoteRow references={[CAROL]} viewerId="u-x" />);
    expect(screen.queryByText('Carol')).toBeNull();
  });

  it('shows the referenced person that they are referenced', () => {
    render(<ReferenceNoteRow references={[CAROL]} viewerId="u-c" />);
    expect(screen.getByText(/referenced/i)).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<ReferenceNoteRow references={[BOB]} viewerId="u-x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('joins several NOTE references with a comma', () => {
    const DAVE: PostReference = { userId: 'u-d', username: 'dave', displayName: 'Dave', avatar: null, display: 'NOTE' };
    render(<ReferenceNoteRow references={[ALICE, DAVE]} viewerId="u-x" />);
    expect(screen.getByText('Alice B.')).toBeInTheDocument();
    expect(screen.getByText('Dave')).toBeInTheDocument();
  });
});
