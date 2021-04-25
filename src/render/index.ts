import { Node } from "./node";
import { Children } from "./utils";

export default (root) => {
  const node = new Node(root);
  const children = new Children();
  return (data) => {
    if (data) {
      node.updateChildren(children.update([data]));
    } else {
      node.updateChildren([]);
    }
  };
};
