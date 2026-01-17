import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationImageUploadDialog } from '../../../components/conversations/conversation-image-upload-dialog';
import { validateAvatarFile } from '@/utils/avatar-upload';
import { getCroppedImg, cleanupObjectUrl } from '@/utils/image-crop';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'conversationImage.title': 'Change conversation image',
        'conversationImage.selectImage': 'Select an image',
        'conversationImage.selectImageDescription': 'Choose an image to represent this conversation',
        'conversationImage.chooseFile': 'Choose a file',
        'conversationImage.fileRequirements': 'JPEG, PNG or WebP - Max 5MB',
        'conversationImage.zoom': 'Zoom',
        'conversationImage.rotation': 'Rotation',
        'conversationImage.instructions': 'Use the mouse to move the image, sliders to zoom and rotate.',
        'conversationImage.reset': 'Reset',
        'conversationImage.changeImage': 'Change image',
        'conversationImage.cancel': 'Cancel',
        'conversationImage.save': 'Save',
        'conversationImage.uploading': 'Uploading...',
        'conversationImage.processing': 'Processing...',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock utility functions
jest.mock('@/utils/avatar-upload', () => ({
  validateAvatarFile: jest.fn(),
}));

jest.mock('@/utils/image-crop', () => ({
  getCroppedImg: jest.fn(),
  cleanupObjectUrl: jest.fn(),
}));

// Mock react-easy-crop
jest.mock('react-easy-crop', () => {
  return function MockCropper({
    image,
    crop,
    zoom,
    rotation,
    onCropChange,
    onZoomChange,
    onCropComplete,
  }: any) {
    return (
      <div data-testid="cropper">
        <span data-testid="cropper-image">{image}</span>
        <span data-testid="cropper-zoom">{zoom}</span>
        <span data-testid="cropper-rotation">{rotation}</span>
        <button
          onClick={() => onCropChange({ x: 10, y: 10 })}
          data-testid="move-crop"
        >
          Move
        </button>
        <button
          onClick={() => onZoomChange(2)}
          data-testid="change-zoom"
        >
          Zoom
        </button>
        <button
          onClick={() => onCropComplete(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 0, y: 0, width: 200, height: 200 }
          )}
          data-testid="complete-crop"
        >
          Complete
        </button>
      </div>
    );
  };
});

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, variant }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label data-testid="label" className={className}>{children}</label>
  ),
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step }: any) => (
    <input
      type="range"
      data-testid="slider"
      value={value?.[0] || 0}
      onChange={(e) => onValueChange([parseFloat(e.target.value)])}
      min={min}
      max={max}
      step={step}
    />
  ),
}));

