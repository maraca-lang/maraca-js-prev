import maraca, { fromJs, isNil, toJs } from "./index";
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
  map=<(inline size height font style pad color fill hover *other)=>
    {
      nextInline=(@hasValues.@other)
      textStyle=@style
      <
        [@inline span =>div]
        =(@other.<(x)=>>[(@isBlock.@x) (@map.<inline=@nextInline =@x>) =>@x]>)
        style=<
          fontSize=(@size & "px")
          lineHeight=[@height (@height & [@size (@height > @size) "px"])]
          fontFamily=@font
          =(@fontStyles.@textStyle)
          padding=@pad
          color=@
          background=@fill
        >
        onmouseenter=(true | @hover)
        onmouseleave=("" | @hover)
      >
    }
  >
  (@map.
    <
      size=20
      height="1.5"
      font=Arial
      style="bold italic"
      color=white
      fill=red
      hello
      <
        style=" "
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
  isBlock: {
    type: "built",
    value: fromJs((value) => fromJs(value.type === "block")),
  },
  hasValues: {
    type: "built",
    value: fromJs((value) =>
      fromJs(value.content.some((x) => x.type === "value"))
    ),
  },
  fontStyles: {
    type: "built",
    value: fromJs((value) => {
      if (isNil(value)) return { type: "block", values: {}, content: [] };
      const values = {
        fontWeight: fromJs("normal"),
        fontStyle: fromJs("normal"),
      } as any;
      for (const v of (toJs(value, "string") || "").split(" ")) {
        if (v === "bold") values.fontWeight = fromJs("bold");
        if (v === "italic") values.fontStyle = fromJs("italic");
      }
      return { type: "block", values, content: [] };
    }),
  },
};

const root = document.createElement("div");
document.body.appendChild(root);
maraca(script, library, render(root));

// maraca(script, library, (data) => {
//   console.log(JSON.stringify(data, null, 2));
// });
