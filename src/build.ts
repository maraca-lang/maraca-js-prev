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
  "!": numericMap((a, b) => a.type !== b.type || a.value !== b.value),
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

const pushableValue = (create, initial) => ({
  type: "stream",
  value: create((set) => {
    const push = (v) => set({ ...v, push });
    set({ ...initial, push });
  }, true),
});
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

const buildFunc = ({ mode, params, body }, create, getVar) => {
  if (mode === "=>" && !params) {
    return { mode, value: build(body, create, getVar) };
  }
  const mappedParams =
    Array.isArray(params) &&
    params.map((x) => ({
      ...x,
      def: x.def ? build(x.def, create, getVar) : nilValue,
    }));
  const hasRest = Array.isArray(params) && params.some((x) => x.rest);
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
          return { type: "block", values, content: value.content };
        }
        if (value.values[name]) return value.values[name];
        if (hasRest) return mappedParams[index].def;
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
  return small.content.reduce((res, x, i) =>
    build(big.func.body, create, big.func.buildGetVar(x, `${i + 1}`, res))
  );
};

const captureUndefined = (node, getVar) => {
  if (typeof node !== "function") {
    if (node.type === "var") {
      getVar(node.name);
    } else if (node.type === "merge") {
      const dest = getVar(node.key[0]);
      if (!(isNil(dest) && !dest.push)) captureUndefined(node.value, getVar);
    } else if (node.nodes) {
      node.nodes.map((n) => captureUndefined(n, getVar));
    }
  }
};

const build = (node, create, getVar) => {
  if (typeof node === "function") {
    return { type: "stream", value: create(node) };
  }
  if (node.type === "built") {
    return node.value;
  }
  if (node.type === "block") {
    let values = {};
    const newGetVar = (
      name,
      captureUndef = node.bracket === "<" ? true : undefined
    ) => {
      if (values[name]) return values[name];
      if (node.values[name]) {
        return (values[name] = pushableValue(
          create,
          build(
            node.values[name],
            create,
            node.values[name].type === "block" && node.values[name].func
              ? newGetVar
              : (n, c) => (n === name ? getVar(n, c) : newGetVar(n, c))
          )
        ));
      }
      const result = getVar(name, captureUndef ? false : captureUndef);
      if (result || !captureUndef) return result;
      return (values[name] = pushableValue(create, nilValue));
    };

    node.content.forEach((c) =>
      captureUndefined(Array.isArray(c) ? c[0] : c, newGetVar)
    );
    node.merge.forEach((x) => captureUndefined(x, newGetVar));

    for (const name of Object.keys(node.values)) newGetVar(name);
    const content = node.content.map((c) =>
      Array.isArray(c)
        ? [build(c[0], create, newGetVar)]
        : build(c, create, newGetVar)
    );
    const merge = node.merge.map((x) => build(x, create, newGetVar));
    const func =
      node.func &&
      buildFunc(node.func, create, (name) => newGetVar(name, false));

    if (node.bracket === "<") {
      return { type: "block", values, content, func, merge };
    }
    return {
      type: "stream",
      value: create((set, get) => () => {
        let v = nilValue;
        merge.map((s) => resolveType(s, get));
        const unpacked = content.reduce((res, x) => {
          if (!Array.isArray(x)) return [...res, x];
          const v = resolveData(x[0], get);
          return v.type === "block" ? [...res, ...v.content] : res;
        }, []);
        for (const c of unpacked) {
          v = resolveType(c, get);
          if (isNil(v) === (node.bracket === "[")) break;
        }
        if (isNil(v) && func?.value) v = func.value;
        set(v);
      }),
    };
  }
  if (node.type === "var") {
    return getVar(node.name);
  }
  if (node.type === "value") {
    return node;
  }

  if (node.type === "merge") {
    const dest = getVar(node.key[0]);
    if (isNil(dest) && !dest.push) return nilValue;
    const value = build(node.value, create, getVar);
    return {
      type: "stream",
      value: create((_, get) => {
        const destStream = node.key
          .slice(1)
          .reduce(
            (res, k) => resolveData(res, (x) => get(x, true))?.values?.[k],
            dest
          );
        const push = resolveType(destStream, get).push;
        if (push) {
          const wrapped = {
            type: "stream",
            value: create(streamMap((get) => resolve(value, get))),
          };
          let source;
          return () => {
            const newSource = resolve(wrapped, get);
            if (source && source !== newSource) {
              push(pushable(create, newSource));
            }
            source = newSource;
          };
        }
      }),
    };
  }

  const args = node.nodes.map((n) => build(n, create, getVar));
  if (node.type === "template") {
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
  if (node.type === "pipe") {
    return {
      type: "stream",
      value: create((set, get, create) => {
        const wrapped = {
          type: "stream",
          value: create(streamMap((get) => resolve(args[0], get))),
        };
        let input;
        return () => {
          const newInput = resolveType(wrapped, get);
          if (!input || (input !== newInput && !isNil(newInput))) {
            set({ ...resolve(args[1], (x) => get(x, true)) });
          }
          input = newInput;
        };
      }),
    };
  }
  if (node.type === "map") {
    const map = (args.length === 1 ? unaryOperators : operators)[node.func];
    return {
      type: "stream",
      value: create(streamMap((get) => map(args, get))),
    };
  }
  if (node.type === "dot") {
    return {
      type: "stream",
      value: create((set, get, create) => {
        let prev;
        return () => {
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
