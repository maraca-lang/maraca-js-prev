import build from "./build";
import parse from "./parse";
import process from "./process";
import { mapObject, resolve, streamMap } from "./utils";

export { fromJs, isNil, toJs } from "./utils";

const parseSource = (source) => {
  if (typeof source === "string") return parse(source);
  return {
    type: "block",
    bracket: "<",
    values: mapObject(source, (v) => parseSource(v)),
    content: [],
    merge: [],
  };
};

export default (source, library, onData) => {
  return process((create) => {
    const builtLibrary = Object.keys(library).reduce(
      (res, k) => ({
        ...res,
        [k]: build({ type: "library", value: library[k] }, create, null),
      }),
      {}
    );
    const result = build(
      typeof source === "string"
        ? parseSource(source)
        : {
            type: "dot",
            nodes: [parseSource(source), { type: "value", value: "" }],
          },
      create,
      (name) => builtLibrary[name]
    );
    return create(streamMap((get) => resolve(result, get)));
  }, onData);
};
