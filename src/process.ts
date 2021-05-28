import { mapObject, sortMultiple } from "./utils";

const obj = {};

class Queue {
  private queue: Set<any> | null = new Set();
  add(streams: Set<any>) {
    const first = !this.queue;
    if (first) this.queue = new Set();
    for (const s of streams) {
      if (s.index) this.queue!.add(s);
    }
    if (first) setTimeout(() => this.next());
  }
  remove(stream) {
    if (this.queue && this.queue.has(stream)) this.queue.delete(stream);
  }
  next() {
    if (this.queue && this.queue.size > 0) {
      const next = [...this.queue].sort((a, b) =>
        sortMultiple(a.index, b.index, (x, y) => x - y, true)
      )[0];
      this.queue.delete(next);
      next.update();
      this.next();
    } else {
      this.queue = null;
    }
  }
}

export class SourceStream {
  listeners = new Set<any>();
  value = null;

  constructor(queue: Queue, run) {
    let firstUpdate = true;
    run((v) => {
      this.value = v;
      if (!firstUpdate) queue.add(this.listeners);
    });
    firstUpdate = false;
  }

  addListener(x) {
    this.listeners.add(x);
  }
  removeListener(x) {
    if (this.listeners.has(x)) this.listeners.delete(x);
  }
}

const nilValue = { type: "value", value: "" };
const resolveType = (data, getValue) => {
  const d = data || nilValue;
  if (d.type === "stream") return resolveType(getValue(d.value), getValue);
  if (d.type === "block") {
    let values = {};
    const content = d.content.reduce((res, x) => {
      if (!Array.isArray(x)) return [...res, x];
      const v = resolveType(x[0], getValue);
      if (v.type !== "block") return res;
      values = { ...values, ...v.values };
      return [...res, ...v.content];
    }, []);
    return { ...d, values: { ...values, ...d.values }, content };
  }
  return d;
};
const resolve = (data, getValue) => {
  const d = resolveType(data, getValue);
  if (d.type === "block") {
    return {
      ...d,
      values: mapObject(d.values, (v) => resolve(v, getValue)),
      content: d.content.map((c) => resolve(c, getValue)),
    };
  }
  return d;
};

export class Stream {
  listeners = new Set<any>();
  index;
  value = null;
  start;
  update;
  stop;
  onChange;

  constructor(queue: Queue, index, run) {
    this.index = index;
    this.start = () => {
      let active = new Set<any>();
      const creator = new Creator(queue, index);
      let firstUpdate = true;
      let isUpdating = true;
      const getValue = (s) => {
        if (isUpdating) {
          active.add(s);
          s.addListener(this);
        }
        return s.value;
      };
      const update = run(
        (v) => {
          this.value = v;
          if (!firstUpdate) {
            if (this.onChange) this.onChange(v);
            queue.add(this.listeners);
          }
        },
        (s, deep) => (deep ? resolve(s, getValue) : resolveType(s, getValue)),
        (...args) => (creator.create as any)(...args)
      );
      if (update) update();
      isUpdating = false;
      firstUpdate = false;
      this.update = () => {
        isUpdating = true;
        const prevActive = active;
        active = new Set();
        creator.reset();
        if (update) update();
        for (const s of prevActive) {
          if (!active.has(s)) s.removeListener(this);
        }
        isUpdating = false;
      };
      this.stop = () => {
        queue.remove(this);
        for (const s of active.values()) s.removeListener(this);
        active = new Set();
        if (update && update.length === 1) update(true);
      };
    };
  }

  addListener(x?) {
    if (typeof x === "function") this.onChange = x;
    if (this.listeners.size === 0) this.start();
    this.listeners.add(typeof x === "function" ? obj : x);
  }
  removeListener(x = obj) {
    delete this.onChange;
    if (this.listeners.has(x)) {
      this.listeners.delete(x);
      if (this.listeners.size === 0) this.stop();
    }
  }
  cancel() {
    if (this.listeners.size > 0) {
      this.listeners = new Set();
      this.stop();
    }
  }
}

class Creator {
  queue;
  base;
  counter = 0;
  constructor(queue, base) {
    this.queue = queue;
    this.base = base;
  }
  create(run, source = false) {
    if (source) return new SourceStream(this.queue, run);
    return new Stream(this.queue, [...this.base, this.counter++], run);
  }
  reset() {
    this.counter = 0;
  }
}

class StaticStream {
  run;
  value = null;
  hasRun = false;
  constructor(run) {
    this.run = run;
  }
  get() {
    if (this.hasRun) return this.value;
    const update = this.run(
      (v) => {
        this.value = v;
      },
      (s) => s.get(),
      (run) => new StaticStream(run)
    );
    if (update) {
      update();
      if (update.length === 1) update(true);
    }
    this.hasRun = true;
    return this.value;
  }
}

export default (build, output?) => {
  if (!output) {
    return build((run) => new StaticStream(run)).get();
  }
  const queue = new Queue();
  const creator = new Creator(queue, []) as any;
  const stream = build((...args) => creator.create(...args));
  let hasOutput = false;
  const outputWrap = (v) => {
    hasOutput = true;
    output(v);
  };
  stream.addListener(outputWrap);
  queue.next();
  if (!hasOutput) output(stream.value);
  return () => stream.removeListener();
};
