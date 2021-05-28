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
        const { value, onmouseenter, onmouseleave, onfocus, onblur, ...props } =
          toJs(data, {
            value: () => "string",
            onmouseenter: () => "boolean",
            onmouseleave: () => "boolean",
            onfocus: () => "boolean",
            onblur: () => "boolean",
            style: { "*": "string" },
            "*": "string",
          });

        this.node.updateProps({
          ...props,
          value: value.value || "",
          oninput: value.push && ((e) => value.push(fromJs(e.target.value))),
          onmouseenter:
            onmouseenter.push && (() => onmouseenter.push(fromJs(true))),
          onmouseleave:
            onmouseleave.push && (() => onmouseleave.push(fromJs(true))),
          onfocus: onfocus.push && (() => onfocus.push(fromJs(true))),
          onblur: onblur.push && (() => onblur.push(fromJs(true))),
        });

        const nodeChildren = this.children.update(data.content.slice(1));
        if (!props.innerHTML) this.node.updateChildren(nodeChildren);
      }
    }
  }
}
