import build from "./build";
import parse, { createNode } from "./parse";
import process from "./process";
import { fromJs, resolve, streamMap } from "./utils";

export { fromJs, isNil, toJs } from "./utils";
export { default as parse } from "./parse";

const parseSource = (source) => {
  if (typeof source === "string") return parse(source);
  const block = createNode(
    "block",
    Object.keys(source).map((k) =>
      createNode("attr", [parseSource(source[k])], { key: fromJs(k) })
    ),
    { bracket: fromJs("<") }
  );
  if (!source[""]) return block;
  return createNode("dot", [block, { type: "value", value: "" }]);
};

export default (source, library = {}, onData?) =>
  process((create) => {
    const builtLibrary = Object.keys(library).reduce(
      (res, k) => ({
        ...res,
        [k]:
          typeof library[k] === "function"
            ? { type: "stream", value: create(library[k]) }
            : library[k],
      }),
      {}
    );
    const result = build(
      parseSource(source),
      create,
      (name) => builtLibrary[name]
    );
    return create(streamMap((get) => resolve(result, get)));
  }, onData);
