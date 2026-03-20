const DISPLAY_DECIMALS = 9;
const DEFAULT_FORMAT_DIGITS = 4;
const LONG_PRESS_MS = 650;
const PROMPT_MS = 900;
const RADIX_BASES = { BIN: 2, OCT: 8, DEC: 10, HEX: 16 };
const RADIX_BITS = 48;
const RADIX_MASK = (1n << BigInt(RADIX_BITS)) - 1n;
const RADIX_SIGN = 1n << BigInt(RADIX_BITS - 1);
const REALCALC_REFERENCE = window.REALCALC_REFERENCE ?? { conversions: [], constants: [] };

function parseReferenceNumber(expression) {
  const cleaned = `${expression ?? ""}`.replace(/[,\s]/g, "");
  if (!cleaned) {
    return 0;
  }
  const tokens = cleaned.split(/([*/])/).filter(Boolean);
  let result = Number(tokens[0]);
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const nextValue = Number(tokens[index + 1]);
    result = operator === "*" ? result * nextValue : result / nextValue;
  }
  return result;
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatAnnotatedText(value) {
  return escapeHtml(value)
    .replace(/\^([^^]+)\^/g, "<sup>$1</sup>")
    .replace(/~([^~]+)~/g, "<sub>$1</sub>");
}

const CONSTANT_GROUPS = REALCALC_REFERENCE.constants.map((group, groupIndex) => ({
  id: `constant-group-${groupIndex}`,
  name: group.name,
  items: group.items.map((item, itemIndex) => ({
    id: `constant-${groupIndex}-${itemIndex}`,
    symbol: item.symbol,
    name: item.name,
    value: parseReferenceNumber(item.value),
    valueText: item.value,
    units: item.units,
  })),
}));

const CONVERSION_GROUPS = REALCALC_REFERENCE.conversions.map((group, groupIndex) => ({
  id: `conversion-group-${groupIndex}`,
  name: group.name,
  note: group.help?.text ?? "",
  noteLabel: group.help?.label ?? "",
  items: group.items.map((item, itemIndex) => ({
    id: `conversion-${groupIndex}-${itemIndex}`,
    name: item.name,
    symbol: item.symbol,
    ratio: parseReferenceNumber(item.ratio),
    offset: parseReferenceNumber(item.offset ?? "0"),
    inverse: item.inverse === "true",
  })),
}));

const state = {
  stack: [0],
  entry: "0",
  isEditing: false,
  error: "",
  lastX: 0,
  lastAnswer: 0,
  liftOnNewEntry: false,
  shiftActive: false,
  angleMode: "DEG",
  hypMode: "OFF",
  radixMode: "DEC",
  formatMode: "NORMAL",
  formatDigits: DEFAULT_FORMAT_DIGITS,
  memory: 0,
  memories: Array(10).fill(0),
  history: [],
  dialog: null,
};

const registerElements = {
  x: {
    container: document.querySelector('[data-register="x"]'),
    main: document.querySelector("[data-register-x-main]"),
    suffix: document.querySelector("[data-register-x-suffix]"),
    exponent: document.querySelector("[data-register-x-exponent]"),
  },
  y: {
    container: document.querySelector('[data-register="y"]'),
    main: document.querySelector("[data-register-y-main]"),
    suffix: document.querySelector("[data-register-y-suffix]"),
    exponent: document.querySelector("[data-register-y-exponent]"),
  },
  z: {
    container: document.querySelector('[data-register="z"]'),
    main: document.querySelector("[data-register-z-main]"),
    suffix: document.querySelector("[data-register-z-suffix]"),
    exponent: document.querySelector("[data-register-z-exponent]"),
  },
  t: {
    container: document.querySelector('[data-register="t"]'),
    main: document.querySelector("[data-register-t-main]"),
    suffix: document.querySelector("[data-register-t-suffix]"),
    exponent: document.querySelector("[data-register-t-exponent]"),
  },
};

const angleModeElement = document.querySelector("[data-angle-mode]");
const hypModeElement = document.querySelector("[data-hyp-mode]");
const radixModeElement = document.querySelector("[data-radix-mode]");
const formatModeElement = document.querySelector("[data-format-mode]");
const stackCountElement = document.querySelector("[data-stack-count]");
const keypadElement = document.querySelector(".keypad");
const calculatorElement = document.querySelector(".calculator");
const shiftButtonElement = document.querySelector('[data-action="shift"]');
const dialogBackdropElement = document.querySelector("[data-dialog-backdrop]");
const dialogTitleElement = document.querySelector("[data-dialog-title]");
const dialogBodyElement = document.querySelector("[data-dialog-body]");

let longPressTimer = 0;
let longPressButton = null;
let promptTimer = 0;

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function parseRadixEntry(entry) {
  const negative = entry.startsWith("-");
  const digits = (negative ? entry.slice(1) : entry).toUpperCase() || "0";
  const parsed = Number.parseInt(digits, RADIX_BASES[state.radixMode]);
  return normalizeZero((negative ? -1 : 1) * (Number.isNaN(parsed) ? 0 : parsed));
}

function coerceRadixValue(value) {
  if (!Number.isFinite(value)) {
    return value;
  }
  return normalizeZero(Math.round(value));
}

