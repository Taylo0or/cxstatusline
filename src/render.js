import { THEMES } from "./constants.js";
import { renderWidget, SPACER } from "./widgets.js";
import { truncateEnd, truncateMiddle, visibleLength } from "./util.js";

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
    const rawWidget = typeof widget === "string" ? { type: widget } : widget;
    const text = renderWidget(widget, context);
    if (!text && config.hideEmpty !== false) return null;
    const segmentTheme = theme.segments[index % theme.segments.length];
    return {
      text,
      ...segmentTheme,
      fg: rawWidget.fg || rawWidget.color || segmentTheme.fg,
      bg: rawWidget.bg || rawWidget.background || segmentTheme.bg,
      pad: rawWidget.pad,
      spacer: text === SPACER
    };
  }).filter(Boolean);

  if (options.format === "json") {
    return JSON.stringify({ segments: rendered, theme: theme.name });
  }

  const mode = options.mode || config.mode || "powerline";
  const color = options.color !== false && options.format !== "plain";
  const raw = mode === "plain" || options.format === "plain";
  const width = Number(options.width || process.env.CXSTATUSLINE_WIDTH || process.env.CCSTATUSLINE_WIDTH || process.env.COLUMNS || 0);
  let output = raw
    ? renderPlain(rendered, config.separator || " | ", width)
    : renderPowerline(rendered, theme, color, width, config);

  if (width > 0 && visibleLength(output) > width) {
    output = truncateMiddle(output, width);
  }
  return output;
}

function renderPlain(segments, separator, width) {
  const spacerIndex = segments.findIndex((segment) => segment.spacer);
  if (spacerIndex === -1 || width <= 0) {
    return segments.filter((segment) => !segment.spacer).map((segment) => segment.text).filter(Boolean).join(separator);
  }

  const left = segments.slice(0, spacerIndex).filter((segment) => !segment.spacer).map((segment) => segment.text).filter(Boolean).join(separator);
  const right = segments.slice(spacerIndex + 1).filter((segment) => !segment.spacer).map((segment) => segment.text).filter(Boolean).join(separator);
  const gap = Math.max(1, width - visibleLength(left) - visibleLength(right));
  const output = `${left}${" ".repeat(gap)}${right}`;
  return visibleLength(output) > width ? truncateEnd(output, width) : output;
}

function renderPowerline(segments, theme, color, width, config = {}) {
  if (!segments.length) return "";
  const arrow = firstCap(config.powerline?.separator, config.powerlineSeparator, "\uE0B0");
  const startCap = caps(config.powerline?.startCaps, config.powerline?.startCap, config.powerlineStartCaps, config.powerlineStartCap).join("");
  const endCap = caps(config.powerline?.endCaps, config.powerline?.endCap, config.powerlineEndCaps, config.powerlineEndCap, arrow).join("");
  const fallbackSeparator = " ";
  const parts = [];
  const visibleSegments = segments.filter((segment) => !segment.spacer);

  for (let index = 0; index < visibleSegments.length; index += 1) {
    const current = visibleSegments[index];
    const next = visibleSegments[index + 1];
    if (!color) {
      if (index === 0 && startCap) parts.push(startCap);
      parts.push(` ${current.text} `);
      if (next) parts.push(fallbackSeparator);
      else if (endCap) parts.push(endCap);
      continue;
    }

    if (index === 0 && startCap) parts.push(fg(current.bg), startCap, reset());
    parts.push(bg(current.bg), fg(current.fg), ` ${current.text} `);
    if (next) {
      parts.push(bg(next.bg), fg(current.bg), arrow);
    } else {
      parts.push(reset(), fg(current.bg), endCap, reset());
    }
  }
  const output = parts.join("");
  if (segments.some((segment) => segment.spacer) && width > 0) {
    const padding = Math.max(0, width - visibleLength(output));
    return `${output}${" ".repeat(padding)}`;
  }
  return output;
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

function firstCap(...values) {
  for (const value of values) {
    const [cap] = caps(value);
    if (cap) return cap;
  }
  return "";
}

function caps(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value.map(formatCap).filter(Boolean);
    if (typeof value === "string" && value) return [formatCap(value)].filter(Boolean);
  }
  return [];
}

function formatCap(value) {
  const text = String(value || "");
  const match = text.match(/^(?:U\+|0x)([0-9a-f]{1,6})$/i);
  if (!match) return text;
  const codePoint = Number.parseInt(match[1], 16);
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
}
