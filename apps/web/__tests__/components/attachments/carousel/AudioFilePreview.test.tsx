/**
 * Tests for AudioFilePreview — file size display.
 *
 * The size line must go through the shared `formatFileSize` SSOT so it rolls
 * units (B → KB → MB) instead of always rendering raw kilobytes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioFilePreview } from '../../../../components/attachments/carousel/AudioFilePreview';

jest.mock('lucide-react', () => ({
  Play: () => <span>▶</span>,
  Pause: () => <span>⏸</span>,
  Loader2: () => <span>⏳</span>,
  CheckCircle: () => <span>✓</span>,
}));

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-audio');
global.URL.revokeObjectURL = jest.fn();

const makeFile = (size: number): File => {
  const file = new File(['x'], 'clip.webm', { type: 'audio/webm' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const defaultProps = {
  extension: 'webm',
  isUploading: false,
  isUploaded: false,
  progress: undefined,
} as const;

describe('AudioFilePreview — file size display', () => {
  it('rolls a multi-megabyte clip into MB, not thousands of KB', () => {
    render(<AudioFilePreview {...defaultProps} file={makeFile(3 * 1024 * 1024)} />);
    expect(screen.getByText('3 MB')).toBeInTheDocument();
    expect(screen.queryByText(/3072 KB/)).not.toBeInTheDocument();
  });

  it('shows sub-kilobyte clips in bytes, not "0 KB"', () => {
    render(<AudioFilePreview {...defaultProps} file={makeFile(512)} />);
    expect(screen.getByText('512 B')).toBeInTheDocument();
    expect(screen.queryByText('0 KB')).not.toBeInTheDocument();
  });

  it('formats kilobyte-range clips via the shared helper', () => {
    render(<AudioFilePreview {...defaultProps} file={makeFile(52428)} />);
    expect(screen.getByText('51.2 KB')).toBeInTheDocument();
  });
});
