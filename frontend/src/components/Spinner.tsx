/**
 * A reusable loading spinner that matches the GoodGame design language.
 * Drop it anywhere a page or section is waiting for async data.
 *
 * Usage:
 *   <Spinner />                   — default "Loading…"
 *   <Spinner text="Saving…" />    — custom message
 */
export default function Spinner({ text = "Loading\u2026" }: { text?: string }) {
  return (
    <div className="spinner-wrapper" role="status" aria-label={text}>
      <div className="spinner" />
      <p className="spinner-text">{text}</p>
    </div>
  );
}
