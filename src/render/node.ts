import { isObject } from "./utils";

const kebabToCamel = (s) => {
  let v = s;
  if (v[0] === "-") {
    v = v.slice(1);
    if (!v.startsWith("ms-")) v = `${v[0].toUpperCase()}${v.slice(1)}`;
  }
  return v
    .split("-")
    .map((x, i) => (i === 0 ? x : `${x[0].toUpperCase()}${x.slice(1)}`))
    .join("");
};

const attributesMap = {
  accesskey: "accessKey",
  bgcolor: "bgColor",
  class: "className",
  colspan: "colSpan",
  contenteditable: "contentEditable",
  crossorigin: "crossOrigin",
  dirname: "dirName",
  inputmode: "inputMode",
  ismap: "isMap",
  maxlength: "maxLength",
  minlength: "minLength",
  novalidate: "noValidate",
  readonly: "readOnly",
  referrerpolicy: "referrerPolicy",
  rowspan: "rowSpan",
  tabindex: "tabIndex",
};

const diffObjs = (next, prev) => {
  const result = {};
  Array.from(
    new Set([...Object.keys(next), ...Object.keys(prev || {})])
  ).forEach((k) => {
    if (next[k] !== (prev || {})[k]) {
      result[k] = isObject(next[k])
        ? diffObjs(next[k], (prev || {})[k])
        : next[k];
    }
  });
  return result;
};

const applyObj = (target, obj, first) => {
  Object.keys(obj).forEach((k) => {
    if (!isObject(obj[k])) {
      const key = first ? attributesMap[k] || k : k;
      try {
        if (["svg", "path"].includes(target.tagName?.toLowerCase())) {
          target.setAttribute(key, obj[k] === undefined ? null : obj[k]);
        } else if (
          Object.prototype.toString.call(target) ===
          "[object CSSStyleDeclaration]"
        ) {
          target[kebabToCamel(k)] = obj[k] === undefined ? null : obj[k];
        } else {
          target[key] = obj[k] === undefined ? null : obj[k];
        }
      } catch {}
    } else {
      applyObj(target[k], obj[k], false);
    }
  });
  return target;
};

export class TextNode {
  type = "text";
  node = document.createTextNode("");
  update(data) {
    this.node.textContent = data.value;
  }
}

export class Node {
  node;
  type;
  props;
  constructor(node) {
    this.node = node;
    this.type = node.nodeName.replace("#", "").toLowerCase();
  }
  updateProps(props) {
    applyObj(this.node, diffObjs(props, this.props || {}), true);
    this.props = props;
  }
  updateChildren(nodes) {
    const prev = [...this.node.childNodes];
    const next = nodes.map((n) => n.node);
    for (let i = 0; i < Math.max(prev.length, next.length); i++) {
      if (!next[i]) {
        this.node.removeChild(prev[i]);
      } else {
        if (!prev[i]) {
          this.node.appendChild(next[i]);
        } else if (next[i] !== prev[i]) {
          this.node.replaceChild(next[i], prev[i]);
        }
      }
    }
  }
}
