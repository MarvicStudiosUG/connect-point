/* ========== Terminal Header ========== */
.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}

.terminal-title {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--accent-light);
}

/* ========== Terminal Clear Confirm ========== */
.terminal-clear-confirm {
  margin: 12px 0;
  padding: 12px;
  background: var(--surface);
  border-radius: 12px;
  text-align: center;
}

/* ========== Suggestions ========== */
.terminal-suggestions {
  position: absolute;
  bottom: 70px;
  left: 50px;
  right: 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  z-index: 50;
  max-height: 150px;
  overflow-y: auto;
}

.suggestion-item {
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.suggestion-item.selected {
  background: var(--surface-hover);
  color: var(--accent-light);
}

/* ========== Better Prompt ========== */
.terminal-prompt {
  color: var(--accent);
  font-weight: 600;
  margin-right: 8px;
  user-select: none;
  white-space: nowrap;
}

/* Ensure spinner fits inline */
.terminal-input-area .spinner {
  flex-shrink: 0;
                   }
