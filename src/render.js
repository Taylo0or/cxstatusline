import { THEMES } from "./constants.js";
import { renderWidget } from "./widgets.js";
import { truncateMiddle, visibleLength } from "./util.js";

export function renderStatusLine(context, options = {}) {
  const config = context.config;
  if (Array.isArray(config.lines) && config.lines.length > 0) {
    return config.lines.map((line) => {
      const lineConfig = {
        ...config,
        ...(Array.isArray(line) ? { widgets: line } : line),
        lines: undefined
      };
      return renderStatusLine({ ...context, config: lineConfig }, options);
    }).join("\n");
  }

  const theme = THEMES[options.theme || config.theme] || THEMES.powerline;
  const widgets = Array.isArray(config.widgets) ? config.widgets : [];
  const rendered = widgets.map((widget, index) => {
    const text = renderWidget(widget, context);
    if (!text && config.hideEmpty !== false) return null;
    const segmentTheme = theme.segments[index % theme.segments.length];
    return { text, ...segmentTheme };
  }).filter(Boolean);

  if (options.format === "json") {
    return JSON.stringify({ segments: rendered, theme: theme.name });
  }

  const mode = options.mode || config.mode || "powerline";
  const color = options.color !== false && options.format !== "plain";
  const raw = mode === "plain" || options.format === "plain";
  let output = raw
    ? renderPlain(rendered, config.separator || " | ")
    : renderPowerline(rendered, theme, color);

  const width = Number(options.width || process.env.CXSTATUSLINE_WIDTH || process.env.COLUMNS || 0);
  if (width > 0 && visibleLength(output) > width) {
    output = truncateMiddle(output, width);
  }
  return output;
}

function renderPlain(segments, separator) {
  return segments.map((segment) => segment.text).filter(Boolean).join(separator);
}

function renderPowerline(segments, theme, color) {
  if (!segments.length) return "";
  const arrow = "\uE0B0";
  const fallbackSeparator = " ";
  const parts = [];

  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (!color) {
      parts.push(` ${current.text} `);
      if (next) parts.push(fallbackSeparator);
      continue;
    }

    parts.push(bg(current.bg), fg(current.fg), ` ${current.text} `);
    if (next) {
      parts.push(bg(next.bg), fg(current.bg), arrow);
    } else {
      parts.push(reset(), fg(current.bg), arrow, reset());
    }
  }
  return parts.join("");
}

function fg(hex) {
  const [r, g, b] = rgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(hex) {
  const [r, g, b] = rgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function reset() {
  return "\x1b[0m";
}

function rgb(hex) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => `${char}${char}`).join("")
    : clean.padEnd(6, "f").slice(0, 6);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}