function normalizeForMode(value) {
  if (!Number.isFinite(value)) {
    return value;
  }
  return state.radixMode === "DEC" ? normalizeZero(value) : coerceRadixValue(value);
}

function wrapToUnsigned48(value) {
  const rounded = BigInt(Math.trunc(value));
  return rounded & RADIX_MASK;
}

function integerToRadixString(value, radix = state.radixMode) {
  const base = RADIX_BASES[radix];
  const wrapped = wrapToUnsigned48(value);
  const text = wrapped.toString(base).toUpperCase();
  const padded = text.padStart(Math.min(12, Math.max(text.length, 1)), "0");
  return padded.replace(/(.{4})/g, "$1,").replace(/,$/, "");
}

function editableRadixString(value) {
  const integer = coerceRadixValue(value);
  if (integer < 0) {
    return `-${Math.abs(integer).toString(RADIX_BASES[state.radixMode]).toUpperCase()}`;
  }
  return integer.toString(RADIX_BASES[state.radixMode]).toUpperCase();
}

function getXValue() {
  if (state.error) {
    return state.stack[0] ?? 0;
  }
  if (!state.isEditing) {
    return state.stack[0] ?? 0;
  }
  return state.radixMode === "DEC" ? Number(state.entry) : parseRadixEntry(state.entry);
}

function clearError() {
  state.error = "";
  if (promptTimer) {
    window.clearTimeout(promptTimer);
    promptTimer = 0;
  }
}

function flashPrompt(message) {
  clearError();
  state.error = message;
  render();
  promptTimer = window.setTimeout(() => {
    if (state.error === message) {
      state.error = "";
      render();
    }
  }, PROMPT_MS);
}

function clearLiftOnNewEntry() {
  state.liftOnNewEntry = false;
}

function clearShift() {
  state.shiftActive = false;
}

function clearHypMode() {
  state.hypMode = "OFF";
}

function snapshotState() {
  return {
    stack: [...state.stack],
    entry: state.entry,
    isEditing: state.isEditing,
    error: state.error,
    lastX: state.lastX,
    lastAnswer: state.lastAnswer,
    liftOnNewEntry: state.liftOnNewEntry,
    angleMode: state.angleMode,
    hypMode: state.hypMode,
    radixMode: state.radixMode,
    formatMode: state.formatMode,
    formatDigits: state.formatDigits,
    memory: state.memory,
    memories: [...state.memories],
  };
}

function pushHistory() {
  state.history.push(snapshotState());
  if (state.history.length > 100) {
    state.history.shift();
  }
}

function restoreSnapshot(snapshot) {
  state.stack = [...snapshot.stack];
  state.entry = snapshot.entry;
  state.isEditing = snapshot.isEditing;
  state.error = snapshot.error;
  state.lastX = snapshot.lastX;
  state.lastAnswer = snapshot.lastAnswer;
  state.liftOnNewEntry = snapshot.liftOnNewEntry;
  state.angleMode = snapshot.angleMode;
  state.hypMode = snapshot.hypMode;
  state.radixMode = snapshot.radixMode;
  state.formatMode = snapshot.formatMode;
  state.formatDigits = snapshot.formatDigits;
  state.memory = snapshot.memory;
  state.memories = [...snapshot.memories];
  state.shiftActive = false;
  state.dialog = null;
}

function pushStack(value) {
  state.stack.unshift(normalizeForMode(value));
}

function formatEditableNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (state.radixMode !== "DEC") {
    return editableRadixString(value);
  }
  return normalizeZero(value).toString();
}

function formatScientificNumber(value) {
  return value.toExponential(state.formatDigits).replace("e+", "e");
}

function formatEngineeringNumber(value) {
  if (value === 0) {
    return Number(0).toFixed(state.formatDigits);
  }
  const exponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
  const mantissa = value / 10 ** exponent;
  return `${mantissa.toFixed(state.formatDigits)}e${exponent}`;
}

function formatDecimalDisplay(value) {
  if (!Number.isFinite(value)) {
    return "Error.";
  }

  const normalized = normalizeZero(value);
  switch (state.formatMode) {
    case "FIX":
      return normalized.toFixed(state.formatDigits);
    case "SCI":
      return formatScientificNumber(normalized);
    case "ENG":
      return formatEngineeringNumber(normalized);
    default:
      if (Number.isInteger(normalized)) {
        return `${normalized}.`;
      }
      return normalized.toFixed(DISPLAY_DECIMALS).replace(/0+$/, "").replace(/\.$/, "");
  }
}

function formatDisplayNumber(value) {
  if (state.radixMode !== "DEC") {
    return integerToRadixString(value);
  }
  return formatDecimalDisplay(value);
}

function shouldUseScientificDisplay(value) {
  if (state.radixMode !== "DEC" || !Number.isFinite(value) || value === 0) {
    return false;
  }
  const abs = Math.abs(value);
  return abs >= 1e10 || abs < 1e-9;
}

function scientificParts(value) {
  const [mantissaRaw, exponentRaw] = value.toExponential(DISPLAY_DECIMALS).split("e");
  const mantissa = mantissaRaw.replace(/\.?0+$/, "");
  const exponent = String(Number(exponentRaw));
  return { mantissa, exponent };
}

