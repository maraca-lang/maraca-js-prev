import maraca from "./index";

const script = `(tick | 10)`;
// const script = `#<1 2 a=2 b=4>`;
// const script = `<"div" tick 2 3 \\@>`;
// const script = `{x=1 <"div" <"input" value=x> x>}`;
// const script = `<x=1 "test<"blah">more" "woop" <x>>`;
// const script = `<a=10 x=>(x + a)>.tick`;
// const script = `(tick + 2)`;
// const script = `<1 tick 3>.2`;
// const script = `<(a b=20)=>(a + b)>.<10>`;
// const script = `<(v)=>>(v + 1)>.<1 2 3>`;
// const script = `<(res v)=>>>(res + v)>.<1 2 3>`;
// const script = `<1 a=1 =<2 3 4 b=2>>`;

const library = {
  tick: (set, onDispose) => {
    let count = 1;
    set({ type: "value", value: `${count++}` });
    const interval = setInterval(() => {
      set({ type: "value", value: `${count++}` });
    }, 1000);
    onDispose(() => clearInterval(interval));
  },
};

maraca(script, library, (data) => {
  console.log(JSON.stringify(data, null, 2));
});
