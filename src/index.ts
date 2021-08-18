import build from "./build";
import parse, { createNode } from "./parse";
import process from "./process";
import { fromJs, resolve, streamMap } from "./utils";

export { fromJs, isNil, toJs } from "./utils";
export { default as parse } from "./parse";

const parseSource = (source) => {
  if (typeof source === "string") return parse(source);
  return createNode(
    "block",
    Object.keys(source).map((k) =>
      createNode("attr", [parseSource(source[k])], { key: fromJs(k) })
    ),
    { bracket: fromJs("<") }
  );
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
      typeof source === "string"
        ? parseSource(source)
        : createNode("dot", [
            parseSource(source),
            { type: "value", value: "" },
          ]),
      create,
      (name) => builtLibrary[name]
    );
    return create(streamMap((get) => resolve(result, get)));
  }, onData);
