import { useState, useRef } from "react";

const MAX_TAGS = 5;

function normalizeTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

interface TagEditorProps {
  initialTags?: string[];
  placeholder?: string;
  hint?: string;
}

export default function TagEditor({
  initialTags = [],
  placeholder = "Add a tag",
  hint = "Add up to 5 short tags for discoverability.",
}: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draftTag, setDraftTag] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedDraftTag = normalizeTag(draftTag);
  const submittedTags =
    normalizedDraftTag && !tags.includes(normalizedDraftTag) && tags.length < MAX_TAGS
      ? [...tags, normalizedDraftTag]
      : tags;

  function addTag() {
    const tag = normalizeTag(draftTag);
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) {
      setDraftTag("");
      return;
    }
    setTags([...tags, tag]);
    setDraftTag("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className="field">
      <div className="field-head">
        <label>Tags</label>
        <p className="field-hint">{hint}</p>
      </div>
      <div className="tag-editor">
        <div className="tag-input-row">
          <input
            ref={inputRef}
            className="tag-input"
            type="text"
            placeholder={placeholder}
            maxLength={20}
            value={draftTag}
            onChange={(e) => setDraftTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button className="tag-add" type="button" onClick={addTag}>
            Add Tag
          </button>
        </div>
        <div className="tag-row">
          {tags.map((tag) => (
            <button
              key={tag}
              className="tag removable"
              type="button"
              onClick={() => removeTag(tag)}
            >
              <span>#{tag}</span>
              <span className="tag-remove" aria-hidden="true">
                x
              </span>
            </button>
          ))}
        </div>
        <input type="hidden" name="tags" value={submittedTags.join(",")} />
      </div>
    </div>
  );
}
