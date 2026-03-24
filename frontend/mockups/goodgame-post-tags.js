const MAX_TAGS = 5;

function normalizeTag(value) {
  return value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

function buildTagButton(tag) {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const remove = document.createElement("span");

  button.className = "tag removable";
  button.type = "button";
  button.dataset.tagValue = tag;

  label.textContent = `#${tag}`;

  remove.className = "tag-remove";
  remove.setAttribute("aria-hidden", "true");
  remove.textContent = "x";

  button.append(label, remove);
  return button;
}

function readTags(list) {
  return Array.from(list.querySelectorAll("[data-tag-value]")).map((node) => node.dataset.tagValue);
}

function syncHiddenField(editor) {
  const hidden = editor.querySelector("[data-tag-hidden]");
  const list = editor.querySelector("[data-tag-list]");

  if (!hidden || !list) {
    return;
  }

  hidden.value = readTags(list).join(",");
}

function addTag(editor) {
  const input = editor.querySelector("[data-tag-input]");
  const list = editor.querySelector("[data-tag-list]");

  if (!input || !list) {
    return;
  }

  const tag = normalizeTag(input.value);
  const tags = readTags(list);

  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) {
    input.value = "";
    return;
  }

  list.append(buildTagButton(tag));
  input.value = "";
  syncHiddenField(editor);
}

document.querySelectorAll("[data-tag-editor]").forEach((editor) => {
  const input = editor.querySelector("[data-tag-input]");
  const addButton = editor.querySelector("[data-tag-add]");
  const list = editor.querySelector("[data-tag-list]");

  syncHiddenField(editor);

  addButton?.addEventListener("click", () => addTag(editor));

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    addTag(editor);
  });

  list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag-value]");

    if (!button) {
      return;
    }

    button.remove();
    syncHiddenField(editor);
  });
});