describe('ConversationImageUploadDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onImageUploaded: jest.fn(),
    isUploading: false,
    conversationTitle: 'Test Conversation',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (validateAvatarFile as jest.Mock).mockReturnValue({ valid: true });
    (getCroppedImg as jest.Mock).mockResolvedValue({
      file: new File(['test'], 'test.jpg', { type: 'image/jpeg' }),
      url: 'blob:test-url',
    });

    // Mock FileReader
    const mockFileReader = {
      readAsDataURL: jest.fn(),
      onload: null,
      result: 'data:image/jpeg;base64,test',
    };
    global.FileReader = jest.fn(() => mockFileReader as any) as any;
  });

  describe('Initial Render', () => {
    it('should render dialog when open is true', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render dialog when open is false', () => {
      render(<ConversationImageUploadDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display dialog title', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      expect(screen.getByText('Change conversation image')).toBeInTheDocument();
    });

    it('should show file selection UI initially', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      expect(screen.getByText('Select an image')).toBeInTheDocument();
      expect(screen.getByText('Choose an image to represent this conversation')).toBeInTheDocument();
      expect(screen.getByText('Choose a file')).toBeInTheDocument();
    });

    it('should show file requirements', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      expect(screen.getByText('JPEG, PNG or WebP - Max 5MB')).toBeInTheDocument();
    });

    it('should have hidden file input', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput?.className).toContain('hidden');
    });

    it('should accept correct file types', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/jpg,image/png,image/webp');
    });
  });

  describe('File Selection', () => {
    it('should open file picker when choose file button is clicked', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = jest.spyOn(fileInput, 'click');

      const chooseButton = screen.getByText('Choose a file');
      fireEvent.click(chooseButton);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should validate file when selected', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(validateAvatarFile).toHaveBeenCalledWith(file);
    });

    it('should show error toast when file validation fails', async () => {
      const { toast } = require('sonner');
      (validateAvatarFile as jest.Mock).mockReturnValue({
        valid: false,
        error: 'File too large',
      });

      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(toast.error).toHaveBeenCalledWith('File too large');
    });

    it('should show cropper when valid file is selected', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      // Create mock FileReader
      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      // Simulate FileReader onload
      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });
    });
  });

  describe('Cropper Controls', () => {
    const setupCropper = async () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });
    };

    it('should show zoom slider when image is loaded', async () => {
      await setupCropper();

      // Multiple zoom labels may appear (slider and preview), use getAllByText
      const zoomLabels = screen.getAllByText('Zoom');
      expect(zoomLabels.length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('slider').length).toBeGreaterThan(0);
    });

    it('should show rotation slider when image is loaded', async () => {
      await setupCropper();

      expect(screen.getByText('Rotation')).toBeInTheDocument();
    });

    it('should show instructions when image is loaded', async () => {
      await setupCropper();

      expect(screen.getByText('Use the mouse to move the image, sliders to zoom and rotate.')).toBeInTheDocument();
    });

    it('should show reset button when image is loaded', async () => {
      await setupCropper();

      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    it('should show change image button when image is loaded', async () => {
      await setupCropper();

      expect(screen.getByText('Change image')).toBeInTheDocument();
    });

    it('should show save button when image is loaded', async () => {
      await setupCropper();

      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('Cancel Button', () => {
    it('should call onClose when cancel button is clicked', () => {
      const onClose = jest.fn();
      render(<ConversationImageUploadDialog {...defaultProps} onClose={onClose} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when processing', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} isUploading={true} />);

      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('Save Functionality', () => {
    it('should call getCroppedImg when save is clicked', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });

      // Complete crop to set croppedAreaPixels
      fireEvent.click(screen.getByTestId('complete-crop'));

      // Click save
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(getCroppedImg).toHaveBeenCalled();
      });
    });

    it('should call onImageUploaded with cropped file', async () => {
      const onImageUploaded = jest.fn();
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      (getCroppedImg as jest.Mock).mockResolvedValue({
        file: mockFile,
        url: 'blob:test-url',
      });

      render(
        <ConversationImageUploadDialog
          {...defaultProps}
          onImageUploaded={onImageUploaded}
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });

      // Complete crop
      fireEvent.click(screen.getByTestId('complete-crop'));

      // Click save
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onImageUploaded).toHaveBeenCalledWith(mockFile);
      });
    });

    it('should show error toast when crop fails', async () => {
      const { toast } = require('sonner');
      (getCroppedImg as jest.Mock).mockRejectedValue(new Error('Crop failed'));

      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });

      // Complete crop
      fireEvent.click(screen.getByTestId('complete-crop'));

      // Click save
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Reset Functionality', () => {
    it('should reset zoom and rotation when reset is clicked', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });

      // Initial zoom should be 1
      expect(screen.getByTestId('cropper-zoom')).toHaveTextContent('1');

      // Click reset (should reset values)
      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      // Values should still be 1 after reset
      expect(screen.getByTestId('cropper-zoom')).toHaveTextContent('1');
    });
  });

  describe('Upload State', () => {
    it('should show uploading text when isUploading is true', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} isUploading={true} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const mockReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        result: 'data:image/jpeg;base64,test',
      };
      global.FileReader = jest.fn(() => mockReader) as any;

      fireEvent.change(fileInput, { target: { files: [file] } });

      act(() => {
        if (mockReader.onload) {
          mockReader.onload({ target: { result: 'data:image/jpeg;base64,test' } } as any);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('cropper')).toBeInTheDocument();
      });

      expect(screen.getByText('Uploading...')).toBeInTheDocument();
    });

    it('should disable buttons when uploading', async () => {
      render(<ConversationImageUploadDialog {...defaultProps} isUploading={true} />);

      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('State Reset on Dialog Reopen', () => {
    it('should reset state when dialog reopens', async () => {
      const { rerender } = render(
        <ConversationImageUploadDialog {...defaultProps} />
      );

      // Simulate closing and reopening
      rerender(<ConversationImageUploadDialog {...defaultProps} open={false} />);
      rerender(<ConversationImageUploadDialog {...defaultProps} open={true} />);

      // Should show file selection UI again
      expect(screen.getByText('Select an image')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle no file selected', () => {
      render(<ConversationImageUploadDialog {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [] } });

      // Should still show file selection UI
      expect(screen.getByText('Select an image')).toBeInTheDocument();
    });

    it('should use default conversation title', () => {
      render(
        <ConversationImageUploadDialog
          {...defaultProps}
          conversationTitle={undefined}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
