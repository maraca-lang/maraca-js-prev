export const keysToObject = (
  keys,
  valueMap,
  keyMap = (k, _) => k,
  initial = {}
) =>
  keys.reduce((res, k, i) => {
    const value = valueMap(k, i);
    if (value === undefined) return res;
    return { ...res, [keyMap(k, i)]: value };
  }, initial);
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

export const fromJs = (value) => {
  if (value === 0) return { type: "value", value: "0" };
  if (!value) return { type: "value", value: "" };
  if (value === true) return { type: "value", value: "true" };
  if (typeof value === "number") return { type: "value", value: `${value}` };
  if (typeof value === "string") return { type: "value", value };
  if (Object.prototype.toString.call(value) === "[object Object]") {
    return {
      type: "block",
      values: mapObject(value, (v) => fromJs(v)),
      content: [],
    };
  }
  if (Array.isArray(value)) {
    return {
      type: "block",
      values: {},
      content: value.map((v) => fromJs(v)),
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

const nilValue = { type: "value", value: "" };
export const resolveType = (data, get) => {
  const d = data || nilValue;
  if (d.type === "stream") return resolveType(get(d.value), get);
  if (d.type === "block") {
    let values = {};
    const content = d.content.reduce((res, x) => {
      if (!Array.isArray(x)) return [...res, x];
      const v = resolveType(x[0], get);
      if (v.type !== "block") return res;
      values = { ...values, ...v.values };
      return [...res, ...v.content];
    }, []);
    return { ...d, values: { ...values, ...d.values }, content };
  }
  return d;
};

export const resolve = (data, get) => {
  const d = resolveType(data, get);
  if (d.type === "block") {
    return {
      ...d,
      values: mapObject(d.values, (v) => resolve(v, get)),
      content: d.content.map((c) => resolve(c, get)),
    };
  }
  return d;
};

export const streamMap = (map) => (set, get) => () => set(map(get));

export const sortMultiple = <T = any>(
  items1: T[],
  items2: T[],
  sortItems: (a: T, b: T) => number,
  reverseUndef = false
) =>
  Array.from({ length: Math.max(items1.length, items2.length) }).reduce(
    (res, _, i) => {
      if (res !== 0) return res;
      if (items1[i] === undefined) return reverseUndef ? 1 : -1;
      if (items2[i] === undefined) return reverseUndef ? -1 : 1;
      return sortItems(items1[i], items2[i]);
    },
    0
  ) as -1 | 0 | 1;
