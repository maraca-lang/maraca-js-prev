import {
  fromJs,
  isNil,
  mapObject,
  print,
  resolve,
  resolveData,
  resolveType,
  streamMap,
  toIndex,
  toNumber,
} from "./utils";

const dataMap = (map) => (args, get) =>
  fromJs(map(...args.map((a) => resolve(a, get))));

const numericMap = (map) =>
  dataMap((...args) => {
    const values = args.map((a) => toNumber(a.value));
    if (values.some((v) => v === null)) return null;
    return map(...values);
  });

const unaryOperators = {
  "!": dataMap((a) => isNil(a)),
  "-": numericMap((a) => -a),
};
const operators = {
  "<=": numericMap((a, b) => a <= b),
  ">=": numericMap((a, b) => a >= b),
  "<": numericMap((a, b) => a < b),
  ">": numericMap((a, b) => a > b),
  "!": dataMap((a, b) => a.type !== b.type || a.value !== b.value),
  "=": ([s1, s2], get) => {
    const [t1, t2] = [resolveType(s1, get), resolveType(s2, get)];
    if (t1.type !== t2.type) return fromJs(false);
    if (t1.type === "value") return fromJs(t1.value === t2.value);
    return fromJs(print(resolve(t1, get)) === print(resolve(t2, get)));
  },
  "+": numericMap((a, b) => a + b),
  "-": numericMap((a, b) => a - b),
  "*": numericMap((a, b) => a * b),
  "/": numericMap((a, b) => a / b),
  "%": numericMap((a, b) => ((((a - 1) % b) + b) % b) + 1),
  "^": numericMap((a, b) => a ** b),
};

const pushableValue = (create, initial) => {
  if (initial.type === "stream") {
    initial.value.pushable = true;
    return initial;
  }
  return { type: "stream", value: create(initial) };
};
const pushable = (create, initial) => {
  const result =
    initial.type === "value"
      ? initial
      : {
          ...initial,
          values: mapObject(initial.values, (v) => pushable(create, v)),
          content: initial.content.map((c) => pushable(create, c)),
        };
  return pushableValue(create, result);
};

const nilValue = { type: "value", value: "" };

const buildFunc = (node, create, getVar) => {
  const mode = node.values.mode.value;
  const params =
    node.values.params.type === "value"
      ? node.values.params.value
      : node.values.params.content.map((p) => ({
          key: p.values.key?.value,
          def: p.values.def,
          rest: p.values.rest?.value,
        }));
  const body = node.content[0];

  if (mode === "=>" && !params) {
    return { mode, value: build(body, create, getVar) };
  }
  const mappedParams =
    Array.isArray(params) &&
    params.map((x) => ({
      ...x,
      def: x.def ? build(x.def, create, getVar) : nilValue,
    }));
  return {
    mode: `${mode === "=>" && Array.isArray(params) ? "()" : ""}${mode}`,
    body,
    buildGetVar: (value, key, result) => (name) => {
      if (typeof params === "string") {
        return name === params ? value : getVar(name);
      }
      const index = mappedParams.findIndex((x) => x.key === name);
      if (index === -1) return getVar(name);
      if (mode === "=>") {
        if (value.type === "value") return nilValue;
        if (mappedParams[index].rest) {
          const values = mapObject(value.values, (v, k) =>
            mappedParams.find((x) => !x.rest && x.key === k) ? undefined : v
          );
          if (mappedParams[index].rest === "*") {
            const content = value.content.slice(
              mappedParams.length - 1 - Object.keys(values).length
            );
            return { type: "block", values, content };
          }
          return { type: "block", values, content: value.content };
        }
        if (value.values[name]) return value.values[name];
        if (mappedParams.some((x) => x.rest == "**")) {
          return mappedParams[index].def;
        }
        const freeParams = mappedParams.filter((x) => !value.values[x.key]);
        const freeIndex = freeParams.findIndex((x) => x.key === name);
        return value.content[freeIndex] || freeParams[freeIndex].def;
      }
      return [result, value, key && { type: "value", value: key }].filter(
        (x) => x
      )[index];
    },
  };
};

const combineDot = (get, create, big, small) => {
  if (big.type !== "block") return nilValue;
  if (small.type === "value") {
    const result =
      big.values[small.value] || big.content[toIndex(small.value) - 1];
    if (result) return result;
  }
  if (!big.func) return nilValue;
  if (typeof big.func === "function") return big.func(resolve(small, get));
  if (big.func.value) return big.func.value;
  if (big.func.mode === "=>") {
    return build(big.func.body, create, big.func.buildGetVar(small));
  }
  if (small.type !== "block") return nilValue;
  if (big.func.mode === "()=>") {
    return build(big.func.body, create, big.func.buildGetVar(small));
  }
  if (big.func.mode === "=>>") {
    return {
      type: "block",
      values: {
        ...big.values,
        ...mapObject(small.values, (v, k) =>
          build(big.func.body, create, big.func.buildGetVar(v, k))
        ),
      },
      content: [
        ...big.content,
        ...small.content.map((v, i) =>
          build(big.func.body, create, big.func.buildGetVar(v, `${i + 1}`))
        ),
      ],
    };
  }
  return small.content.reduce(
    ...[
      (res, x, i) =>
        build(big.func.body, create, big.func.buildGetVar(x, `${i + 1}`, res)),
      big.content[0],
    ].filter((x) => x)
  );
};

