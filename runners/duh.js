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

setInterval(() => {
  //console.log("duh tick", argv.name, tick++);
},1000)

