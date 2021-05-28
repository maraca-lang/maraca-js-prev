import maraca from "./index";
import render from "./render";

// const script = `(@tick | 10)`;
// const script = `<div @tick 2 3 \\@>`;
// const script = `{x=1 <div <input value=@x> @x>}`;
// const script = `<x=1 "test<blah>more" woop <x>>`;
// const script = `(<a=10 x=>(@x + @a)>.@tick)`;
// const script = `(@tick + 2)`;
// const script = `(<1 @tick 3>.2)`;
// const script = `(<(a b=20)=>(@a + @b)>.<10>)`;
// const script = `(<(v)=>>(@v + 1)>.<1 2 3>)`;
// const script = `(<(res v)=>>>(@res + @v)>.<1 2 3>)`;
// const script = `<1 a=1 =<2 3 4 b=2>>`;

const script = `
{
  tasks=<A B C>
  <div
    <h1 Todos>
    {
      focus=""
      <input
        onfocus=(true | @focus)
        onblur=("" | @focus)
        placeholder="Enter new task..."
        style=<padding=10px background=[@focus orange =>gold] outline=none>
      >
    }
    =(@tasks.<(task)=>>
      {
        done=""
        hover=""
        <div
          onmouseenter=(true | @hover)
          onmouseleave=("" | @hover)
          style=<
            padding=10px
            cursor=pointer
            background=[@hover lightblue]
            "text-decoration"=[@done "line-through"]
          >
          @task
        >
      }
    >)
  >
}
`;

const library = {
  tick: (set) => {
    let count = 1;
    set({ type: "value", value: `${count++}` });
    const interval = setInterval(
      () => set({ type: "value", value: `${count++}` }),
      1000
    );
    return (dispose) => dispose && clearInterval(interval);
  },
};

const root = document.createElement("div");
document.body.appendChild(root);
maraca(script, library, render(root));

// maraca(script, library, (data) => {
//   console.log(JSON.stringify(data, null, 2));
// });

// operators
