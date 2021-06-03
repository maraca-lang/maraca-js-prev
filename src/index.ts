import build from "./build";
import parse from "./parse";
import process from "./process";
import { resolve, streamMap } from "./utils";

export { fromJs, isNil, toJs } from "./utils";

export default (source, library, onData) => {
  return process((create) => {
    const builtLibrary = Object.keys(library).reduce(
      (res, k) => ({ ...res, [k]: build(library[k], create, null) }),
      {}
    );
    const result = build(parse(source), create, (name) => builtLibrary[name]);
    return create(streamMap((get) => resolve(result, get)));
  }, onData);
};
