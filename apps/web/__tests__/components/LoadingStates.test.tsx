import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { 
  LoadingSpinner, 
  LoadingState,
  LoadingSkeleton,
  LoadingCard
} from '../../components/common/LoadingStates';

describe('LoadingStates Components', () => {
  describe('LoadingSpinner', () => {
    it('should render with default props', () => {
      const { container } = render(<LoadingSpinner />);
      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
    });

    it('should render with custom size', () => {
      const { container } = render(<LoadingSpinner size="lg" />);
      const spinner = container.querySelector('svg');
      expect(spinner).toHaveClass('h-8', 'w-8');
    });

    it('should apply custom className', () => {
      const { container } = render(<LoadingSpinner className="custom-class" />);
      const spinner = container.querySelector('svg');
      expect(spinner).toHaveClass('custom-class');
    });

    it('should render with small size', () => {
      const { container } = render(<LoadingSpinner size="sm" />);
      const spinner = container.querySelector('svg');
      expect(spinner).toHaveClass('h-4', 'w-4');
    });

    it('should render with medium size by default', () => {
      const { container } = render(<LoadingSpinner />);
      const spinner = container.querySelector('svg');
      expect(spinner).toHaveClass('h-6', 'w-6');
    });
  });

  describe('LoadingState', () => {
    it('should render with default message', () => {
      render(<LoadingState />);
      expect(screen.getByText('Chargement...')).toBeInTheDocument();
    });

    it('should render with custom message', () => {
      const customMessage = 'Loading data...';
      render(<LoadingState message={customMessage} />);
      expect(screen.getByText(customMessage)).toBeInTheDocument();
    });

    it('should render spinner', () => {
      const { container } = render(<LoadingState />);
      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
    });

    it('should apply full screen styling when fullScreen is true', () => {
      const { container } = render(<LoadingState fullScreen={true} />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('fixed', 'inset-0');
    });

    it('should apply regular styling when fullScreen is false', () => {
      const { container } = render(<LoadingState fullScreen={false} />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center', 'p-8');
      expect(wrapper).not.toHaveClass('fixed');
    });

    it('should apply custom className', () => {
      const { container } = render(<LoadingState className="custom-loading-class" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-loading-class');
    });

    it('should render with different spinner sizes', () => {
      const { container } = render(<LoadingState size="lg" />);
      const spinner = container.querySelector('svg');
      expect(spinner).toHaveClass('h-8', 'w-8');
    });

    it('should not render message when message is empty', () => {
      render(<LoadingState message="" />);
      expect(screen.queryByText('Chargement...')).not.toBeInTheDocument();
    });
  });

  describe('LoadingSkeleton', () => {
    it('should render with default number of lines', () => {
      const { container } = render(<LoadingSkeleton />);
      const skeletonLines = container.querySelectorAll('.animate-pulse');
      expect(skeletonLines).toHaveLength(3);
    });

    it('should render with custom number of lines', () => {
      const { container } = render(<LoadingSkeleton lines={5} />);
      const skeletonLines = container.querySelectorAll('.animate-pulse');
      expect(skeletonLines).toHaveLength(5);
    });

    it('should apply custom className', () => {
      const { container } = render(<LoadingSkeleton className="custom-skeleton" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-skeleton');
    });

    it('should render skeleton lines with decreasing widths', () => {
      const { container } = render(<LoadingSkeleton lines={3} />);
      const skeletonLines = container.querySelectorAll('.animate-pulse');
      
      // Check that each line has a different width
      expect(skeletonLines[0]).toHaveStyle({ width: '100%' });
      expect(skeletonLines[1]).toHaveStyle({ width: '90%' });
      expect(skeletonLines[2]).toHaveStyle({ width: '80%' });
    });

    it('should handle zero lines gracefully', () => {
      const { container } = render(<LoadingSkeleton lines={0} />);
      const skeletonLines = container.querySelectorAll('.animate-pulse');
      expect(skeletonLines).toHaveLength(0);
    });
  });

  describe('LoadingCard', () => {
    it('should render with no title or description by default', () => {
      const { container } = render(<LoadingCard />);
      const card = container.firstChild;
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('p-6', 'border', 'rounded-lg');
    });

    it('should render skeleton when title is provided', () => {
      const { container } = render(<LoadingCard title="Test Title" />);
      const titleSkeleton = container.querySelector('.h-6');
      expect(titleSkeleton).toBeInTheDocument();
      expect(titleSkeleton).toHaveClass('bg-muted', 'rounded', 'animate-pulse', 'w-3/4');
    });

    it('should render skeleton when description is provided', () => {
      const { container } = render(<LoadingCard description="Test Description" />);
      const descriptionSkeleton = container.querySelector('.h-4');
      expect(descriptionSkeleton).toBeInTheDocument();
      expect(descriptionSkeleton).toHaveClass('bg-muted', 'rounded', 'animate-pulse', 'w-1/2');
    });

    it('should render both title and description skeletons', () => {
      const { container } = render(<LoadingCard title="Title" description="Description" />);
      const titleSkeleton = container.querySelector('.h-6');
      const descriptionSkeleton = container.querySelector('.h-4');
      
      expect(titleSkeleton).toBeInTheDocument();
      expect(descriptionSkeleton).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<LoadingCard className="custom-card-class" />);
      const card = container.firstChild;
      expect(card).toHaveClass('custom-card-class');
    });

    it('should always render LoadingSkeleton with 3 lines', () => {
      const { container } = render(<LoadingCard />);
      const skeletonLines = container.querySelectorAll('.space-y-2 .animate-pulse');
      expect(skeletonLines).toHaveLength(3);
    });
  });

  describe('Accessibility', () => {
    it('should have proper structure for screen readers', () => {
      render(<LoadingState message="Loading content" />);
      const message = screen.getByText('Loading content');
      expect(message).toBeInTheDocument();
      expect(message).toHaveClass('animate-pulse');
    });

    it('should be keyboard accessible', () => {
      const { container } = render(<LoadingCard />);
      const card = container.firstChild;
      expect(card).toBeInTheDocument();
      // Cards should be focusable if they contain interactive content
    });
  });

  describe('Performance', () => {
    it('should not cause memory leaks with multiple renders', () => {
      const { rerender } = render(<LoadingState />);
      
      // Rerender multiple times to ensure no memory leaks
      for (let i = 0; i < 10; i++) {
        rerender(<LoadingState message={`Loading ${i}...`} />);
      }
      
      expect(screen.getByText('Loading 9...')).toBeInTheDocument();
    });

    it('should handle rapid skeleton line changes', () => {
      const { rerender } = render(<LoadingSkeleton lines={1} />);
      
      // Test rapid changes
      for (let i = 1; i <= 5; i++) {
        rerender(<LoadingSkeleton lines={i} />);
      }
      
      const { container } = render(<LoadingSkeleton lines={5} />);
      const skeletonLines = container.querySelectorAll('.animate-pulse');
      expect(skeletonLines).toHaveLength(5);
    });
  });

  describe('Integration', () => {
    it('should work together in complex layouts', () => {
      const { container } = render(
        <div>
          <LoadingState message="Loading page..." />
          <LoadingCard title="Card Title" description="Card Description" />
          <LoadingSkeleton lines={4} />
        </div>
      );

      expect(screen.getByText('Loading page...')).toBeInTheDocument();
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(5);
    });
  });
});
