import * as ohm from "ohm-js";

const grammar = `Maraca {

  start
    = space* value space*

  value
    = valuebase
    | string

  block
    = "<" space* (item space*)* ">"
    | "[" space* (item space*)* "]"
    | "{" space* (item space*)* "}"
  
  item
    = attr
    | func
    | content
  
  attr
    = text? "=" value

  func
    = params ("=>>>" | "=>>" | "=>") value -- multi
    | text? "=>" value -- single
  
  params
    = "(" space* (param space*)* ")"
  
  param
    = text "=" value -- default
    | text -- text

  content
    = valuebase
    | multi
  
  valuebase
    = block
    | expr
    | var
    | name
    | escape
  
  expr
    = "(" space* push space* ")"
  
  push
    = emit space* "->" space* var -- push
    | emit
  
  emit
    = sum space* "|" space* sum -- emit
    | sum

  sum
    = sum space* "+" space* dot -- sum
    | dot
  
  dot
    = dot space* "." space* value -- dot
    | value

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
    = "\\"" (block | multichunk)* "\\""
  
  multichunk
    = (multichar | escape)+

  multichar
    = ~("\\"" | "<" | "[" | "{" | "\\\\") any

  name
    = alnum+

  escape
    = "\\\\" any
}`;

const g = ohm.grammar(grammar);
const s = g.createSemantics();

s.addAttribute("ast", {
  start: (_1, a, _2) => a.ast,

  value: (a) => a.ast,

  block: (a, _1, b, _2, _3) => ({
    type: "block",
    bracket: a.sourceString,
    values: b.ast
      .filter((x) => !Array.isArray(x) && x.type === "attr")
      .reduce((res, x) => ({ ...res, [x.key]: x.value }), {}),
    content: b.ast
      .filter((x) => Array.isArray(x))
      .reduce((res, x) => [...res, ...x], []),
    func: b.ast.find((x) => !Array.isArray(x) && x.type === "func"),
  }),

  item: (a) => a.ast,

  attr: (a, _1, b) =>
    a.ast[0] ? { type: "attr", key: a.ast[0].value, value: b.ast } : [[b.ast]],

  func_multi: (a, b, c) => ({
    type: "func",
    mode: b.sourceString,
    params: a.ast,
    body: c.ast,
  }),

  func_single: (a, b, c) => ({
    type: "func",
    mode: b.sourceString,
    params: a.ast[0]?.value,
    body: c.ast,
  }),

  params: (_1, _2, b, _3, _4) => b.ast,

  param_default: (a, _1, b) => ({ key: a.ast.value, def: b.ast }),

  param_text: (a) => ({ key: a.ast.value }),

  content: (a) => (Array.isArray(a.ast) ? a.ast : [a.ast]),

  valuebase: (a) => a.ast,

  expr: (_1, _2, a, _3, _4) => a.ast,

  push_push: (a, _1, _2, _3, b) => ({
    type: "push",
    nodes: [a.ast, b.ast],
  }),
  push: (a) => a.ast,

  emit_emit: (a, _1, _2, _3, b) => ({
    type: "emit",
    nodes: [a.ast, b.ast],
  }),
  emit: (a) => a.ast,

  sum_sum: (a, _1, _2, _3, b) => ({
    type: "map",
    func: "+",
    nodes: [a.ast, b.ast],
  }),
  sum: (a) => a.ast,

  dot_dot: (a, _1, _2, _3, b) => ({
    type: "dot",
    nodes: [a.ast, b.ast],
  }),
  dot: (a) => a.ast,

  var: (_1, a) => ({ type: "var", name: a.ast.value }),

  text: (a) => a.ast,

  string: (_1, a, _2) => ({ type: "value", value: a.sourceString }),

  stringchar: (a) => ({ type: "value", value: a.sourceString }),

  multi: (_1, a, _2) =>
    a.ast.length === 0 ? [{ type: "value", value: "" }] : a.ast,

  multichunk: (a) => ({ type: "value", value: a.sourceString }),

  multichar: (a) => ({ type: "value", value: a.sourceString }),

  name: (a) => ({ type: "value", value: a.sourceString }),

  escape: (_1, a) => ({ type: "value", value: a.sourceString }),
});

export default (script) => {
  const m = g.match(script);
  if (m.failed()) throw new Error("Parser error");
  return s(m).ast;
};
