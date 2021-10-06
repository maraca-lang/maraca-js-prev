export const keysToObject = (
  keys,
  valueMap,
  keyMap = (k, _) => k,
  initial = {}
) => {
  const res = { ...initial };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const value = valueMap(k, i);
    if (value !== undefined) res[keyMap(k, i)] = value;
  }
  return res;
};
export const mapObject = (obj, valueMap) =>
  keysToObject(Object.keys(obj), (k) => valueMap(obj[k], k));

export const toNumber = (v: string) => {
  const n = parseFloat(v);
  return !isNaN(v as any) && !isNaN(n) ? n : null;
};
export const toIndex = (v: string) => {
  const n = toNumber(v);
  return n !== null && n === Math.floor(n) && n > 0 ? n : null;
};

export const isNil = (d) => d.type === "value" && !d.value;

export const nilValue = { type: "value", value: "" };

export const resolveType = (data, get) => {
  const d = data || nilValue;
  if (d.type === "stream") return resolveType(get(d.value), get);
  return d;
};
export const resolveData = (data, get, deep = false) => {
  const d = data || nilValue;
  if (d.type === "stream") return resolveData(get(d.value), get);
  if (d.type === "block") {
    if (!d.merge) return d;
    d.merge.map((s) => resolveType(s, get));
    let values = {};
    const content = (deep ? d.wrappedContent || d.content : d.content).reduce(
      (res, x) => {
        if (!Array.isArray(x)) return [...res, x];
        const v = resolveData(x[0], get);
        if (v.type !== "block") return res;
        values = { ...values, ...v.values };
        return [...res, ...v.content];
      },
      []
    );
    return {
      ...d,
      values: { ...values, ...d.values },
      content,
      merge: [],
    };
  }
  return d;
};
export const resolve = (data, get) => {
  const d = resolveData(data, get, true);
  if (d.type === "block") {
    if (!d.merge) return d;
    return {
      type: d.type,
      values: mapObject(d.values, (v) => resolve(v, get)),
      content: d.content.map((c) => resolve(c, get)),
      func: d.func,
      push: d.push,
    };
  }
  return d;
};

export const fromJs = (value, deep = true) => {
  if (value === 0) return { type: "value", value: "0" };
  if (!value) return { type: "value", value: "" };
  if (value === true) return { type: "value", value: "true" };
  if (typeof value === "number") return { type: "value", value: `${value}` };
  if (typeof value === "string") return { type: "value", value };
  if (typeof value === "function") {
    return {
      type: "block",
      values: {},
      content: [],
      func: (arg, create) => value(arg, create),
    };
  }
  if (Object.prototype.toString.call(value) === "[object Object]") {
    return {
      type: "block",
      values: deep ? mapObject(value, (v) => fromJs(v)) : value,
      content: [],
    };
  }
  if (Array.isArray(value)) {
    return {
      type: "block",
      values: {},
      content: deep ? value.map((v) => fromJs(v)) : value,
    };
  }
  return { type: "value", value: "" };
};

export const toJs = (data = { type: "value", value: "" } as any, config) => {
  if (!config) return undefined;
  if (config === true) return data;
  if (typeof config === "function") {
    return { value: toJs(data, config()), push: data.push };
  }
  if (isNil(data)) return undefined;
  if (config === "boolean") return true;
  if (Array.isArray(config) && config.length > 1) {
    for (const c of config) {
      const v = toJs(data, c);
      if (v) return v;
    }
    return undefined;
  }
  if (data.type === "value") {
    if (config === "string") return data.value;
    if (config === "number") {
      const result = toNumber(data.value);
      return result === null ? undefined : result;
    }
    if (config === "integer") {
      const result = toIndex(data.value);
      return result === null ? undefined : result;
    }
    return undefined;
  }
  if (typeof config === "object") {
    if (Array.isArray(config)) {
      return data.content.map((d, i) => toJs(d, config[i % config.length]));
    }
    const allValues = keysToObject(
      data.content,
      (d) => d,
      (_, i) => i + 1,
      data.values
    );
    const keys =
      config["*"] || config["**"]
        ? Array.from(
            new Set([
              ...Object.keys(config["**"] ? allValues : data.values),
              ...Object.keys(config),
            ])
          )
        : Object.keys(config);
    return keysToObject(
      keys.filter((k) => !(k === "*" || k === "**")),
      (k) => toJs(allValues[k], config[k] || config["*"] || config["**"])
    );
  }
  return undefined;
};

export const streamMap = (map) => (set) => (get) => set(map(get));

const printValue = (value) => {
  if (!value) return '""';
  return `"${value.replace(/\<|\>|\[|\]|\{|\}|"/g, (m) => `\\${m}`)}"`;
};
const printBlock = (values, content) => {
  const keys = Object.keys(values).sort((a, b) => {
    const aIndex = toIndex(a);
    const bIndex = toIndex(b);
    if (!aIndex === !bIndex) {
      if (aIndex) return aIndex - bIndex;
      return a.localeCompare(b);
    }
    return aIndex ? 1 : -1;
  });
  const printValues = keys
    .filter((k) => values[k].type === "block" || values[k].value)
    .map((k) => `${printValue(k)}=${print(values[k])}`);
  const printContent = content.map((c) => print(c));
  return `<${[...printValues, ...printContent].join(" ")}>`;
};
export const print = (data) => {
  if (data.type === "value") return printValue(data.value);
  return printBlock(data.values, data.content);
};
