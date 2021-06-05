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
  map=<(
    inline
    size=20 height="1.5" font=Arial bold italic strike color
    pad fill cursor
    input placeholder
    hover focus click
    *other
  )=>
    {
      textStyle=@style
      base=<
        hover+=(@onmouseenter | true)
        hover+=(@onmouseleave | "")
        focus+=(@onfocus | true)
        focus+=(@onblur | "")
        click+=(@onclick | true)
        style=<
          "font-size"="{@size}px"
          "line-height"=[@height "{@height}[(@height > 3) "px"]"]
          "font-family"=@font
          "font-weight"=[@bold bold]
          "font-style"=[@italic italic]
          padding=@pad
          color=@color
          background=@fill
          cursor=@cursor
          outline=none
          "text-decoration"=[@strike "line-through"]
          "user-select"=[(@cursor = pointer) none]
        >
      >
      [
        @input <input value=(@other.1) placeholder=@placeholder =@base>
      ]
      nextInline={@inline (@hasValues.@other)}
      content=(@other.<(x)=>>
        [
          (@isBlock.@x)
          (@map.<inline=@nextInline size={(@x.size) @size} height={(@x.height) @height} =@x>)
          =>@x
        ]
      >)
      gap=(([(@height > 3) @height =>(@height * @size)] - @size) * "0.5" + 1)
      [
        @inline
        <span =@content =@base>
        =>[
          @nextInline
          <div
            =@base
            <div
              style=<padding="1px 0" "min-height"="{@size}px">
              <div
                style=<"margin-top"="{(-@gap)}px" "margin-bottom"="{(-@gap)}px">
                =@content
              >
            >
          >
          =><div =@content =@base>
        ]
      ]
    }
  >
  (@map.
    {
      newText=""
      tasks=<<text=X done="">>
      <
        <size=30 bold=true Todos>
        <
          input=true
          placeholder="Enter new task..."
          @newText
          pad=10px
          fill=[@focus orange =>gold]
        >
        <
          fill=red
          pad=10px
          cursor=pointer
          "Add task"
          tasks+=(@click | <=@tasks <text={@newText "hi"} done="">>)
          newText+=(@click | "")
        >
        (@tasks.<(task)=>>
          <
            pad=10px
            cursor=pointer
            fill=[@hover lightblue]
            strike=(@task.done)
            (@task.text)
            task.done+=(@click | (!(@task.done)))
          >
        >)
      >
    }
  )
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
};

document.head.innerHTML += `<style>
html {
  box-sizing: border-box;
}
*, *:before, *:after {
  box-sizing: inherit;
}

/* Displays for HTML 5 */
article, aside, audio, command, datagrid, details, dialog, embed, 
figcaption, figure, footer, header, hgroup, menu, nav, section, summary,
video, wbr {
	display: block;
}

bdi, figcaption, keygen, mark, meter, progress, rp, rt, ruby, time {
	display: inline;
}

/* Deprecated tags */
acronym, applet, big, center, dir, font, frame, frameset, noframes, s,
strike, tt, u, xmp {
	display: none;
}

/* Reset styles for all structural tags */
a, abbr, area, article, aside, audio, b, bdo, blockquote, body, button, 
canvas, caption, cite, code, col, colgroup, command, datalist, dd, del, 
details, dialog, dfn, div, dl, dt, em, embed, fieldset, figure, form,
h1, h2, h3, h4, h5, h6, head, header, hgroup, hr, html, i, iframe, img, 
input, ins, keygen, kbd, label, legend, li, map, mark, menu, meter, nav,
noscript, object, ol, optgroup, option, output, p, param, pre, progress,
q, rp, rt, ruby, samp, section, select, small, span, strong, sub, sup, 
table, tbody, td, textarea, tfoot, th, thead, time, tr, ul, var, video {
	background: transparent;
	border: 0;
	font-size: 100%;
	font: inherit;
	margin: 0;
	outline: none;
	padding: 0;
	text-align: left;
	text-decoration: none;
	vertical-align: baseline;
	z-index: 1;
}

/* Miscellaneous resets */
body {
	line-height: 1;
}

ol, ul {
	list-style: none;
}

blockquote, q {
	quotes: none;

}

blockquote:before, blockquote:after, q:before, q:after {
	content: '';
	content: none;
}

table {
	border-collapse: collapse;
	border-spacing: 0;
}
</style>`;

const root = document.createElement("div");
document.body.appendChild(root);
maraca(script, library, render(root));

// maraca(script, library, (data) => {
//   console.log(JSON.stringify(data, null, 2));
// });
