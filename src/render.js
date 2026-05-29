import { THEMES } from "./constants.js";
import { renderWidget, resolveWidgetType, SPACER } from "./widgets.js";
import { truncateEnd, truncateMiddle, visibleLength } from "./util.js";

export function renderStatusLine(context, options = {}) {
  const config = context.config;
  if (Array.isArray(config.lines) && config.lines.length > 0) {
    return renderLines(context, options);
  }

  return renderLine(context, config, options);
}

function renderLines(context, options = {}) {
  const config = context.config;
  const lineConfigs = config.lines.map((line) => ({
    ...config,
    ...(Array.isArray(line) ? { widgets: line } : line),
    lines: undefined
  }));
  const raw = isPlainMode(config, options);
  const autoAlign = !raw && Boolean(config.powerline?.autoAlign);
  const continueTheme = !raw && Boolean(config.powerline?.continueThemeAcrossLines);
  let themeOffset = 0;

  const prepared = lineConfigs.map((lineConfig) => {
    const theme = THEMES[options.theme || lineConfig.theme] || THEMES.powerline;
    const segments = buildSegments(context, lineConfig, theme, continueTheme ? themeOffset : 0);
    if (continueTheme) themeOffset += countThemeSegments(segments);
    return { lineConfig, theme, segments };
  });
  const alignWidths = autoAlign ? powerlineAlignWidths(prepared.map((line) => line.segments)) : null;

  return prepared.map(({ lineConfig, theme, segments }) => {
    return renderPreparedLine(segments, theme, lineConfig, options, alignWidths, context);
  }).join("\n");
}

function renderLine(context, config, options = {}) {
  const theme = THEMES[options.theme || config.theme] || THEMES.powerline;
  const rendered = buildSegments(context, config, theme);
  return renderPreparedLine(rendered, theme, config, options, null, context);
}

function buildSegments(context, config, theme, themeOffset = 0) {
  const widgets = Array.isArray(config.widgets) ? config.widgets : [];
  return assignAlignColumns(collapseSeparators(widgets.map((widget, index) => {
    const rawWidget = typeof widget === "string" ? { type: widget } : widget;
    const resolvedType = resolveWidgetType(rawWidget.type);
    const text = renderWidget(widget, context);
    if (!text && config.hideEmpty !== false) return null;
    const segmentTheme = theme.segments[(themeOffset + index) % theme.segments.length];
    return {
      text,
      ...segmentTheme,
      fg: rawWidget.fg || rawWidget.color || segmentTheme.fg,
      bg: rawWidget.bg || rawWidget.background || segmentTheme.bg,
      plainBg: rawWidget.bg || rawWidget.background || rawWidget.backgroundColor || "",
      bold: Boolean(rawWidget.bold),
      merge: rawWidget.merge,
      pad: rawWidget.pad,
      spacer: text === SPACER,
      separator: resolvedType === "separator",
      preserveColors: Boolean(rawWidget.preserveColors)
    };
  }).filter(Boolean)));
}

function renderPreparedLine(rendered, theme, config, options = {}, alignWidths = null, context = {}) {
  if (options.format === "json") {
    return JSON.stringify({ segments: rendered, theme: theme.name });
  }

  const mode = options.mode || config.mode || "powerline";
  const color = options.color !== false && options.format !== "plain";
  const raw = isPlainMode(config, options);
  const width = resolveRenderWidth(config, options, context);
  let output = raw
    ? renderPlain(rendered, config, width, color)
    : renderPowerline(rendered, theme, color, width, config, alignWidths);

  if (width > 0 && visibleLength(output) > width) {
    output = truncateMiddle(output, width);
  }
  return output;
}

