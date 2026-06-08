import { render, screen } from '@testing-library/react';
import { CallInfoOverlay } from '@/components/video-calls/CallInfoOverlay';

describe('CallInfoOverlay', () => {
  it('renders the duration label and participant count', () => {
    render(<CallInfoOverlay durationLabel="1:23" participantCount={3} />);
    expect(screen.getByTestId('call-duration')).toHaveTextContent('1:23');
    expect(screen.getByText(/3 participant/)).toBeInTheDocument();
  });
});