function scientificMarkup(value) {
  const { mantissa, exponent } = scientificParts(value);
  return scientificMarkupWithParts(mantissa, exponent);
}

function scientificMarkupWithParts(mantissa, exponent, options = {}) {
  const wrapperClass = options.entry ? "sci-display sci-display--entry" : "sci-display";
  return [
    `<span class="${wrapperClass}">`,
    `<span class="sci-display__mantissa exp-display__mantissa">${mantissa}</span>`,
    '<span class="sci-display__suffix exp-display__suffix">',
    `<span class="sci-display__exponent exp-display__exponent">${exponent}</span>`,
    '<span class="sci-display__multiplier exp-display__multiplier">x10</span>',
    "</span>",
    "</span>",
  ].join("");
}

function isExponentEntry() {
  return state.radixMode === "DEC" && state.isEditing && state.entry.includes("e");
}

function parseExponentEntry(entry) {
  const [mantissaPart, exponentPartRaw = "0"] = entry.split("e");
  const exponentNegative = exponentPartRaw.startsWith("-");
  const digitsRaw = exponentPartRaw.replace(/^[+-]/, "") || "0";
  return {
    mantissa: mantissaPart,
    exponentNegative,
    exponentDigits: digitsRaw.padStart(3, "0").slice(-3),
  };
}

function buildExponentEntry(mantissa, exponentNegative, exponentDigits) {
  return `${mantissa}e${exponentNegative ? "-" : ""}${exponentDigits}`;
}

function setError(message) {
  clearError();
  state.error = message;
  state.isEditing = false;
}

function syncEntryToStack() {
  if (state.error || !state.isEditing) {
    return;
  }
  state.stack[0] = normalizeForMode(getXValue());
}

function commitPendingEntry() {
  if (!state.isEditing || state.error) {
    return;
  }
  state.stack[0] = normalizeForMode(getXValue());
  state.isEditing = false;
}

function beginFreshEntry() {
  clearError();
  closeDialog();
  if (state.liftOnNewEntry) {
    pushStack(state.stack[0] ?? 0);
  }
  state.entry = "0";
  state.isEditing = true;
  state.stack[0] = 0;
  clearLiftOnNewEntry();
}

function appendDigit(digit) {
  clearError();
  if (!state.isEditing) {
    beginFreshEntry();
  }

  if (isExponentEntry()) {
    const { mantissa, exponentNegative, exponentDigits } = parseExponentEntry(state.entry);
    state.entry = buildExponentEntry(mantissa, exponentNegative, `${exponentDigits}${digit}`.slice(-3));
    syncEntryToStack();
    return;
  }

  if (state.radixMode !== "DEC" && Number(digit) >= RADIX_BASES[state.radixMode]) {
    flashPrompt("Digit?");
    return;
  }

  if (state.entry === "0") {
    state.entry = digit;
  } else if (state.entry === "-0") {
    state.entry = `-${digit}`;
  } else {
    state.entry += digit;
  }

  syncEntryToStack();
}

function appendDecimalPoint() {
  clearError();
  if (state.radixMode !== "DEC") {
    flashPrompt("Int");
    return;
  }
  if (!state.isEditing) {
    beginFreshEntry();
  }
  if (isExponentEntry()) {
    return;
  }
  if (!state.entry.includes(".")) {
    state.entry += ".";
  }
  syncEntryToStack();
}

function toggleSign() {
  clearError();
  clearLiftOnNewEntry();

  if (isExponentEntry()) {
    const { mantissa, exponentNegative, exponentDigits } = parseExponentEntry(state.entry);
    state.entry = buildExponentEntry(mantissa, !exponentNegative, exponentDigits);
    syncEntryToStack();
    return;
  }

  if (!state.isEditing) {
    state.entry = formatEditableNumber(getXValue());
    state.isEditing = true;
  }

  state.entry = state.entry.startsWith("-") ? state.entry.slice(1) : `-${state.entry}`;
  syncEntryToStack();
}

function ensureEditingValue() {
  if (!state.isEditing) {
    state.entry = formatEditableNumber(getXValue());
    state.isEditing = true;
  }
}

function backspaceEntry() {
  if (state.error) {
    clearAll();
    return;
  }

  clearLiftOnNewEntry();

  if (isExponentEntry()) {
    const { mantissa, exponentNegative, exponentDigits } = parseExponentEntry(state.entry);
    state.entry = buildExponentEntry(mantissa, exponentNegative, `00${exponentDigits.slice(0, -1)}`.slice(-3));
    syncEntryToStack();
    return;
  }

  ensureEditingValue();
  state.entry = state.entry.slice(0, -1);
  if (state.entry === "" || state.entry === "-" || state.entry === "-0") {
    state.entry = "0";
  }
  syncEntryToStack();
}

function clearEntry() {
  clearError();
  state.entry = "0";
  state.isEditing = true;
  state.stack[0] = 0;
  clearLiftOnNewEntry();
}

function liftStackForEntry() {
  commitPendingEntry();
  pushStack(state.stack[0] ?? 0);
  state.entry = formatEditableNumber(state.stack[0]);
  state.isEditing = false;
}

function enterValue() {
  clearError();
  clearLiftOnNewEntry();
  liftStackForEntry();
}

