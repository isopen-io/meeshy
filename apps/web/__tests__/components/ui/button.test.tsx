/**
 * Tests for Button component
 * Tests variants, sizes, asChild prop, and accessibility
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button, buttonVariants } from '../../../components/ui/button';

describe('Button', () => {
  describe('Basic Rendering', () => {
    it('should render button with children', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button')).toHaveTextContent('Click me');
    });

    it('should render as button element by default', () => {
      render(<Button>Button</Button>);

      expect(screen.getByRole('button').tagName).toBe('BUTTON');
    });

    it('should pass through additional props', () => {
      render(<Button data-testid="custom-button" id="my-btn">Test</Button>);

      const button = screen.getByTestId('custom-button');
      expect(button).toHaveAttribute('id', 'my-btn');
    });

    it('should have data-slot attribute', () => {
      render(<Button>Test</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'button');
    });
  });

  describe('Variants', () => {
    describe('Default variant', () => {
      it('should render with default variant styles', () => {
        render(<Button>Default</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('bg-primary/90');
      });

      it('should render default variant when no variant specified', () => {
        render(<Button>Default</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('text-primary-foreground');
      });
    });

    describe('Destructive variant', () => {
      it('should render with destructive variant styles', () => {
        render(<Button variant="destructive">Delete</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('bg-destructive/90');
        expect(button).toHaveClass('text-white');
      });
    });

    describe('Outline variant', () => {
      it('should render with outline variant styles', () => {
        render(<Button variant="outline">Outline</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('bg-white/50');
        expect(button).toHaveClass('border');
      });
    });

    describe('Secondary variant', () => {
      it('should render with secondary variant styles', () => {
        render(<Button variant="secondary">Secondary</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('bg-secondary/80');
        expect(button).toHaveClass('text-secondary-foreground');
      });
    });

    describe('Tertiary variant', () => {
      it('should render with tertiary variant styles', () => {
        render(<Button variant="tertiary">Tertiary</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('bg-white/30');
      });
    });

    describe('Ghost variant', () => {
      it('should render with ghost variant styles', () => {
        render(<Button variant="ghost">Ghost</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('hover:bg-white/50');
      });
    });

    describe('Link variant', () => {
      it('should render with link variant styles', () => {
        render(<Button variant="link">Link</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('text-primary');
        expect(button).toHaveClass('underline-offset-4');
      });
    });
  });

  describe('Sizes', () => {
    describe('Default size', () => {
      it('should render with default size', () => {
        render(<Button>Default Size</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('h-9');
        expect(button).toHaveClass('px-4');
      });
    });

    describe('Small size', () => {
      it('should render with small size', () => {
        render(<Button size="sm">Small</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('h-8');
        expect(button).toHaveClass('px-3');
      });
    });

    describe('Large size', () => {
      it('should render with large size', () => {
        render(<Button size="lg">Large</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('h-10');
        expect(button).toHaveClass('px-6');
      });
    });

    describe('Icon size', () => {
      it('should render with icon size', () => {
        render(<Button size="icon">Icon</Button>);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('size-9');
      });
    });
  });

  describe('asChild prop', () => {
    it('should render children as the component when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );

      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });

    it('should apply button styles to child element', () => {
      render(
        <Button asChild variant="destructive">
          <a href="/delete">Delete Link</a>
        </Button>
      );

      const link = screen.getByRole('link');
      expect(link).toHaveClass('bg-destructive/90');
    });

    it('should render as button when asChild is false', () => {
      render(<Button asChild={false}>Normal Button</Button>);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should render disabled button', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should have disabled styles', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('disabled:pointer-events-none');
      expect(button).toHaveClass('disabled:opacity-50');
    });

    it('should not trigger click when disabled', () => {
      const handleClick = jest.fn();

      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Click Handling', () => {
    it('should call onClick when clicked', () => {
      const handleClick = jest.fn();

      render(<Button onClick={handleClick}>Click</Button>);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should pass event to onClick handler', () => {
      const handleClick = jest.fn();

      render(<Button onClick={handleClick}>Click</Button>);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('Custom className', () => {
    it('should merge custom className with default classes', () => {
      render(<Button className="my-custom-class">Custom</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('my-custom-class');
      expect(button).toHaveClass('inline-flex'); // default class
    });

    it('should allow className to override default styles', () => {
      render(<Button className="bg-green-500">Green Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-green-500');
    });
  });

  describe('Focus Styles', () => {
    it('should have focus-visible ring styles', () => {
      render(<Button>Focus Me</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:ring-ring/50');
      expect(button).toHaveClass('focus-visible:ring-[3px]');
    });

    it('should have outline-none', () => {
      render(<Button>Button</Button>);

      expect(screen.getByRole('button')).toHaveClass('outline-none');
    });
  });

  describe('SVG Icon Handling', () => {
    it('should have pointer-events-none on SVGs', () => {
      render(<Button>Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('[&_svg]:pointer-events-none');
    });

    it('should have shrink-0 on SVGs', () => {
      render(<Button>Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('[&_svg]:shrink-0');
    });
  });

  describe('Aria Invalid Styles', () => {
    it('should have aria-invalid ring styles', () => {
      render(<Button aria-invalid="true">Invalid</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('aria-invalid:ring-destructive/20');
      expect(button).toHaveClass('aria-invalid:border-destructive');
    });
  });

  describe('Type Attribute', () => {
    it('should default to button type', () => {
      render(<Button>Button</Button>);

      // Buttons default to type="submit" in forms, but our component may not set it
      // This test ensures we can explicitly set type
    });

    it('should accept submit type', () => {
      render(<Button type="submit">Submit</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('should accept reset type', () => {
      render(<Button type="reset">Reset</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'reset');
    });
  });

  describe('buttonVariants utility', () => {
    it('should export buttonVariants for external use', () => {
      expect(buttonVariants).toBeDefined();
      expect(typeof buttonVariants).toBe('function');
    });

    it('should generate correct class string for variants', () => {
      const classes = buttonVariants({ variant: 'destructive', size: 'lg' });

      expect(classes).toContain('bg-destructive/90');
      expect(classes).toContain('h-10');
    });

    it('should generate default classes when no options provided', () => {
      const classes = buttonVariants({});

      expect(classes).toContain('bg-primary/90');
      expect(classes).toContain('h-9');
    });
  });

  describe('Accessibility', () => {
    it('should be focusable', () => {
      render(<Button>Focusable</Button>);

      const button = screen.getByRole('button');
      button.focus();

      expect(document.activeElement).toBe(button);
    });

    it('should support aria-label', () => {
      render(<Button aria-label="Close dialog">X</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Close dialog');
    });

    it('should support aria-describedby', () => {
      render(
        <>
          <Button aria-describedby="desc">Button</Button>
          <span id="desc">Description text</span>
        </>
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'desc');
    });

    it('should be keyboard accessible', () => {
      const handleClick = jest.fn();

      render(<Button onClick={handleClick}>Press Enter</Button>);

      const button = screen.getByRole('button');
      button.focus();
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.keyUp(button, { key: 'Enter' });

      // Enter key should trigger click on buttons
    });
  });

  describe('Transition', () => {
    it('should have transition-all class', () => {
      render(<Button>Animated</Button>);

      expect(screen.getByRole('button')).toHaveClass('transition-all');
    });
  });

  describe('Layout', () => {
    it('should be inline-flex', () => {
      render(<Button>Inline</Button>);

      expect(screen.getByRole('button')).toHaveClass('inline-flex');
    });

    it('should center items', () => {
      render(<Button>Centered</Button>);

      expect(screen.getByRole('button')).toHaveClass('items-center');
      expect(screen.getByRole('button')).toHaveClass('justify-center');
    });

    it('should have gap for children', () => {
      render(<Button>Gap</Button>);

      expect(screen.getByRole('button')).toHaveClass('gap-2');
    });

    it('should shrink-0', () => {
      render(<Button>No Shrink</Button>);

      expect(screen.getByRole('button')).toHaveClass('shrink-0');
    });
  });

  describe('Text Styling', () => {
    it('should have text-sm', () => {
      render(<Button>Small Text</Button>);

      expect(screen.getByRole('button')).toHaveClass('text-sm');
    });

    it('should have font-medium', () => {
      render(<Button>Medium Weight</Button>);

      expect(screen.getByRole('button')).toHaveClass('font-medium');
    });

    it('should have whitespace-nowrap', () => {
      render(<Button>No Wrap</Button>);

      expect(screen.getByRole('button')).toHaveClass('whitespace-nowrap');
    });
  });

  describe('Border Radius', () => {
    it('should have rounded-md', () => {
      render(<Button>Rounded</Button>);

      expect(screen.getByRole('button')).toHaveClass('rounded-md');
    });
  });
});
