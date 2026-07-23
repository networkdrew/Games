import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { buttonPrimary, iconButton, textField } from "@/components/react/styles";
import Icon from "@/components/react/Icon";

const MAX_LENGTH = 500;
const MAX_TEXTAREA_HEIGHT = 160;

interface ActionInputProps {
  /** True while the composer itself should refuse input (pending turn, or the opening hasn't arrived yet). */
  disabled: boolean;
  /** True while a generation is in flight — swaps the submit control for a Stop affordance. */
  pending: boolean;
  onSubmit: (action: string) => void;
  /** Aborts the in-flight generation — only rendered while `pending`. */
  onCancel: () => void;
}

/** Free-form composer: no suggestion buttons, no example prompts — the placeholder is the only guidance. */
export default function ActionInput({
  disabled,
  pending,
  onSubmit,
  onCancel,
}: ActionInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  function submit() {
    const trimmed = value.trim();
    if (disabled || pending || trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2"
    >
      <label htmlFor="action-input" className="sr-only">
        What do you do?
      </label>
      <textarea
        ref={textareaRef}
        id="action-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="What do you do?"
        rows={1}
        maxLength={MAX_LENGTH}
        className={`${textField} max-h-40 resize-none py-2.5`}
        autoComplete="off"
      />
      {pending ? (
        <button
          type="button"
          onClick={onCancel}
          className={iconButton}
          aria-label="Stop generating"
          title="Stop"
        >
          <Icon name="circle-x" className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className={buttonPrimary}
        >
          <Icon name="message-circle" className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      )}
    </form>
  );
}
