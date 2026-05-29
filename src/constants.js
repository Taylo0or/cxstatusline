export const PRODUCT_NAME = "cxstatusline";

export const CODEX_NATIVE_ITEMS = [
  ["app-name", "Codex app name"],
  ["project", "Project name, falling back to current directory"],
  ["project-name", "Project name, falling back to current directory"],
  ["current-dir", "Current working directory"],
  ["activity", "Spinner while working and action-required text while blocked"],
  ["run-state", "Compact run state such as Ready, Working, or Thinking"],
  ["thread", "Current thread identifier"],
  ["thread-title", "Current thread title, or thread id when unnamed"],
  ["git-branch", "Current Git branch when available"],
  ["context-remaining", "Percentage of context window remaining"],
  ["context-used", "Percentage of context window used"],
  ["five-hour-limit", "Remaining usage on the primary usage limit"],
  ["weekly-limit", "Remaining usage on the secondary usage limit"],
  ["codex-version", "Codex application version"],
  ["used-tokens", "Total tokens used in session"],
  ["total-input-tokens", "Total input tokens used in session"],
  ["total-output-tokens", "Total output tokens used in session"],
  ["model", "Current model name"],
  ["model-with-reasoning", "Current model name with reasoning level"],
  ["fast-mode", "Whether Fast mode is active"],
  ["task-progress", "Latest task progress from update_plan"]
].map(([id, description]) => ({ id, description }));

export const DEFAULT_NATIVE_STATUS_LINE = [
  "model-with-reasoning",
  "context-used",
  "used-tokens",
  "project-name",
  "git-branch",
  "run-state"
];

export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "SubagentStart",
  "SubagentStop",
  "Stop"
];

export const DEFAULT_CONFIG = {
  theme: "powerline",
  mode: "powerline",
  minimal: false,
  hideEmpty: true,
  separator: " | ",
  widgets: [
    { type: "model", label: "Model" },
    { type: "reasoning", label: "Think" },
    { type: "project", label: "Project" },
    { type: "gitBranch", label: "Git" },
    { type: "gitStatus", label: "" },
    { type: "contextBar", label: "Ctx", width: 12 },
    { type: "tokens", label: "Tokens" },
    { type: "duration", label: "Time" },
    { type: "runState", label: "" }
  ],
  nativeCodex: {
    status_line_use_colors: true,
    status_line: DEFAULT_NATIVE_STATUS_LINE
  }
};

export const THEMES = {
  powerline: {
    name: "powerline",
    fg: "#f8fafc",
    bg: "#334155",
    muted: "#94a3b8",
    segments: [
      { fg: "#0f172a", bg: "#38bdf8" },
      { fg: "#052e16", bg: "#4ade80" },
      { fg: "#451a03", bg: "#fbbf24" },
      { fg: "#f8fafc", bg: "#8b5cf6" },
      { fg: "#f8fafc", bg: "#ef4444" },
      { fg: "#f8fafc", bg: "#0f766e" }
    ]
  },
  classic: {
    name: "classic",
    fg: "#e5e7eb",
    bg: "#374151",
    muted: "#9ca3af",
    segments: [
      { fg: "#ffffff", bg: "#2563eb" },
      { fg: "#ffffff", bg: "#16a34a" },
      { fg: "#111827", bg: "#f59e0b" },
      { fg: "#ffffff", bg: "#7c3aed" }
    ]
  },
  mono: {
    name: "mono",
    fg: "#e5e7eb",
    bg: "#111827",
    muted: "#9ca3af",
    segments: [
      { fg: "#e5e7eb", bg: "#111827" },
      { fg: "#e5e7eb", bg: "#1f2937" },
      { fg: "#e5e7eb", bg: "#374151" }
    ]
  },
  solarized: {
    name: "solarized",
    fg: "#eee8d5",
    bg: "#073642",
    muted: "#93a1a1",
    segments: [
      { fg: "#002b36", bg: "#2aa198" },
      { fg: "#002b36", bg: "#b58900" },
      { fg: "#fdf6e3", bg: "#268bd2" },
      { fg: "#fdf6e3", bg: "#6c71c4" }
    ]
  },
  dracula: {
    name: "dracula",
    fg: "#f8f8f2",
    bg: "#282a36",
    muted: "#6272a4",
    segments: [
      { fg: "#282a36", bg: "#8be9fd" },
      { fg: "#282a36", bg: "#50fa7b" },
      { fg: "#282a36", bg: "#f1fa8c" },
      { fg: "#f8f8f2", bg: "#bd93f9" },
      { fg: "#f8f8f2", bg: "#ff5555" }
    ]
  }
};
