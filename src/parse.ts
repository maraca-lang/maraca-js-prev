import * as ohm from "ohm-js";

import { fromJs } from "./utils";

const grammar = `Maraca {

  start
    = space* value space*

  value
    = value "." valueinner -- dot
    | valueinner
  
  valueinner
    = valuebase
    | template

  block
    = "<" space* listOf<item, space+> space* ">"

  valueblock
    = "[" space* listOf<item, space+> space* "]"
    | "{" space* listOf<item, space+> space* "}"

  item
    = func
    | merge
    | attr
    | content

  func
    = params ("=>>>" | "=>>" | "=>") space* value -- multi
    | text? "=>" space* value -- single

  params
    = "(" space* listOf<param, space+> space* ")"

  param
    = text "=" value -- default
    | ("**" | "*") text -- rest
    | text -- text

  merge
    = listOf<text, "."> "+=" space* value

  attr
    = text? "=" space* value

  content
    = multi
    | value

  valuebase
    = block
    | valueblock
    | expr
    | not
    | minus
    | size
    | var
    | name
    | escape

  expr
    = "(" space* pipe space* ")"

  pipe
    = pipe space* "|" space* comp -- pipe
    | comp

  comp
    = comp space* ("<=" | ">=" | "<" | ">" | "!" | "=") space* sum -- comp
    | sum

  sum
    = sum space* ("+" | "-") space* prod -- sum
    | prod

  prod
    = prod space* ("*" | "/" | "%") space* pow -- prod
    | pow

  pow
    = pow space* "^" space* value -- pow
    | value

  not
    = "!" value

  minus
    = "-" value
  
  size
    = "#" value

  var
    = "@" text

  text
    = string
    | name

  string
    = "\\"" (stringchar | escape)* "\\""

  stringchar
    = ~("\\"" | "\\\\") any

  multi
    = "\\"" (block | multitemplate)* "\\""
  
  multitemplate
    = (valueblock | multichunk)+

  multichunk
    = (multichar | escape)+

  multichar
    = ~("\\"" | "<" | "[" | "{" | "\\\\") any

  template
    = "\\"" (valueblock | templatechunk)* "\\""

  templatechunk
    = (templatechar | escape)+

  templatechar
    = ~("\\"" | "[" | "{" | "\\\\") any

  name
    = alnum+

  escape
    = "\\\\" any
}`;

export const createNode = (type, nodes, values = {}) => ({
  type: "block",
  values: { type: fromJs(type), ...values },
  content: nodes,
});

const g = ohm.grammar(grammar);
const s = g.createSemantics();

const block = (a, _1, b, _2, _3) =>
  createNode("block", b.ast, { bracket: fromJs(a.sourceString) });

const map = (a, _1, b, _3, c) =>
  createNode("map", [a.ast, c.ast], { func: fromJs(b.sourceString) });

s.addAttribute("ast", {
  start: (_1, a, _2) => a.ast,

  value_dot: (a, _1, b) => createNode("dot", [a.ast, b.ast]),
  value: (a) => a.ast,

  valueinner: (a) => a.ast,

  block,

  valueblock: block,

  item: (a) => a.ast,

  func_multi: (a, b, _2, c) =>
    createNode("func", [c.ast], {
      mode: fromJs(b.sourceString),
      params: fromJs(a.ast, false),
    }),

  func_single: (a, b, _2, c) =>
    createNode("func", [c.ast], {
      mode: fromJs(b.sourceString),
      params: fromJs(a.ast[0]?.value),
    }),

  params: (_1, _2, b, _3, _4) => b.ast,

  param_default: (a, _1, b) =>
    fromJs({ key: fromJs(a.ast.value), def: b.ast }, false),

  param_rest: (a, b) => fromJs({ key: b.ast.value, rest: a.sourceString }),

  param_text: (a) => fromJs({ key: a.ast.value }),

  merge: (a, _1, _2, b) =>
    createNode("merge", [b.ast], { key: fromJs(a.ast.map((x) => x.value)) }),

  attr: (a, _1, _2, b) =>
    a.ast[0]
      ? createNode("attr", [b.ast], { key: fromJs(a.ast[0].value) })
      : createNode("unpack", [b.ast]),

  content: (a) => a.ast,

  valuebase: (a) => a.ast,

  expr: (_1, _2, a, _3, _4) => createNode("expr", [a.ast]),

  pipe_pipe: (a, _1, _2, _3, b) => createNode("pipe", [a.ast, b.ast]),
  pipe: (a) => a.ast,

  comp_comp: map,
  comp: (a) => a.ast,

  sum_sum: map,
  sum: (a) => a.ast,

  prod_prod: map,
  prod: (a) => a.ast,

  pow_pow: map,
  pow: (a) => a.ast,

  not: (_1, a) => createNode("map", [a.ast], { func: fromJs("!") }),

  minus: (_1, a) => createNode("map", [a.ast], { func: fromJs("-") }),

  size: (_1, a) => createNode("size", [a.ast]),

  var: (_1, a) => createNode("var", [], { name: fromJs(a.ast.value) }),

  text: (a) => a.ast,

  string: (_1, a, _2) => ({ type: "value", value: a.sourceString }),

  stringchar: (_) => null,

  multi: (_1, a, _2) =>
    a.ast.length === 0
      ? { type: "value", value: "" }
      : createNode("multi", a.ast),

  multitemplate: (a) => createNode("template", a.ast),

  multichunk: (a) => ({
    type: "value",
    value: a.sourceString.replace(/\\([\s\S])/g, (_, m) => m),
  }),

  multichar: (_) => null,

  template: (_1, a, _2) =>
    a.ast.length === 0
      ? { type: "value", value: "" }
      : createNode("template", a.ast),

  templatechunk: (a) => ({
    type: "value",
    value: a.sourceString.replace(/\\([\s\S])/g, (_, m) => m),
  }),

  templatechar: (_) => null,

  name: (a) => ({ type: "value", value: a.sourceString }),

  escape: (_1, a) => ({ type: "value", value: a.sourceString }),

  listOf: (a) => a.ast,
  nonemptyListOf: (a, _1, b) => [a.ast, ...b.ast],
  emptyListOf: () => [],
});

export default (script) => {
  const m = g.match(script);
  if (m.failed()) {
    console.error(m.message);
    throw new Error("Parser error");
  }
  return s(m).ast;
};