function clearAll() {
  state.stack = [0];
  state.entry = "0";
  state.isEditing = false;
  state.error = "";
  state.lastX = 0;
  state.lastAnswer = 0;
  state.liftOnNewEntry = false;
  state.shiftActive = false;
  state.hypMode = "OFF";
  state.radixMode = "DEC";
  state.formatMode = "NORMAL";
  state.formatDigits = DEFAULT_FORMAT_DIGITS;
  state.memory = 0;
  state.memories = Array(10).fill(0);
  state.history = [];
  state.dialog = null;
}

function setNumericResult(result) {
  const normalized = normalizeForMode(result);
  state.stack[0] = normalized;
  state.entry = formatEditableNumber(normalized);
  state.isEditing = false;
  state.lastAnswer = normalized;
  state.liftOnNewEntry = true;
}

function requireBinaryOperands() {
  clearError();
  commitPendingEntry();
  if (state.stack.length < 2) {
    flashPrompt("Y?");
    return null;
  }
  const x = state.stack[0] ?? 0;
  const y = state.stack[1] ?? 0;
  state.lastX = x;
  return { x, y };
}

function completeBinaryOperation(result, keepY = false) {
  if (keepY) {
    state.stack[0] = normalizeForMode(result);
    setNumericResult(result);
    return;
  }
  state.stack.splice(0, 2, normalizeForMode(result));
  setNumericResult(result);
}

function binaryOperation(operation, options = {}) {
  const operands = requireBinaryOperands();
  if (!operands) {
    return;
  }
  const result = operation(operands.y, operands.x);
  if (!Number.isFinite(result)) {
    setError("Error.");
    return;
  }
  completeBinaryOperation(result, options.keepY);
}

function unaryOperation(operation) {
  clearError();
  commitPendingEntry();
  const x = state.stack[0] ?? 0;
  state.lastX = x;
  const result = operation(x);
  if (!Number.isFinite(result)) {
    setError("Error.");
    return;
  }
  setNumericResult(result);
}

function requireDecimalMode() {
  if (state.radixMode === "DEC") {
    return true;
  }
  flashPrompt("DEC");
  return false;
}

function reciprocal() {
  const x = getXValue();
  if (x === 0) {
    commitPendingEntry();
    state.lastX = 0;
    clearLiftOnNewEntry();
    setError("Error.");
    return;
  }
  unaryOperation((value) => 1 / value);
}

function recallLastX() {
  clearError();
  commitPendingEntry();
  pushStack(state.stack[0] ?? 0);
  state.stack[0] = normalizeForMode(state.lastX);
  state.entry = formatEditableNumber(state.stack[0]);
  state.isEditing = false;
  clearLiftOnNewEntry();
}

function swapXY() {
  clearError();
  commitPendingEntry();
  if (state.stack.length < 2) {
    flashPrompt("Y?");
    return;
  }
  const x = state.stack[0] ?? 0;
  state.stack[0] = state.stack[1] ?? 0;
  state.stack[1] = x;
  state.isEditing = false;
  clearLiftOnNewEntry();
}

function dropX() {
  clearError();
  commitPendingEntry();
  const hadLiftableStack = state.stack.length > 1;
  if (state.stack.length > 1) {
    state.stack.shift();
  } else {
    state.stack[0] = 0;
  }
  state.entry = formatEditableNumber(state.stack[0] ?? 0);
  state.isEditing = false;
  state.liftOnNewEntry = hadLiftableStack;
}

function beginExponentEntry() {
  clearError();
  if (!requireDecimalMode()) {
    return;
  }
  clearLiftOnNewEntry();
  if (!state.isEditing) {
    const x = getXValue();
    state.entry = x === 0 ? "1e000" : `${formatEditableNumber(x)}e000`;
    state.isEditing = true;
    syncEntryToStack();
    return;
  }
  if (!state.entry.includes("e")) {
    state.entry = state.entry === "0" || state.entry === "-0" ? "1e000" : `${state.entry}e000`;
    syncEntryToStack();
  }
}

function setCurrentValue(value, keepEditing = false) {
  clearError();
  state.stack[0] = normalizeForMode(value);
  state.entry = formatEditableNumber(state.stack[0]);
  state.isEditing = keepEditing;
  state.lastAnswer = normalizeForMode(value);
  clearLiftOnNewEntry();
}

function degreesToRadians(value) {
  if (state.angleMode === "DEG") return (value * Math.PI) / 180;
  if (state.angleMode === "GRAD") return (value * Math.PI) / 200;
  return value;
}

function radiansToAngle(value) {
  if (state.angleMode === "DEG") return (value * 180) / Math.PI;
  if (state.angleMode === "GRAD") return (value * 200) / Math.PI;
  return value;
}

function factorialNumber(n) {
  if (!Number.isInteger(n) || n < 0) {
    return Number.NaN;
  }
  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
}

function memoryStore() {
  clearError();
  commitPendingEntry();
  state.memory = getXValue();
}

function memoryRecall() {
  clearError();
  setCurrentValue(state.memory, false);
}

function memoryAdd() {
  clearError();
  commitPendingEntry();
  state.memory = normalizeZero(state.memory + getXValue());
}

