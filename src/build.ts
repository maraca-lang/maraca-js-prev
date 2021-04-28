import {
  fromJs,
  isNil,
  mapObject,
  resolve,
  resolveType,
  streamMap,
  toIndex,
  toNumber,
} from "./utils";

const dataMap = (map) => (args, get) =>
  fromJs(map(args.map((a) => resolveType(a, get))));

const numericMap = (map) =>
  dataMap((args) => {
    const values = args.map((a) => toNumber(a.value));
    if (values.some((v) => v === null)) return null;
    return map(values);
  });

const operators = {
  "+": numericMap(([a, b]) => a + b),
};

const pushable = (create, initial) =>
  create((set) => {
    const push = (v) => set({ ...v, push });
    set({ ...initial, push });
  }, true);
const pushableDeep = (create, initial) => {
  const result =
    initial.type === "value"
      ? initial
      : {
          ...initial,
          values: mapObject(initial.values, (v) => pushableDeep(create, v)),
          content: initial.content.map((c) => pushableDeep(create, c)),
        };
  return { type: "stream", value: pushable(create, result) };
};

const nilValue = { type: "value", value: "" };

const buildFunc = ({ mode, params, body }, create, getVar) => {
  if (mode === "=>" && params.length === 0) {
    return { type: "default", value: build(body, create, getVar) };
  }
  const paramDefaults =
    Array.isArray(params) &&
    params.map((x) => (x.def ? build(x.def, create, getVar) : nilValue));
  return {
    mode,
    body,
    buildGetVar: (value, key, result) => (name) => {
      if (typeof params === "string") {
        return name === params ? value : getVar(name);
      }
      const index = params.findIndex((x) => x.key === name);
      if (index === -1) return getVar(name);
      if (mode === "=>") {
        if (value.type === "value") return nilValue;
        return value.content[index] || paramDefaults[index];
      }
      return [result, value, key && { type: "value", value: key }].filter(
        (x) => x
      )[index];
    },
  };
};

const build = (node, create, getVar) => {
  if (typeof node === "function") {
    return { type: "stream", value: create(node) };
  }
  if (node.type === "block") {
    let values = {};
    const newGetVar = (name) => {
      if (values[name]) return values[name];
      if (node.values[name]) {
        values[name] = build(node.values[name], create, newGetVar);
        return values[name];
      }
      return getVar(name);
    };
    for (const name of Object.keys(node.values)) newGetVar(name);
    const content = node.content.map((c) =>
      Array.isArray(c)
        ? [build(c[0], create, newGetVar)]
        : build(c, create, newGetVar)
    );
    const func = node.func && buildFunc(node.func, create, newGetVar);
    if (node.bracket === "<") {
      return { type: "block", values, content, func };
    }
    return {
      type: "stream",
      value: create((set, get) => () => {
        let v = nilValue;
        const unpacked = content.reduce((res, x) => {
          if (!Array.isArray(x)) return [...res, x];
          const v = resolveType(x[0], get);
          return v.type === "block" ? [...res, ...v.content] : res;
        }, []);
        for (const c of unpacked) {
          v = resolveType(c, get);
          if (isNil(v) === (node.bracket === "[")) break;
        }
        if (isNil(v) && func?.type === "default") v = func.value;
        set(v);
      }),
    };
  }
  if (node.type === "var") {
    return getVar(node.name);
  }
  if (node.type === "value") {
    return { type: "stream", value: pushable(create, node) };
  }

  const args = node.nodes.map((n) => build(n, create, getVar));
  if (node.type === "push") {
    return {
      type: "stream",
      value: create((_, get) => {
        let source;
        return () => {
          const dest = resolveType(args[1], get);
          const newSource = resolve(args[0], get);
          if (source && dest.push && source !== newSource) {
            dest.push(pushableDeep(create, newSource));
          }
          source = newSource;
        };
      }),
    };
  }
  if (node.type === "emit") {
    return {
      type: "stream",
      value: create((set, get) => {
        let emit;
        return () => {
          const newEmit = resolve(args[0], get);
          if (emit !== newEmit && !isNil(newEmit)) {
            set({ ...resolve(args[1], (x) => get(x, true)) });
          }
          emit = newEmit;
        };
      }),
    };
  }
  if (node.type === "map") {
    return {
      type: "stream",
      value: create(streamMap((get) => operators[node.func](args, get))),
    };
  }
  if (node.type === "dot") {
    return {
      type: "stream",
      value: create((set, get, create) => {
        let prev;
        return () => {
          const values = args.map((a) => resolveType(a, get));
          const [big, small] =
            values[0].type === "block" && !values[1].func
              ? values
              : [values[1], values[0]];
          let next;
          if (big.type === "block") {
            if (small.type === "value") {
              next =
                big.values[small.value] ||
                big.content[toIndex(small.value) - 1];
            }
            if (!next && big.func) {
              if (big.func.mode === "=>") {
                next = build(
                  big.func.body,
                  create,
                  big.func.buildGetVar(small)
                );
              } else if (small.type === "block") {
                if (big.func.mode === "=>>") {
                  next = {
                    type: "block",
                    values: mapObject(small.values, (v, k) =>
                      build(big.func.body, create, big.func.buildGetVar(v, k))
                    ),
                    content: small.content.map((v, i) =>
                      build(
                        big.func.body,
                        create,
                        big.func.buildGetVar(v, `${i + 1}`)
                      )
                    ),
                  };
                } else {
                  next = small.content.reduce((res, x, i) =>
                    build(
                      big.func.body,
                      create,
                      big.func.buildGetVar(x, `${i + 1}`, res)
                    )
                  );
                }
              }
            }
          }
          if (!next) next = nilValue;
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