const captureUndefined = (node, getVar) => {
  if (node.type === "var") {
    getVar(node.name);
  } else if (node.type === "merge") {
    const dest = getVar(node.key[0]);
    if (!(isNil(dest) && !dest.push)) captureUndefined(node.value, getVar);
  } else if (node.nodes) {
    node.nodes.map((n) => captureUndefined(n, getVar));
  }
};

const build = (node, create, getVar) => {
  if (node.type === "value") return node;

  const type = node.values.type.value;

  if (type === "block") {
    const bracket = node.values.bracket.value;
    const items = {
      values: node.content
        .filter((x) => x.values?.type.value === "attr")
        .reduce(
          (res, x) => ({ ...res, [x.values.key.value]: x.content[0] }),
          {}
        ),
      func: node.content.find((x) => x.values?.type.value === "func"),
      merge: node.content.filter((x) => x.values?.type.value === "merge"),
      content: node.content
        .filter(
          (x) => !["attr", "func", "merge"].includes(x.values?.type.value)
        )
        .reduce(
          (res, x) =>
            x.values?.type.value === "multi"
              ? [...res, ...x.content]
              : [...res, x],
          []
        ),
    };

    let values = {};
    const newGetVar = (
      name,
      captureUndef = bracket === "<" ? true : undefined
    ) => {
      if (values[name]) return values[name];
      if (items.values[name]) {
        return (values[name] = pushableValue(
          create,
          build(
            items.values[name],
            create,
            items.values[name].values?.type.value === "block" &&
              items.values[name].content.some(
                (x) => x.values?.type.value === "func"
              )
              ? newGetVar
              : (n, c) => (n === name ? getVar(n, c) : newGetVar(n, c))
          )
        ));
      }
      const result = getVar(name, captureUndef ? false : captureUndef);
      if (result || !captureUndef) return result;
      return (values[name] = pushableValue(create, nilValue));
    };

    items.content.forEach((c) => captureUndefined(c, newGetVar));
    items.merge.forEach((x) => captureUndefined(x, newGetVar));

    for (const name of Object.keys(items.values)) newGetVar(name);
    const content = items.content.map((c) =>
      c.values?.type.value === "unpack"
        ? [build(c.content[0], create, newGetVar)]
        : build(c, create, newGetVar)
    );
    const merge = items.merge.map((x) => build(x, create, newGetVar));
    const func =
      items.func &&
      buildFunc(items.func, create, (name) => newGetVar(name, false));

    if (bracket === "<") {
      return { type: "block", values, content, func, merge };
    }
    return {
      type: "stream",
      value: create((set) => (get) => {
        let v = nilValue;
        merge.map((s) => resolveType(s, get));
        const unpacked = content.reduce((res, x) => {
          if (!Array.isArray(x)) return [...res, x];
          const v = resolveData(x[0], get);
          return v.type === "block" ? [...res, ...v.content] : res;
        }, []);
        for (const c of unpacked) {
          v = resolveType(c, get);
          if (isNil(v) === (bracket === "[")) break;
        }
        if (isNil(v) && func?.value) v = func.value;
        set(v);
      }),
    };
  }
  if (type === "var") {
    return getVar(node.values.name.value);
  }

  if (type === "merge") {
    const key = node.values.key.content.map((x) => x.value);
    const dest = getVar(key[0]);
    if (isNil(dest) && !dest.push) return nilValue;
    const value = build(node.content[0], create, getVar);
    const wrappedValue = {
      type: "stream",
      value: create(streamMap((get) => resolve(value, get))),
    };
    const wrappedDest = {
      type: "stream",
      value: create(
        streamMap((get) => {
          const destStream = key
            .slice(1)
            .reduce((res, k) => resolveData(res, get)?.values?.[k], dest);
          return resolveType(destStream, get);
        })
      ),
    };
    return {
      type: "stream",
      value: create(() => {
        let source;
        return (get, create) => {
          const newSource = resolve(wrappedValue, get);
          if (source && source !== newSource) {
            resolveType(wrappedDest, get)?.push(pushable(create, newSource));
          }
          source = newSource;
        };
      }),
    };
  }

  const args = node.content.map((n) => build(n, create, getVar));
  if (type === "template") {
    if (args.length === 1) return args[0];
    return {
      type: "stream",
      value: create(
        streamMap((get) => {
          const values = args.map((a) => resolveType(a, get));
          return values.every((v) => v.type === "value")
            ? { type: "value", value: values.map((v) => v.value).join("") }
            : nilValue;
        })
      ),
    };
  }
  if (type === "pipe") {
    const wrapped = {
      type: "stream",
      value: create(streamMap((get) => resolve(args[0], get))),
    };
    return {
      type: "stream",
      value: create((set) => {
        let input;
        return (get) => {
          const newInput = resolveType(wrapped, get);
          if (!input || (input !== newInput && !isNil(newInput))) {
            set({ ...resolve(args[1], get) });
          }
          input = newInput;
        };
      }),
    };
  }
  if (type === "map") {
    const map = (args.length === 1 ? unaryOperators : operators)[
      node.values.func.value
    ];
    return {
      type: "stream",
      value: create(streamMap((get) => map(args, get))),
    };
  }
  if (type === "dot") {
    return {
      type: "stream",
      value: create((set) => {
        let prev;
        return (get, create) => {
          const values = args.map((a) => resolveData(a, get));
          const [big, small] =
            values[0].type === "block" && !values[1].func
              ? values
              : [values[1], values[0]];
          const next = combineDot(get, create, big, small);
          if (next !== prev) {
            if (prev && prev.type === "stream") prev.value.cancel();
            set(next);
            prev = next;
          }
        };
      }),
    };
  }
};

export default build;