function memorySubtract() {
  clearError();
  commitPendingEntry();
  state.memory = normalizeZero(state.memory - getXValue());
}

function cycleAngleMode() {
  const nextMode = { DEG: "RAD", RAD: "GRAD", GRAD: "DEG" };
  state.angleMode = nextMode[state.angleMode];
}

function recallAnswer() {
  clearError();
  setCurrentValue(state.lastAnswer, false);
}

function toggleShift() {
  state.shiftActive = !state.shiftActive;
}

function undoLastAction() {
  const snapshot = state.history.pop();
  if (!snapshot) {
    return;
  }
  restoreSnapshot(snapshot);
}

function toggleHypMode(nextMode) {
  state.hypMode = state.hypMode === nextMode ? "OFF" : nextMode;
}

function runTrigAction(kind, inverse = false) {
  if (!requireDecimalMode()) {
    return;
  }

  const trigMap = {
    sin: { direct: Math.sin, inverse: Math.asin, hyper: Math.sinh, inverseHyper: Math.asinh },
    cos: { direct: Math.cos, inverse: Math.acos, hyper: Math.cosh, inverseHyper: Math.acosh },
    tan: { direct: Math.tan, inverse: Math.atan, hyper: Math.tanh, inverseHyper: Math.atanh },
  };

  const config = trigMap[kind];
  if (!config) {
    return;
  }

  const useHyper = state.hypMode === "HYP";
  const useInverseHyper = state.hypMode === "INV_HYP";
  clearHypMode();

  if (useInverseHyper) {
    unaryOperation((x) => config.inverseHyper(x));
    return;
  }
  if (useHyper) {
    unaryOperation((x) => config.hyper(x));
    return;
  }
  if (inverse) {
    unaryOperation((x) => radiansToAngle(config.inverse(x)));
    return;
  }
  unaryOperation((x) => config.direct(degreesToRadians(x)));
}

function cycleDisplayFormat() {
  const nextMode = { NORMAL: "FIX", FIX: "SCI", SCI: "ENG", ENG: "NORMAL" };
  state.formatMode = nextMode[state.formatMode];
}

function applyRadixToState(nextMode) {
  commitPendingEntry();
  state.radixMode = nextMode;
  state.stack = state.stack.map((value) => normalizeForMode(value));
  state.entry = formatEditableNumber(state.stack[0] ?? 0);
  state.isEditing = false;
  state.lastAnswer = normalizeForMode(state.lastAnswer);
  state.lastX = normalizeForMode(state.lastX);
  state.memory = normalizeForMode(state.memory);
  state.memories = state.memories.map((value) => normalizeForMode(value));
}

function selectConstant(groupIndex, itemIndex) {
  const group = CONSTANT_GROUPS[groupIndex];
  const constant = group?.items[itemIndex];
  if (!constant) {
    closeDialog();
    return;
  }
  setCurrentValue(constant.value, false);
  closeDialog();
}

function convertValue(input, sourceUnit, destinationUnit) {
  if (!Number.isFinite(input) || !sourceUnit || !destinationUnit) {
    return Number.NaN;
  }
  let sourceValue = input;
  if (sourceUnit.inverse) {
    if (sourceValue === 0) {
      return Number.NaN;
    }
    sourceValue = 1 / sourceValue;
  }
  let result = (sourceValue - sourceUnit.offset) * (sourceUnit.ratio / destinationUnit.ratio) + destinationUnit.offset;
  if (destinationUnit.inverse) {
    if (result === 0) {
      return Number.NaN;
    }
    result = 1 / result;
  }
  return result;
}

function selectConversion(groupIndex, fromIndex, toIndex) {
  const group = CONVERSION_GROUPS[groupIndex];
  const sourceUnit = group?.items[fromIndex];
  const destinationUnit = group?.items[toIndex];
  if (!sourceUnit || !destinationUnit) {
    closeDialog();
    return;
  }
  if (!requireDecimalMode()) {
    closeDialog();
    return;
  }
  commitPendingEntry();
  const result = convertValue(getXValue(), sourceUnit, destinationUnit);
  if (!Number.isFinite(result)) {
    setError("Error.");
  } else {
    setCurrentValue(result, false);
  }
  closeDialog();
}

function recallFromMemory(slot) {
  setCurrentValue(state.memories[slot] ?? 0, false);
  closeDialog();
}

function storeToMemory(slot) {
  commitPendingEntry();
  state.memories[slot] = getXValue();
  closeDialog();
}

function closeDialog() {
  state.dialog = null;
}

function openDialog(dialog) {
  state.dialog = dialog;
}

function openMenuDialog() {
  openDialog({
    type: "menu",
    title: "Menu",
    items: [
      { id: "about", label: "About", description: "Web recreation of RealCalc RPN behaviour" },
      { id: "reset", label: "Reset", description: "Clear stack, memories, modes and history" },
    ],
  });
}

function openStackDialog() {
  commitPendingEntry();
  openDialog({
    type: "stack",
    title: "Stack",
    rows: [
      { label: "T", value: state.stack[3] ?? 0, visible: state.stack[3] !== undefined },
      { label: "Z", value: state.stack[2] ?? 0, visible: state.stack[2] !== undefined },
      { label: "Y", value: state.stack[1] ?? 0, visible: state.stack[1] !== undefined },
      { label: "X", value: state.stack[0] ?? 0, visible: true },
    ],
  });
}

