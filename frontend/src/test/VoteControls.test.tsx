import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VoteControls from '../components/VoteControls';

const defaultProps = {
  vote_score: 42,
  upvote_count: 50,
  downvote_count: 8,
  current_user_vote: 0,
  onVote: vi.fn(),
};

describe('VoteControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('renders the vote score and counts', () => {
    render(<VoteControls {...defaultProps} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('50 up / 8 down')).toBeInTheDocument();
  });

  it('calls onVote(1) when upvote button is clicked', async () => {
    const onVote = vi.fn();
    render(<VoteControls {...defaultProps} onVote={onVote} />);
    await userEvent.click(screen.getByRole('button', { name: /upvote/i }));
    expect(onVote).toHaveBeenCalledWith(1);
  });

  it('calls onVote(-1) when downvote button is clicked', async () => {
    const onVote = vi.fn();
    render(<VoteControls {...defaultProps} onVote={onVote} />);
    await userEvent.click(screen.getByRole('button', { name: /downvote/i }));
    expect(onVote).toHaveBeenCalledWith(-1);
  });

  it('marks upvote button as pressed when current_user_vote is 1', () => {
    render(<VoteControls {...defaultProps} current_user_vote={1} />);
    const upBtn = screen.getByRole('button', { name: /upvote/i });
    expect(upBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks downvote button as pressed when current_user_vote is -1', () => {
    render(<VoteControls {...defaultProps} current_user_vote={-1} />);
    const downBtn = screen.getByRole('button', { name: /downvote/i });
    expect(downBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables both buttons when busy', () => {
    render(<VoteControls {...defaultProps} busy={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('does not disable buttons when busy is false', () => {
    render(<VoteControls {...defaultProps} busy={false} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
  });
});
