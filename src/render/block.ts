import { fromJs, toJs } from "../utils";

import { Node, TextNode } from "./node";
import { Children, createElement } from "./utils";

export default class Block {
  node;
  children = new Children();
  prev;
  update(data) {
    if (data !== this.prev) {
      this.prev = data;

      const type =
        data.type === "value"
          ? "text"
          : toJs(data, { "1": "string" })["1"] || "div";
      if (type !== this.node?.type) {
        this.node =
          type === "text" ? new TextNode() : new Node(createElement(type));
      }
      if (type === "text") {
        this.node.update(data);
      } else {
        const { value, hover, ...props } = toJs(data, {
          value: () => "string",
          hover: () => "boolean",
          style: { "*": "string" },
          "*": "string",
        });

        this.node.updateProps({
          ...props,
          value: value.value || "",
          oninput: value.push && ((e) => value.push(fromJs(e.target.value))),
          onmouseenter: hover.push && (() => hover.push(fromJs(true))),
          onmouseleave: hover.push && (() => hover.push(fromJs(false))),
        });

        const nodeChildren = this.children.update(data.content.slice(1));
        if (!props.innerHTML) this.node.updateChildren(nodeChildren);
      }
    }
  }
}