function openMemoryDialog(kind) {
  commitPendingEntry();
  openDialog({
    type: "memory",
    title: kind === "recall" ? "Recall Memory" : "Store Memory",
    kind,
    items: state.memories.map((value, index) => ({
      id: index,
      label: `M${index}`,
      description: formatDisplayNumber(value),
    })),
  });
}

function openConstantsDialog() {
  openDialog({
    type: "list",
    title: "Constants",
    items: CONSTANT_GROUPS.map((group, index) => ({
      action: "constant-group",
      id: String(index),
      label: escapeHtml(group.name),
      description: `${group.items.length} constants`,
    })),
  });
}

function openConversionDialog() {
  openDialog({
    type: "list",
    title: "Convert",
    items: CONVERSION_GROUPS.map((group, index) => ({
      action: "conversion-group",
      id: String(index),
      label: escapeHtml(group.name),
      description: `${group.items.length} units`,
    })),
  });
}

function openConstantGroupDialog(groupIndex) {
  const group = CONSTANT_GROUPS[groupIndex];
  if (!group) {
    closeDialog();
    return;
  }
  openDialog({
    type: "list",
    title: group.name,
    items: group.items.map((item, itemIndex) => ({
      action: "constant-item",
      id: `${groupIndex}:${itemIndex}`,
      label: `${formatAnnotatedText(item.symbol)}<span class="dialog__inline-name">${escapeHtml(item.name)}</span>`,
      description: `${escapeHtml(item.valueText)} ${formatAnnotatedText(item.units)}`.trim(),
    })),
  });
}

function openConversionFromDialog(groupIndex) {
  const group = CONVERSION_GROUPS[groupIndex];
  if (!group) {
    closeDialog();
    return;
  }
  openDialog({
    type: "list",
    title: "From Unit",
    text: group.note ? `${group.name}${group.noteLabel ? ` - ${group.noteLabel}: ${group.note}` : ` - ${group.note}`}` : group.name,
    items: group.items.map((item, itemIndex) => ({
      action: "conversion-from",
      id: `${groupIndex}:${itemIndex}`,
      label: `${formatAnnotatedText(item.symbol)}<span class="dialog__inline-name">${escapeHtml(item.name)}</span>`,
      description: "",
    })),
  });
}

function openConversionToDialog(groupIndex, fromIndex) {
  const group = CONVERSION_GROUPS[groupIndex];
  const sourceUnit = group?.items[fromIndex];
  if (!group || !sourceUnit) {
    closeDialog();
    return;
  }
  openDialog({
    type: "list",
    title: "To Unit",
    text: `${group.name}: ${sourceUnit.name}`,
    items: group.items.map((item, itemIndex) => ({
      action: "conversion-to",
      id: `${groupIndex}:${fromIndex}:${itemIndex}`,
      label: `${formatAnnotatedText(item.symbol)}<span class="dialog__inline-name">${escapeHtml(item.name)}</span>`,
      description: "",
    })),
  });
}

function renderDialog() {
  if (!state.dialog) {
    dialogBackdropElement.hidden = true;
    dialogBodyElement.innerHTML = "";
    return;
  }

  dialogBackdropElement.hidden = false;
  dialogTitleElement.textContent = state.dialog.title;

  if (state.dialog.type === "stack") {
    dialogBodyElement.innerHTML = [
      '<div class="dialog__stack">',
      ...state.dialog.rows
        .filter((row) => row.visible)
        .flatMap((row) => [
          `<span class="dialog__label">${row.label}</span>`,
          `<span class="dialog__value">${formatDisplayNumber(row.value)}</span>`,
        ]),
      "</div>",
    ].join("");
    return;
  }

  if (state.dialog.type === "menu") {
    dialogBodyElement.innerHTML = [
      '<div class="dialog__menu">',
      ...state.dialog.items.map(
        (item) =>
          `<button type="button" data-dialog-action="menu" data-dialog-id="${item.id}"><strong>${item.label}</strong><span>${item.description}</span></button>`,
      ),
      "</div>",
    ].join("");
    return;
  }

  if (state.dialog.type === "list" || state.dialog.type === "memory") {
    const buttonKind = state.dialog.type === "memory" ? "memory" : null;
    dialogBodyElement.innerHTML = [
      state.dialog.text ? `<p class="dialog__text">${escapeHtml(state.dialog.text)}</p>` : "",
      '<div class="dialog__grid">',
      ...state.dialog.items.map((item) => {
        const description = item.description || "";
        return `<button class="dialog__button${item.fullWidth ? " dialog__button--full" : ""}" type="button" data-dialog-action="${buttonKind ?? item.action}" data-dialog-id="${item.id}"><strong>${item.label}</strong>${description ? `<span>${description}</span>` : ""}</button>`;
      }),
      "</div>",
    ].join("");
    return;
  }

  dialogBodyElement.innerHTML = [
    '<div class="dialog__grid">',
    ...state.dialog.items.map((item) => {
      const description = item.description || "0.";
      return `<button class="dialog__button" type="button" data-dialog-action="${item.action}" data-dialog-id="${item.id}"><strong>${item.label}</strong><span>${description}</span></button>`;
    }),
    "</div>",
  ].join("");
}