function resolveRenderWidth(config, options = {}, context = {}) {
  const explicit = positiveInteger(options.width)
    || positiveInteger(process.env.CXSTATUSLINE_WIDTH)
    || positiveInteger(process.env.CCSTATUSLINE_WIDTH);
  if (explicit) return explicit;

  const columns = positiveInteger(process.env.COLUMNS);
  if (!columns) return 0;

  const flexMode = config.flexMode || config.terminalWidthMode || "full";
  if (flexMode === "full-minus-40") return Math.max(1, columns - 40);
  if (flexMode === "full-until-compact") {
    const threshold = positiveInteger(config.compactThreshold) || 60;
    return contextUsagePercent(context) >= threshold ? Math.max(1, columns - 40) : columns;
  }
  return columns;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function contextUsagePercent(context = {}) {
  const usage = context.state?.usage || {};
  for (const value of [usage.contextPercent, usage.contextPercentage, usage.contextUsedPercentage, usage.usedPercentage]) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number <= 1 ? number * 100 : number;
  }
  const used = Number(usage.contextUsed || 0);
  const window = Number(usage.contextWindow || 0);
  if (used > 0 && window > 0) return (used / window) * 100;
  const remaining = Number(usage.contextRemaining || 0);
  if (used > 0 && remaining > 0) return (used / (used + remaining)) * 100;
  return 0;
}

function isPlainMode(config, options = {}) {
  const mode = options.mode || config.mode || "powerline";
  return mode === "plain" || options.format === "plain";
}

function renderPlain(segments, config, width, color) {
  const spacerIndex = segments.findIndex((segment) => segment.spacer);
  if (spacerIndex === -1 || width <= 0) {
    return renderPlainSegments(segments, config, color);
  }

  const left = renderPlainSegments(segments.slice(0, spacerIndex), config, color);
  const right = renderPlainSegments(segments.slice(spacerIndex + 1), config, color);
  const gap = Math.max(1, width - visibleLength(left) - visibleLength(right));
  const output = `${left}${" ".repeat(gap)}${right}`;
  return visibleLength(output) > width ? truncateEnd(output, width) : output;
}

function renderPlainSegments(segments, config, color) {
  const separator = plainSeparator(config);
  const parts = [];
  for (const segment of segments.filter((item) => !item.spacer && item.text)) {
    const previous = parts.at(-1);
    if (separator && parts.length > 0 && !segment.separator && !previous?.separator && !previous?.merge) {
      parts.push({
        text: separator,
        separator: true,
        fg: config.inheritSeparatorColors ? previous?.fg : "",
        plainBg: config.inheritSeparatorColors ? previous?.plainBg : "",
        bold: config.inheritSeparatorColors ? previous?.bold : false
      });
    }
    parts.push(segment);
  }
  return parts.map((segment, index) => renderPlainPart(segment, config, color, parts[index - 1], parts[index + 1])).join("");
}

function plainSeparator(config) {
  if (Object.prototype.hasOwnProperty.call(config, "defaultSeparator")) return config.defaultSeparator || "";
  return config.separator || " | ";
}

function renderPlainPart(segment, config, color, previous, next) {
  let text = segment.text;
  if (!segment.separator) {
    const padding = config.defaultPadding || "";
    const leading = previous?.merge === "no-padding" ? "" : padding;
    const trailing = segment.merge === "no-padding" && next ? "" : padding;
    text = `${leading}${text}${trailing}`;
  }
  if (!color) return text;
  return stylePlainText(text, segment, config);
}

function stylePlainText(text, segment, config) {
  if (segment.preserveColors && !hasGlobalStyle(config)) return text;
  const foreground = config.overrideForegroundColor || segment.fg;
  const background = config.overrideBackgroundColor || segment.plainBg;
  const boldText = Boolean(config.globalBold || segment.bold);
  const codes = [];
  if (boldText) codes.push("\x1b[1m");
  if (background) codes.push(bg(background));
  if (foreground) codes.push(fg(foreground));
  return codes.length ? `${codes.join("")}${text}${reset()}` : text;
}

function hasGlobalStyle(config) {
  return Boolean(config.overrideForegroundColor || config.overrideBackgroundColor || config.globalBold);
}

