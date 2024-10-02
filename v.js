const JSON5 = require('json5');

let validator = {
  set: function(target, key, value) {
    console.log(`SET: ${key} => ${JSON5.stringify(value)}`, target);
    target[key] = value;
    return true;
  },
  apply(target, thisArg, args) {
    console.log(`APPLY: ${thisArg} => ${JSON5.stringify(args)}`);
    target.apply(thisArg, args);
  },
  get(target, key) {
    console.log(`GET: ${key} => ${JSON5.stringify(target[key])}`);
    if (typeof target[key] === 'object' && target[key] !== null) {
      return new Proxy(target[key], validator)
    } else {
      return target[key];
    }
  },
  // get(target, key) {
  //   console.log(`GET: ${key} => ${JSON5.stringify(target[key])}`);
  //   if (key in target) {
  //     return target[key];
  //   } else {
  //     return undefined;
  //   }
  // }
};
let store = new Proxy({}, validator);
store.a = 'hello';
store.c = {};
store.c[1]=12;
console.log("***");
store.c[1]=222;
console.log("***");
eval("store.b = { x: 12 }");
console.log("duh?", store.a);
console.log("duh2?", store.b.x);
console.log("duh3?", "a" in store);
console.log("duh all?", store);
let z = {}
z.b = { x: 12 };
z.b['x'] = 123;