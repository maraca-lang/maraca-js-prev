import Block from "./block";

export const isObject = (x) =>
  Object.prototype.toString.call(x) === "[object Object]";

export class Children {
  blocks = [] as any[];
  update(indices) {
    this.blocks.splice(indices.length);
    return indices
      .map((d, i) => {
        this.blocks[i] = this.blocks[i] || new Block();
        this.blocks[i].update(d);
        return this.blocks[i].node;
      })
      .filter((x) => x);
  }
}

export const createElement = (type) => {
  if (["svg", "path"].includes(type)) {
    return document.createElementNS("http://www.w3.org/2000/svg", type);
  }
  try {
    return document.createElement(type);
  } catch {
    return document.createElement("div");
  }
};