function hideRegisterSuffix(register) {
  register.suffix.classList.remove("is-visible");
  register.exponent.textContent = "";
  register.suffix.hidden = true;
}

function showRegisterScientific(register, mantissa, exponent) {
  register.main.textContent = mantissa;
  register.exponent.textContent = exponent;
  register.suffix.hidden = false;
  register.suffix.classList.add("is-visible");
}

function renderXDisplay() {
  hideRegisterSuffix(registerElements.x);

  if (state.error) {
    registerElements.x.main.textContent = state.error;
    return;
  }

  if (isExponentEntry()) {
    const { mantissa, exponentNegative, exponentDigits } = parseExponentEntry(state.entry);
    showRegisterScientific(registerElements.x, mantissa, `${exponentNegative ? "-" : ""}${exponentDigits}`);
    return;
  }

  if (!state.isEditing && shouldUseScientificDisplay(getXValue())) {
    const { mantissa, exponent } = scientificParts(getXValue());
    showRegisterScientific(registerElements.x, mantissa, exponent);
    return;
  }

  registerElements.x.main.textContent = state.isEditing ? state.entry : formatDisplayNumber(getXValue());
}

function renderRegisterValue(register, value) {
  hideRegisterSuffix(register);

  if (value === "") {
    register.main.textContent = "";
    return;
  }

  if (shouldUseScientificDisplay(value)) {
    const { mantissa, exponent } = scientificParts(value);
    showRegisterScientific(register, mantissa, exponent);
    return;
  }

  register.main.textContent = formatDisplayNumber(value);
}

function render() {
  const values = [state.stack[3] ?? "", state.stack[2] ?? "", state.stack[1] ?? ""];
  renderRegisterValue(registerElements.t, values[0]);
  renderRegisterValue(registerElements.z, values[1]);
  renderRegisterValue(registerElements.y, values[2]);
  renderXDisplay();

  angleModeElement.textContent = state.angleMode;
  hypModeElement.hidden = state.hypMode === "OFF";
  hypModeElement.textContent = state.hypMode === "INV_HYP" ? "HYP-1" : "HYP";

  radixModeElement.hidden = state.radixMode === "DEC";
  radixModeElement.textContent = state.radixMode;

  formatModeElement.hidden = state.formatMode === "NORMAL";
  formatModeElement.textContent = state.formatMode;

  stackCountElement.textContent = `STACK: ${state.stack.length}`;
  shiftButtonElement.classList.toggle("is-pressed", state.shiftActive);
  renderDialog();
}

function pressButton(button) {
  button.classList.add("is-pressed");
  window.setTimeout(() => button.classList.remove("is-pressed"), 120);
}

