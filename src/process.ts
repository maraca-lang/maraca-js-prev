import { sortMultiple } from "./utils";

const obj = {};

class Queue {
  private queue: Set<any> | null = null;
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

  constructor(queue: Queue, initial) {
    const push = (v) => {
      this.value = { ...v, push };
      queue.add(this.listeners);
    };
    this.value = { ...initial, push };
  }

  addListener(x) {
    this.listeners.add(x);
  }
  removeListener(x) {
    if (this.listeners.has(x)) this.listeners.delete(x);
  }
  cancel() {}
}

export class Stream {
  listeners = new Set<any>();
  index;
  value = null;
  start;
  update;
  stop;
  onChange;
  pushable;

  constructor(queue: Queue, index, run) {
    this.index = index;
    this.start = () => {
      let firstUpdate = true;
      const disposers = [];
      const push = (v) => {
        this.value = this.pushable ? { ...v, push } : v;
        if (!firstUpdate) {
          if (this.onChange) this.onChange(this.value);
          queue.add(this.listeners);
        }
      };
      const update = run(push, (d) => disposers.push(d));

      let active = new Set<any>();
      const get = (s) => {
        s.addListener(this);
        active.add(s);
        return s.value;
      };
      const creator = new Creator(queue, index);
      if (update) update(get, creator.create);
      firstUpdate = false;

      this.update = () => {
        const prevActive = active;
        active = new Set();
        creator.reset();
        if (update) update(get, creator.create);
        for (const s of prevActive) {
          if (!active.has(s)) s.removeListener(this);
        }
      };
      this.stop = () => {
        queue.remove(this);
        for (const s of active.values()) s.removeListener(this);
        active = new Set();
        disposers.forEach((d) => d());
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
  create = (run) => {
    if (typeof run !== "function") return new SourceStream(this.queue, run);
    return new Stream(this.queue, [...this.base, this.counter++], run);
  };
  reset() {
    this.counter = 0;
  }
}

class StaticStream {
  run;
  value = null;
  hasRun = false;
  constructor(run) {
    if (typeof run === "function") {
      this.run = run;
    } else {
      this.value = run;
      this.hasRun = true;
    }
  }
  get() {
    if (this.hasRun) return this.value;
    const disposers = [];
    const update = this.run(
      (v) => {
        this.value = v;
      },
      (d) => disposers.push(d)
    );
    const get = (s) => s.get();
    if (update) {
      update(get, (run) => new StaticStream(run));
      disposers.forEach((d) => d());
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
  const creator = new Creator(queue, []);
  const stream = build(creator.create);
  stream.addListener(output);
  output(stream.value);
  return () => stream.removeListener();
};
