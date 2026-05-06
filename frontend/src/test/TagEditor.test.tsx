import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import TagEditor from '../components/TagEditor';

async function addTag(label: string) {
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, label);
  await userEvent.click(screen.getByRole('button', { name: /add tag/i }));
}

describe('TagEditor', () => {
  it('renders with no tags by default', () => {
    render(<TagEditor />);
    // Only the "Add Tag" button should be present; no removable tags
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('renders initial tags', () => {
    render(<TagEditor initialTags={['react', 'typescript']} />);
    expect(screen.getByText('#react')).toBeInTheDocument();
    expect(screen.getByText('#typescript')).toBeInTheDocument();
  });

  it('adds a tag when clicking Add Tag', async () => {
    render(<TagEditor />);
    await addTag('gaming');
    expect(screen.getByText('#gaming')).toBeInTheDocument();
  });

  it('adds a tag when pressing Enter', async () => {
    render(<TagEditor />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'esports{Enter}');
    expect(screen.getByText('#esports')).toBeInTheDocument();
  });

  it('normalizes tags by stripping leading # and spaces', async () => {
    render(<TagEditor />);
    await addTag('##my tag');
    expect(screen.getByText('#mytag')).toBeInTheDocument();
  });

  it('strips invalid characters from tags', async () => {
    render(<TagEditor />);
    await addTag('hello!world@');
    expect(screen.getByText('#helloworld')).toBeInTheDocument();
  });

  it('removes a tag when clicking on it', async () => {
    render(<TagEditor initialTags={['react']} />);
    await userEvent.click(screen.getByText('#react').closest('button')!);
    expect(screen.queryByText('#react')).not.toBeInTheDocument();
  });

  it('does not add duplicate tags', async () => {
    render(<TagEditor initialTags={['react']} />);
    await addTag('react');
    const tags = screen.getAllByText('#react');
    expect(tags).toHaveLength(1);
  });

  it('enforces a maximum of 5 tags', async () => {
    render(<TagEditor initialTags={['a', 'b', 'c', 'd', 'e']} />);
    await addTag('f');
    expect(screen.queryByText('#f')).not.toBeInTheDocument();
  });

  it('clears the input after adding a tag', async () => {
    render(<TagEditor />);
    await addTag('gaming');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('updates the hidden input with the current tags', async () => {
    const { container } = render(<TagEditor initialTags={['react']} />);
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(hidden?.value).toBe('react');
  });

  it('includes a pending draft in the hidden input value', async () => {
    const { container } = render(<TagEditor initialTags={['react']} />);
    const textInput = screen.getByRole('textbox');
    await userEvent.type(textInput, 'typescript');
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(hidden?.value).toBe('react,typescript');
  });
});
