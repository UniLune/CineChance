import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import MovieCard from '../MovieCard';
import { Media } from '@/lib/tmdb';

// Mock child components to isolate MovieCard
vi.mock('../MoviePosterProxy', () => ({
  default: ({ movie }: { movie: Media }) => (
    <div data-testid="movie-poster-proxy">{movie.title}</div>
  ),
}));

vi.mock('../StatusOverlay', () => ({
  default: ({ status }: { status: string }) => (
    <div data-testid="status-overlay">{status}</div>
  ),
}));

vi.mock('../RatingModal', () => ({
  default: ({ isOpen, onClose, title }: any) => 
    isOpen ? <div data-testid="rating-modal">{title}</div> : null,
}));

vi.mock('../RatingInfoModal', () => ({
  default: ({ isOpen, onClose, title }: any) => 
    isOpen ? <div data-testid="rating-info-modal">{title}</div> : null,
}));

describe('MovieCard - Order Numbers', () => {
  const createMockMovie = (overrides: Partial<Media> = {}): Media => ({
    id: 1,
    title: 'Test Movie',
    vote_average: 7.5,
    vote_count: 1000,
    media_type: 'movie',
    release_date: '2024-01-01',
    overview: 'Test overview',
    poster_path: '/test.jpg',
    ...overrides,
  });

  it('renders order number when index prop is provided', () => {
    // This test expects that MovieCard accepts an `index` prop
    // Currently this will FAIL because index prop doesn't exist on MovieCard
    // This is the expected RED phase behavior
    expect(() => {
      render(<MovieCard movie={createMockMovie()} index={0} />);
    }).not.toThrow();
    
    // If the component accepts index, it should render order number "1"
    const orderNumber = screen.getByText('1');
    expect(orderNumber).toBeInTheDocument();
  });

  it('displays index + 1 as order number', () => {
    // Test with index=4 (should show №5)
    render(<MovieCard movie={createMockMovie()} index={4} />);
    
    const orderNumber = screen.getByText('5');
    expect(orderNumber).toBeInTheDocument();
  });

  it('displays correct number for index=0 (first item)', () => {
    render(<MovieCard movie={createMockMovie()} index={0} />);
    
    const orderNumber = screen.getByText('1');
    expect(orderNumber).toBeInTheDocument();
  });

  it('displays correct number for large index', () => {
    render(<MovieCard movie={createMockMovie()} index={99} />);
    
    const orderNumber = screen.getByText('100');
    expect(orderNumber).toBeInTheDocument();
  });

  it('order number has correct styling classes for pale golden colors', () => {
    render(<MovieCard movie={createMockMovie()} index={2} />);
    
    const orderNumber = screen.getByText('3');
    const parentElement = orderNumber.parentElement;
    
    // Check for the pale golden colors (amber based) as per design spec
    // The specification says: "amber-900/40, amber-100/90"
    // These would be Tailwind classes: bg-amber-900/40 (background), text-amber-100/90 (text)
    expect(parentElement).toHaveClass('bg-amber-900/40'); // background with opacity 40%
    expect(parentElement).toHaveClass('text-amber-100/90'); // text with high opacity (90%)
  });

  it('does not render order number when index prop is not provided', () => {
    render(<MovieCard movie={createMockMovie()} />);
    
    // Should not find a standalone order number with the specific styling
    // We check that no element has both the amber background and the order number styling
    const goldenElements = document.querySelectorAll('.bg-amber-900\\/40, .text-amber-100\\/90');
    expect(goldenElements.length).toBe(0);
  });

  it('order number is positioned in top-left corner', () => {
    render(<MovieCard movie={createMockMovie()} index={0} />);
    
    const orderNumber = screen.getByText('1');
    const parentElement = orderNumber.parentElement;
    
    // Should be absolutely positioned in the top-left corner
    expect(parentElement).toHaveClass('absolute');
    expect(parentElement).toHaveClass('top-0');
    expect(parentElement).toHaveClass('left-0');
  });

  it('order number has high z-index to appear above poster', () => {
    render(<MovieCard movie={createMockMovie()} index={0} />);
    
    const orderNumber = screen.getByText('1');
    const parentElement = orderNumber.parentElement;
    
    // Should have high z-index (z-10 or higher)
    expect(parentElement).toHaveClass('z-10');
  });

  it('order number has rounded corners for badge appearance', () => {
    render(<MovieCard movie={createMockMovie()} index={0} />);
    
    const orderNumber = screen.getByText('1');
    const parentElement = orderNumber.parentElement;
    
    // Should have rounded corners (rounded or rounded-lg, etc.)
    const hasRoundedClass = parentElement?.className.split(' ').some(cls => 
      cls.startsWith('rounded')
    );
    expect(hasRoundedClass).toBe(true);
  });
});
