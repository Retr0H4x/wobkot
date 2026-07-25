importScripts("misc.js");

var transfer = [];

const api = {};

api.ping = function () {
  return "pong";
};

api.register = function (name, fn) {
  if (typeof fn !== "string") {
    throw new Error(`${fn} not a string !!`);
  }

  if (name in api) {
    throw new Error(`${name} already registered !!`);
  }

  api[name] = new Function(`return (${fn})`)();
};

api.init = function (name) {
  self.name = name;

  version.init();
  switch (version.console) {
    case 4:
      importScripts("ps4/constants.js", "ps4/userland.js");
      break;
    case 5:
      //TODO
      break;
    default:
      throw new Error(`Unsupported console ${version.console}`);
  }

  self.leak = arw.leak;
  self.victim = arw.victim;

  return true;
};

api.setup = function () {
  arw.master = master;
  arw.leak_addr = new BInt(leak_addr);

  init_arw();
  init_rop();
  init_syscalls();
};

let queue = Promise.resolve();

self.onmessage = (e) => {
  queue = queue.then(async () => {
    try {
      const { name, args = [] } = e.data || {};

      const fn = api[name];

      if (typeof fn !== "function") {
        throw new Error(`Unknown function ${name} !!`);
      }

      const ret = await fn(...args);

      self.postMessage({ type: "ret", value: ret }, transfer);
    } catch (err) {
      self.postMessage({ type: "err", value: err });
    }
  });
};
