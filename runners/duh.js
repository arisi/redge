#!/usr/bin/env node

const yargs = require('yargs')
rt0s = require('rt0s_js');

var tick = 0;
const argv = yargs
  .command('duh.js', 'Runner Tester', {})
  .option('name', {
    description: 'Broker Id',
    type: 'string'
  })
  .option('id', {
    description: 'Broker Id',
    type: 'string',
  })
  .option('args', {
    description: 'args',
    type: 'string',
  })
  .option('rt0s', {
    alias: 'r',
    description: 'rt0s broker to use',
    type: 'string',
  })
  .help()
  .alias('help', 'h').argv;

if (!argv.name || !argv.id) {
  console.error("Need to give name and id");
  process.exit(-1);
}

mq = new rt0s(argv.rt0s, argv.id, "demo", "demo");
console.log('duh Connected to Broker at', argv.rt0s);

sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
}
if (argv.args) {
  for (var [k,v] of Object.entries(JSON.parse(argv.args))) {
    console.log("puttin args",k,v);
    argv.k = v;
  }
}
console.log("exitin...", JSON.stringify(argv));
process.stderr.write("ERR\n")
console.log("now");
process.exit(-3);

// setInterval(() => {
//   console.log("duh tick", argv.name, tick++);
//   process.exit(-2);
// },1000)

