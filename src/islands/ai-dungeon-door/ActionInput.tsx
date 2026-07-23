import { useState, type SyntheticEvent } from "react";
import {
  buttonPrimary,
  buttonGhost,
  textField,
} from "@/components/react/styles";

interface ActionInputProps {
  suggestedActions: string[];
  disabled: boolean;
  onSubmit: (action: string) => void;
}

export default function ActionInput({
  suggestedActions,
  disabled,
  onSubmit,
}: ActionInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (disabled || trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleSuggestion(action: string) {
    if (disabled) return;
    onSubmit(action);
    setValue("");
  }

  return (
    <div className="flex flex-col gap-2">
      {suggestedActions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested actions">
          {suggestedActions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={disabled}
              onClick={() => handleSuggestion(action)}
              className={buttonGhost + " border-border-strong border"}
            >
              {action}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="action-input" className="sr-only">
          What do you do?
        </label>
        <input
          id="action-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder="What do you do? (e.g. listen at the door)"
          className={textField}
          autoComplete="off"
          maxLength={200}
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className={buttonPrimary}
        >
          Act
        </button>
      </form>
    </div>
  );
}
