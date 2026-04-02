import type { PostVoteSummary } from "../api/types";

interface VoteControlsProps extends PostVoteSummary {
  busy?: boolean;
  onVote(nextValue: 1 | -1): void;
}

export default function VoteControls({
  vote_score,
  upvote_count,
  downvote_count,
  current_user_vote,
  busy = false,
  onVote,
}: VoteControlsProps) {
  return (
    <div className="vote-rail" aria-label="Post voting controls">
      <button
        className={`vote-btn ${current_user_vote === 1 ? "active up" : ""}`}
        type="button"
        disabled={busy}
        aria-pressed={current_user_vote === 1}
        onClick={() => onVote(1)}
      >
        ^
      </button>
      <strong className="vote-score">{vote_score}</strong>
      <button
        className={`vote-btn ${current_user_vote === -1 ? "active down" : ""}`}
        type="button"
        disabled={busy}
        aria-pressed={current_user_vote === -1}
        onClick={() => onVote(-1)}
      >
        v
      </button>
      <p className="vote-meta">
        {upvote_count} up / {downvote_count} down
      </p>
    </div>
  );
}
