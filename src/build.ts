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
  return result.push ? pushableValue(create, result) : result;
};

const nilValue = { type: "value", value: "" };

const buildFunc = ({ mode, params, body }, create, getVar) => {
  if (mode === "=>" && !params) {
    return { mode, value: build(body, create, getVar) };
  }
  const mappedParams =
    Array.isArray(params) &&
    params
      .filter((x) => !x.rest)
      .map((x) => ({
        ...x,
        def: x.def ? build(x.def, create, getVar) : nilValue,
      }));
  const restParam = Array.isArray(params) && params.find((x) => x.rest);
  return {
    mode: `${mode === "=>" && Array.isArray(params) ? "()" : ""}${mode}`,
    body,
    buildGetVar: (value, key, result) => (name) => {
      if (typeof params === "string") {
        return name === params ? value : getVar(name);
      }
      const argIndex = params.findIndex((x) => x.key === name);
      if (argIndex === -1) return getVar(name);
      if (mode === "=>") {
        if (value.type === "value") return nilValue;
        if (name === restParam?.key) {
          const values = mapObject(value.values, (v, k) =>
            mappedParams.find((x) => x.key === k) ? undefined : v
          );
          return { type: "block", values, content: value.content };
        }
        if (value.values[name]) return value.values[name];
        if (restParam) return getVar(name);
        const freeParams = mappedParams.filter((x) => !value.values[x.key]);
        const freeIndex = freeParams.findIndex((x) => x.key === name);
        if (freeIndex === -1) return getVar(name);
        return value.content[freeIndex] || freeParams[freeIndex].def;
      }
      return [result, value, key && { type: "value", value: key }].filter(
        (x) => x
      )[argIndex];
    },
  };
};

const combineDot = (create, big, small) => {
  if (big.type !== "block") return nilValue;
  if (small.type === "value") {
    return big.values[small.value] || big.content[toIndex(small.value) - 1];
  }
  if (!big.func) return nilValue;
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

const build = (node, create, getVar) => {
  if (typeof node === "function") {
    return { type: "stream", value: create(node) };
  }
  if (node.type === "block") {
    let values = {};
    const newGetVar = (
      name,
      captureUndef = node.bracket === "<" ? true : undefined
    ) => {
      if (values[name]) return values[name];
      if (node.values[name]) {
        values[name] =
          node.values[name] === true
            ? getVar(name, captureUndef ? false : captureUndef)
            : pushableValue(
                create,
                build(node.values[name], create, newGetVar)
              );
        return values[name];
      }
      const result = getVar(name, captureUndef ? false : captureUndef);
      if (result || !captureUndef) return result;
      return (values[name] = pushableValue(create, {
        type: "value",
        value: "",
      }));
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

  const args = node.nodes.map((n) => build(n, create, getVar));
  if (node.type === "pipe") {
    return {
      type: "stream",
      value: create((set, get, create) => {
        const wrapped = args.map((a) => ({
          type: "stream",
          value: create(streamMap((get) => resolve(a, get))),
        }));
        let input;
        let output;
        const push = (v) => {
          if (input.push) input.push(pushable(create, resolve(get, v)));
          else if (output.push) output.push(pushable(create, input));
          else set({ ...output, push });
        };
        return () => {
          const newInput = resolveType(wrapped[0], get);
          const newOutput = resolveType(wrapped[1], get);
          // if (input && input !== newInput) {
          //   if (newOutput.push) newOutput.push(pushable(create, newInput));
          //   else set({ ...newOutput, push });
          // }
          if (output !== newOutput) {
            set({ ...newOutput, push });
          }
          input = newInput;
          output = newOutput;
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
          const next = combineDot(create, big, small);
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
