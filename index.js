#!/usr/bin/env node

const fs = require('fs')
const yargs = require('yargs')
const os = require('os')
const JSON5 = require('json5');
const log = console.log.bind(console);

const redge_serial = require("./redge_serial")
const redge_mqtt_service = require("./redge_mqtt_service")
const redge_web_service = require("./redge_web_service")
const redge_runner_service = require("./redge_runner_service")

stamp = () => {
  return (new Date).getTime();
}
sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
}

var hostname = os.hostname().replace('\.', '_').replace('-', '_');

const argv = yargs
  .command('mq11_broker.js', 'MQ11 MQTT Broker', {})
  .option('id', {
    description: 'Broker Id',
    type: 'string',
    default: `${hostname}_edge`
  })
  .option('schema', {
    description: 'Base Schema json5',
    type: 'string',
    default: `base_mqtt.json5`
  })
  .option('rt0s', {
    alias: 'r',
    description: 'rt0s broker to use',
    type: 'string',
  })
  .option('conf', {
    description: 'Config file to use',
    type: 'string',
    default: `./default_web.json5`
  })
  .option('log_dir', {
    description: 'Logging directory, ""=> no logging',
    type: 'string',
    default: ""
  })
  .option('scan', {
    description: 'Scan Serial ports',
    type: 'boolean',
    default: false
  })
  .option('serial_path', {
    description: 'Limit Serial Ports to Path Pattern',
    type: 'string',
    default: ""
  })
  .option('serial_sernos', {
    description: 'Limit Serial Ports by serialNumber (comma separated list of sernos)',
    type: 'string',
    default: ""
  })
  .option('serial_vendor', {
    description: 'Limit Serial Ports to Vendor Id (hex)',
    type: 'string',
    default: ""
  })
  .option('serial_product', {
    description: 'Limit Serial Ports to Product Id (hex) and vendor id',
    type: 'string',
    default: ""
  })
  .help()
  .alias('help', 'h').argv;

try {
  var conf = JSON5.parse(fs.readFileSync(argv.conf))
} catch (error) {
  console.error(error)
  console.error(`Config file ${argv.conf} missing`)
  process.exit(-1)
}

var web_conf = {}
var MQ = conf.sockets.find(s => s.name == 'wss')
if (MQ) {
  web_conf = {
    mqtt: `wss://${MQ.url}:${MQ.port}`
  }
  console.log("MQTT", web_conf);
} else {
  console.error("No wss defined for secure web access");
  var MQ = conf.sockets.find(s => s.name == 'ws')
  if (MQ) {
    web_conf = {
      mqtt: `ws://${MQ.url}:${MQ.port}`
    }
    console.log("MQTT WS", web_conf);
  } else {
    console.error("No ws defined for web access");
    process.exit(-1)
  }
}

if (!conf.web_home) {
  console.log("no web_home in config, using pwd");
  conf.web_home = process.cwd()
}

console.log("\nRt0s Edge Services Starting (redge) ..\n");
if (!argv.rt0s) {
  var MQ = conf.sockets.find(s => s.name == 'mqtt')
  if (MQ) {
    argv.rt0s = `mqtt://${MQ.url}:${MQ.port}`
    console.log("MQTT Service Provided and Used:", argv.rt0s);
  } else {
    argv.rt0s = 'wss://rt0s.com:8080';
    console.error("No mqtt defined, using rt0s.com Service", argv.rt0s);
  }
}

(async () => {
  if (argv.scan) {
    console.log("Scanning Serial Ports:");
    await redge_serial.scan();
    process.exit(0);
  }
  redge_serial.config(argv);
  redge_serial.poll();
  aedes = redge_mqtt_service.config(argv, conf)
  redge_web_service.config(argv, conf, web_conf, aedes)
  redge_runner_service.config(argv, conf, web_conf)

})();