function handleAction(action, value) {
  if (![
    "undo",
    "shift",
    "menu",
    "tab",
    "recall-memory-menu",
    "store-memory-menu",
    "constants-menu",
    "convert",
  ].includes(action)) {
    pushHistory();
  }

  switch (action) {
    case "shift":
      toggleShift();
      break;
    case "menu":
      openMenuDialog();
      break;
    case "tab":
      openStackDialog();
      break;
    case "digit":
      appendDigit(value);
      break;
    case "decimal":
      appendDecimalPoint();
      break;
    case "toggle-sign":
      toggleSign();
      break;
    case "enter":
      enterValue();
      break;
    case "add":
      binaryOperation((left, right) => left + right);
      break;
    case "subtract":
      binaryOperation((left, right) => left - right);
      break;
    case "multiply":
      binaryOperation((left, right) => left * right);
      break;
    case "divide":
      binaryOperation((left, right) => (right === 0 ? Number.NaN : left / right));
      break;
    case "modulo":
      binaryOperation((left, right) => left % right);
      break;
    case "power":
      if (!requireDecimalMode()) break;
      binaryOperation((left, right) => Math.pow(left, right));
      break;
    case "root":
      if (!requireDecimalMode()) break;
      binaryOperation((left, right) => (right === 0 ? Number.NaN : Math.pow(left, 1 / right)));
      break;
    case "percent":
      binaryOperation((left, right) => (left * right) / 100, { keepY: true });
      break;
    case "delta-percent":
      binaryOperation((left, right) => (left === 0 ? Number.NaN : ((right - left) / left) * 100));
      break;
    case "reciprocal":
      if (!requireDecimalMode()) break;
      reciprocal();
      break;
    case "sqrt":
      if (!requireDecimalMode()) break;
      unaryOperation((x) => (x < 0 ? Number.NaN : Math.sqrt(x)));
      break;
    case "cuberoot":
      if (!requireDecimalMode()) break;
      unaryOperation((x) => Math.cbrt(x));
      break;
    case "square":
      unaryOperation((x) => x * x);
      break;
    case "cube":
      unaryOperation((x) => x * x * x);
      break;
    case "ln":
      if (!requireDecimalMode()) break;
      unaryOperation((x) => (x <= 0 ? Number.NaN : Math.log(x)));
      break;
    case "exp-e":
      if (!requireDecimalMode()) break;
      unaryOperation((x) => Math.exp(x));
      break;
    case "log":
      if (!requireDecimalMode()) break;
      unaryOperation((x) => (x <= 0 ? Number.NaN : Math.log10(x)));
      break;
    case "exp-10":
      if (!requireDecimalMode()) break;
      unaryOperation((x) => 10 ** x);
      break;
    case "sin":
      runTrigAction("sin", false);
      break;
    case "cos":
      runTrigAction("cos", false);
      break;
    case "tan":
      runTrigAction("tan", false);
      break;
    case "asin":
      runTrigAction("sin", true);
      break;
    case "acos":
      runTrigAction("cos", true);
      break;
    case "atan":
      runTrigAction("tan", true);
      break;
    case "hyp":
      toggleHypMode("HYP");
      break;
    case "inverse-hyp":
      toggleHypMode("INV_HYP");
      break;
    case "factorial":
      unaryOperation((x) => factorialNumber(x));
      break;
    case "combination":
      binaryOperation((left, right) => factorialNumber(left) / (factorialNumber(right) * factorialNumber(left - right)));
      break;
    case "permutation":
      binaryOperation((left, right) => factorialNumber(left) / factorialNumber(left - right));
      break;
    case "swap":
      swapXY();
      break;
    case "lastx":
      recallLastX();
      break;
    case "drop":
      dropX();
      break;
    case "backspace":
      backspaceEntry();
      break;
    case "clear-entry":
      clearEntry();
      break;
    case "exp":
      beginExponentEntry();
      break;
    case "memory-store":
      memoryStore();
      break;
    case "memory-recall":
      memoryRecall();
      break;
    case "memory-add":
      memoryAdd();
      break;
    case "memory-subtract":
      memorySubtract();
      break;
    case "recall-memory-menu":
      openMemoryDialog("recall");
      break;
    case "store-memory-menu":
      openMemoryDialog("store");
      break;
    case "drg":
      cycleAngleMode();
      break;
    case "fse":
      cycleDisplayFormat();
      break;
    case "answer":
      recallAnswer();
      break;
    case "const-pi":
      setCurrentValue(Math.PI, false);
      break;
    case "const-e":
      setCurrentValue(Math.E, false);
      break;
    case "constants-menu":
      openConstantsDialog();
      break;
    case "convert":
      openConversionDialog();
      break;
    case "radix-dec":
      applyRadixToState("DEC");
      break;
    case "radix-hex":
      applyRadixToState("HEX");
      break;
    case "radix-oct":
      applyRadixToState("OCT");
      break;
    case "radix-bin":
      applyRadixToState("BIN");
      break;
    case "undo":
      undoLastAction();
      break;
    default:
      return;
  }

  if (action !== "shift") {
    clearShift();
  }
  render();
}

function clearLongPressState() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
  longPressButton = null;
}

function triggerLongPress(button) {
  const shiftAction = button.dataset.shiftAction;
  if (!shiftAction) {
    return;
  }
  button.dataset.longPressTriggered = "true";
  pressButton(button);
  handleAction(shiftAction, button.dataset.value ?? "");
}

keypadElement.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !button.dataset.shiftAction) {
    return;
  }
  clearLongPressState();
  longPressButton = button;
  longPressTimer = window.setTimeout(() => {
    if (longPressButton === button) {
      triggerLongPress(button);
      clearLongPressState();
    }
  }, LONG_PRESS_MS);
});

["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  keypadElement.addEventListener(eventName, clearLongPressState);
});

calculatorElement.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.longPressTriggered === "true") {
    button.dataset.longPressTriggered = "false";
    return;
  }

  pressButton(button);
  const action = state.shiftActive && button.dataset.shiftAction ? button.dataset.shiftAction : button.dataset.action;
  handleAction(action, button.dataset.value ?? "");
});

dialogBackdropElement.addEventListener("click", (event) => {
  if (event.target === dialogBackdropElement || event.target.closest("[data-dialog-close]")) {
    closeDialog();
    render();
    return;
  }

  const button = event.target.closest("[data-dialog-action]");
  if (!button) {
    return;
  }

  pushHistory();
  const action = button.dataset.dialogAction;
  const id = button.dataset.dialogId;

  switch (action) {
    case "menu":
      if (id === "reset") {
        clearAll();
      } else {
        closeDialog();
      }
      break;
    case "memory":
      if (state.dialog?.kind === "recall") {
        recallFromMemory(Number(id));
      } else {
        storeToMemory(Number(id));
      }
      break;
    case "constant-group":
      openConstantGroupDialog(Number(id));
      break;
    case "constant-item": {
      const [groupIndex, itemIndex] = id.split(":").map(Number);
      selectConstant(groupIndex, itemIndex);
      break;
    }
    case "conversion-group":
      openConversionFromDialog(Number(id));
      break;
    case "conversion-from": {
      const [groupIndex, fromIndex] = id.split(":").map(Number);
      openConversionToDialog(groupIndex, fromIndex);
      break;
    }
    case "conversion-to": {
      const [groupIndex, fromIndex, toIndex] = id.split(":").map(Number);
      selectConversion(groupIndex, fromIndex, toIndex);
      break;
    }
    default:
      closeDialog();
      break;
  }

  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Offline support is optional during local development.
    });
  });
}

render();