function renderPowerline(segments, theme, color, width, config = {}, alignWidths = null) {
  if (!segments.length) return "";
  const separators = powerlineSeparators(config);
  const invertSeparators = powerlineInvertFlags(config);
  const defaultEndCap = itemAtOrLast(separators, separators.length - 1, "\uE0B0");
  const startCap = caps(config.powerline?.startCaps, config.powerline?.startCap, config.powerlineStartCaps, config.powerlineStartCap).join("");
  const endCap = caps(config.powerline?.endCaps, config.powerline?.endCap, config.powerlineEndCaps, config.powerlineEndCap, defaultEndCap).join("");
  const fallbackSeparator = " ";
  const parts = [];
  const visibleSegments = segments.filter((segment) => !segment.spacer);

  for (let index = 0; index < visibleSegments.length; index += 1) {
    const current = visibleSegments[index];
    const next = visibleSegments[index + 1];
    const text = alignPowerlineText(current, alignWidths);
    if (!color) {
      if (index === 0 && startCap) parts.push(startCap);
      parts.push(` ${text} `);
      if (next) parts.push(fallbackSeparator);
      else if (endCap) parts.push(endCap);
      continue;
    }

    if (index === 0 && startCap) parts.push(fg(current.bg), startCap, reset());
    if (current.preserveColors) {
      parts.push(reset(), ` ${text} `);
    } else {
      parts.push(bg(current.bg), fg(current.fg), ` ${text} `);
    }
    if (next) {
      const separator = itemAtOrLast(separators, index, "\uE0B0");
      const inverted = itemAtOrLast(invertSeparators, index, false);
      const separatorBg = inverted ? current.bg : next.bg;
      const separatorFg = inverted ? next.bg : current.bg;
      parts.push(bg(separatorBg), fg(separatorFg), separator);
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

function collapseSeparators(segments) {
  const output = [];
  for (const segment of segments) {
    if (segment.separator && (output.length === 0 || output.at(-1)?.separator)) continue;
    output.push(segment);
  }
  while (output.at(-1)?.separator) output.pop();
  return output;
}

function powerlineAlignWidths(lines) {
  const widths = [];
  for (const segments of lines) {
    let column = 0;
    for (const segment of segments) {
      if (segment.spacer || segment.separator) continue;
      widths[column] = Math.max(widths[column] || 0, visibleLength(segment.text));
      column += 1;
    }
  }
  return widths;
}

function assignAlignColumns(segments) {
  let column = 0;
  return segments.map((segment) => {
    if (segment.spacer || segment.separator) return segment;
    const output = { ...segment, alignColumn: column };
    column += 1;
    return output;
  });
}

function alignPowerlineText(segment, widths) {
  if (!widths || segment.spacer || segment.separator) return segment.text;
  const width = widths[segment.alignColumn ?? 0];
  if (!width) return segment.text;
  const padding = Math.max(0, width - visibleLength(segment.text));
  return `${segment.text}${" ".repeat(padding)}`;
}

function countThemeSegments(segments) {
  return segments.filter((segment) => !segment.spacer && !segment.separator).length;
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
  const clean = normalizeColorValue(hex).replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => `${char}${char}`).join("")
    : clean.padEnd(6, "f").slice(0, 6);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function normalizeColorValue(value) {
  const text = String(value || "#ffffff").trim().replace(/^bg:/i, "").replace(/^hex:/i, "");
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return text;
  if (/^[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return `#${text}`;
  return NAMED_COLORS[text.toLowerCase()] || "#ffffff";
}

function powerlineSeparators(config = {}) {
  const configured = capList(config.powerline?.separators, config.powerlineSeparators);
  if (configured.length > 0) return configured;
  return caps(config.powerline?.separator, config.powerlineSeparator, "\uE0B0");
}

function powerlineInvertFlags(config = {}) {
  const configured = Array.isArray(config.powerline?.separatorInvertBackground)
    ? config.powerline.separatorInvertBackground
    : Array.isArray(config.powerlineSeparatorInvertBackground)
      ? config.powerlineSeparatorInvertBackground
      : [];
  return configured.map(Boolean);
}

function itemAtOrLast(items, index, fallback) {
  if (!items.length) return fallback;
  return items[Math.min(index, items.length - 1)] ?? fallback;
}

function capList(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value.map(formatCap).filter(Boolean);
    if (typeof value === "string" && value) return [formatCap(value)].filter(Boolean);
  }
  return [];
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

const NAMED_COLORS = {
  black: "#000000",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#c026d3",
  cyan: "#0891b2",
  white: "#f8fafc",
  gray: "#64748b",
  grey: "#64748b",
  brightblack: "#475569",
  brightred: "#ef4444",
  brightgreen: "#22c55e",
  brightyellow: "#eab308",
  brightblue: "#3b82f6",
  brightmagenta: "#d946ef",
  brightcyan: "#06b6d4",
  brightwhite: "#ffffff"
};
