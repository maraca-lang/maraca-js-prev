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
  map=<(inline pad color fill hover *other)=>
    <
      [@inline span =>div]
      =(@other.<(x)=>>{(@map.@x) @x}>)
      style=<padding=@pad color=@ background=@fill>
      onmouseenter=(true | @hover)
      onmouseleave=("" | @hover)
    >
  >
  (@map.
    <hello
      color=white
      fill=red
      <
        inline=true
        fill=[@hover lightgreen =>green]
        world
      >
    >
  )
}
`;

// const script = `
// {
//   newtext=""
//   tasks=<<done="" text=world>>
//   <div
//     <h1 Todos>
//     {
//       focus=""
//       <input
//         value=@newtext
//         onfocus=(true | @focus)
//         onblur=("" | @focus)
//         placeholder="Enter new task..."
//         style=<padding=10px background=[@focus orange =>gold] outline=none>
//       >
//     }
//     <p
//       "Add task"
//       style=<background=lightgreen padding=10px>
//       onclick=(<=@tasks <done="" text=@newtext>> | @tasks)
//     >
//     =(@tasks.<(task)=>>
//       {
//         hover=""
//         <div
//           onmouseenter=(true | @hover)
//           onmouseleave=("" | @hover)
//           (@task.text)
//           onclick=((! @task.done) | (@task.done))
//           style=<
//             padding=10px
//             cursor=pointer
//             background=[@hover lightblue]
//             "text-decoration"=[(@task.done) "line-through"]
//           >
//         >
//       }
//     >)
//   >
// }
// `;

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
