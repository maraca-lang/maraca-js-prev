import {
  fromJs,
  isNil,
  mapObject,
  streamMap,
  toIndex,
  toNumber,
} from "./utils";

const dataMap = (map) => (args, resolve) =>
  fromJs(map(args.map((a) => resolve(a))));

const numericMap = (map) =>
  dataMap((args) => {
    const values = args.map((a) => toNumber(a.value));
    if (values.some((v) => v === null)) return null;
    return map(values);
  });

const operators = {
  "+": numericMap(([a, b]) => a + b),
};

const pushableValue = (create, initial) =>
  create((set) => {
    const push = (v) => set({ ...v, push });
    set({ ...initial, push });
  }, true);
const pushable = (create, initial) => {
  const result =
    initial.type === "value"
      ? initial
      : {
          ...initial,
          values: mapObject(initial.values, (v) => pushable(create, v)),
          content: initial.content.map((c) => pushable(create, c)),
        };
  return { type: "stream", value: pushableValue(create, result) };
};

const nilValue = { type: "value", value: "" };

const buildFunc = ({ mode, params, body }, create, getVar) => {
  if (mode === "=>" && !params) {
    return { mode, value: build(body, create, getVar) };
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

const build = (node, create, getVar, canPush = false) => {
  if (typeof node === "function") {
    return { type: "stream", value: create(node) };
  }
  if (node.type === "block") {
    let values = {};
    const newGetVar = (name) => {
      if (values[name]) return values[name];
      if (node.values[name]) {
        values[name] = build(node.values[name], create, newGetVar, true);
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
          const v = get(x[0]);
          return v.type === "block" ? [...res, ...v.content] : res;
        }, []);
        for (const c of unpacked) {
          v = get(c);
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
    if (canPush) return { type: "stream", value: pushableValue(create, node) };
    return node;
  }

  const args = node.nodes.map((n) => build(n, create, getVar));
  if (node.type === "pipe") {
    return {
      type: "stream",
      value: create((set, get) => {
        let input;
        let output;
        const push = (v) => {
          if (input.push) input.push(pushable(create, get(v, true)));
          else if (output.push) output.push(pushable(create, input));
          else set({ ...output, push });
        };
        return () => {
          const newInput = get(args[0], true);
          const newOutput = get(args[1], true);
          if (input !== newInput) {
            if (newOutput.push) newOutput.push(pushable(create, newInput));
            else set({ ...newOutput, push });
          }
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
          const values = args.map((a) => get(a));
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
              if (big.func.value) {
                next = big.func.value;
              } else if (big.func.mode === "=>") {
                next = build(
                  big.func.body,
                  create,
                  big.func.buildGetVar(small)
                );
              } else if (small.type === "block") {
                if (big.func.mode === "=>>") {
                  next = {
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
                        build(
                          big.func.body,
                          create,
                          big.func.buildGetVar(v, `${i + 1}`)
                        )
                      ),
                    ],
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
