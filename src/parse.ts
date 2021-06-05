import * as ohm from "ohm-js";

const grammar = `Maraca {

  start
    = space* value space*

  value
    = valuebase
    | template

  block
    = "<" space* (item space*)* ">"

  valueblock
    = "[" space* (item space*)* "]"
    | "{" space* (item space*)* "}"

  item
    = attr
    | func
    | merge
    | content

  attr
    = text? "=" value

  func
    = params ("=>>>" | "=>>" | "=>") space* value -- multi
    | text? "=>" space* value -- single

  params
    = "(" space* (param space*)* ")"

  param
    = text "=" value -- default
    | "*" text -- rest
    | text -- text

  merge
    = text ("." text)* "+=" value

  content
    = valuebase
    | multi

  valuebase
    = block
    | valueblock
    | expr
    | var
    | name
    | escape

  expr
    = "(" space* pipe space* ")"

  pipe
    = pipe space* "|" space* not -- pipe
    | not

  not
    = "!" space* comp -- not
    | comp

  comp
    = comp space* ("<=" | ">=" | "<" | ">" | "!" | "=") space* sum -- comp
    | sum

  sum
    = sum space* ("+" | "-") space* prod -- sum
    | "-" space* prod -- minus
    | prod

  prod
    = prod space* ("*" | "/" | "%") space* pow -- prod
    | pow

  pow
    = pow space* "^" space* dot -- pow
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

const g = ohm.grammar(grammar);
const s = g.createSemantics();

const block = (a, _1, b, _2, _3) => ({
  type: "block",
  bracket: a.sourceString,
  values: b.ast
    .filter((x) => !Array.isArray(x) && x.type === "attr")
    .reduce((res, x) => ({ ...res, [x.key]: x.value }), {}),
  content: b.ast
    .filter((x) => Array.isArray(x))
    .reduce((res, x) => [...res, ...x], []),
  func: b.ast.find((x) => !Array.isArray(x) && x.type === "func"),
  merge: b.ast.filter((x) => !Array.isArray(x) && x.type === "merge"),
});

const map = (a, _1, b, _3, c) => ({
  type: "map",
  func: b.sourceString,
  nodes: [a.ast, c.ast],
});

s.addAttribute("ast", {
  start: (_1, a, _2) => a.ast,

  value: (a) => a.ast,

  block,

  valueblock: block,

  item: (a) => a.ast,

  attr: (a, _1, b) =>
    a.ast[0] ? { type: "attr", key: a.ast[0].value, value: b.ast } : [[b.ast]],

  func_multi: (a, b, _2, c) => ({
    type: "func",
    mode: b.sourceString,
    params: a.ast,
    body: c.ast,
  }),

  func_single: (a, b, _2, c) => ({
    type: "func",
    mode: b.sourceString,
    params: a.ast[0]?.value,
    body: c.ast,
  }),

  params: (_1, _2, b, _3, _4) => b.ast,

  param_default: (a, _1, b) => ({ key: a.ast.value, def: b.ast }),

  param_rest: (_1, a) => ({ key: a.ast.value, rest: true }),

  param_text: (a) => ({ key: a.ast.value }),

  merge: (a, _1, b, _2, c) => ({
    type: "merge",
    key: [a.ast, ...b.ast].map((x) => x.value),
    value: c.ast,
  }),

  content: (a) => (Array.isArray(a.ast) ? a.ast : [a.ast]),

  valuebase: (a) => a.ast,

  expr: (_1, _2, a, _3, _4) => a.ast,

  pipe_pipe: (a, _1, _2, _3, b) => ({
    type: "pipe",
    nodes: [a.ast, b.ast],
  }),
  pipe: (a) => a.ast,

  not_not: (_1, _2, a) => ({ type: "map", func: "!", nodes: [a.ast] }),
  not: (a) => a.ast,

  comp_comp: map,
  comp: (a) => a.ast,

  sum_sum: map,
  sum_minus: (_1, _2, a) => ({ type: "map", func: "-", nodes: [a.ast] }),
  sum: (a) => a.ast,

  prod_prod: map,
  prod: (a) => a.ast,

  pow_pow: map,
  pow: (a) => a.ast,

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

  multitemplate: (a) => ({ type: "template", nodes: a.ast }),

  multichunk: (a) => ({ type: "value", value: a.sourceString }),

  multichar: (a) => ({ type: "value", value: a.sourceString }),

  template: (_1, a, _2) => ({
    type: "template",
    nodes: a.ast.length === 0 ? [{ type: "value", value: "" }] : a.ast,
  }),

  templatechunk: (a) => ({ type: "value", value: a.sourceString }),

  templatechar: (a) => ({ type: "value", value: a.sourceString }),

  name: (a) => ({ type: "value", value: a.sourceString }),

  escape: (_1, a) => ({ type: "value", value: a.sourceString }),
});

export default (script) => {
  const m = g.match(script);
  if (m.failed()) throw new Error("Parser error");
  return s(m).ast;
};
