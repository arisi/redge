#!/usr/bin/env node

const fs = require('fs')
const yargs = require('yargs')
const os = require('os')
const JSON5 = require('json5');
rt0s = require('rt0s_js');
var { AsciiTable3, AlignmentEnum } = require('ascii-table3');

var term = true
const argv = yargs
  .option('rt0s', {
    alias: 'r',
    description: 'rt0s broker to use',
    default: 'mqtt://localhost:8091',
    type: 'string'
  })
  .option('id', {
    alias: 'i',
    description: 'rt0s node id',
    type: 'string',
    default: 'cli'
  })
  .option('exec', {
    description: 'exec a command',
    type: 'string',
  })
  .help()
  .alias('help', 'h').argv;
function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
var stamp = () => {
  return Date.now()
}
var dump_devs = () => {
  var devs = []
  for (var [d, o] of Object.entries($_.devices)) {
    console.log(d, o);
    devs.push([d, o.serno || ''])
  }
  var table = new AsciiTable3()
    .setHeading('Id', 'Serno')
    .addRowMatrix(devs);
  console.log(table.toString());
}

(async () => {
  mq = new rt0s(argv.rt0s, argv.id, "demo", "demo");
  console.log('Connected to Broker at', argv.rt0s);
  $_ = { devices: {} }
  $$ = (cpu_id) => {
    if (!cpu_id) {
      dump_devs()
      return
    }
    var dev;
    if ($_.devices[cpu_id])
      dev = cpu_id;
    else {
      dev = Object.keys($_.devices).find(key => $_.devices[key].serno == cpu_id)
      if (!dev) {
        dev = Object.keys($_.devices).find(key => $_.devices[key].cpu_id == cpu_id)
      }
    }
    if (!dev) {
      dump_devs()
      return
    }
    return $_.devices[dev].handler
  }
  var helper = (key) => {
    //console.log($_.devices[key].api);
    var cmds = []
    for (var a of $_.devices[key].api) {
      if (a.cmd == 'identity') continue;
      var params = []
      for (var aa of a.args) {
        if (aa.size)
          params.push(`${aa.name}:${aa.size}`)
        else if (aa.type)
          params.push(`${aa.name}:${aa.type}`)
        else
          params.push(aa.name)
      }
      cmds.push([a.cmd, a.descr, params.join()])
    }
    var table = new AsciiTable3()
      .setHeading('Cmd', 'Descr', 'Args')
      .addRowMatrix(cmds);
    console.log(table.toString());
    return
  }
  duh = true;

  mq.req_ind("broker", 'state', async (a, b) => {
    for (var con of Object.keys(b.cons)) {
      if (!$_.devices[con]) {
        try {
          var c = b.cons[con];
          try {
            var api = await mq.req_sync(con, ['api', {}], {})
          } catch (error) {
            console.log("no api from", con);
            continue;
          }
          var handler = {}
          for (var a of api) {
            var args = []
            var params = []
            for (var aa of a.args) {
              args.push(aa.name)
              params.push(`"${aa.name}":${aa.name}`)
            }
            var s = `async (${args.join()}) => { return mq.req_sync("${con}", ['${a.cmd}',{${params}}], {}) }`
            handler[a.cmd] = eval(s)
          }
          var s = `() => { return helper("${con}") }`
          handler.help = eval(s)

          $_.devices[con] = {
            connected: c.connected,
            api,
            handler,
          }


          //console.log("NEW DEVICE", con);
        } catch (error) {
          console.log("tout caught", con, error);
        }
        if (b.cons[con].indications.identity) {
          var o = b.cons[con].indications.identity;
          if ($_.devices[con]) {
            if ($_.devices[con].af != o.af) {
              $_.devices[con].serno = o.serno
              $_.devices[con].af = o.af
              // if (o.af) {
              //   o.syms = JSON5.parse(await getSync(`artefact/${o.af}/syms.json5`));
              //   o.hws = JSON5.parse(await getSync(`artefact/${o.af}/hw.json5`));
              // }
              // emit_button_event('DEVICE_UPDATED', {con, ...$_.devices[con]});
            }
          }
        }
        if (b.cons[con].indications.ping) {
          var o = b.cons[con].indications.ping;
          //console.log("PINKI",o);
          if ($_.devices[con]) {
            $_.devices[con].tick = o.tick
            $_.devices[con].tsent = o.sent
          }
        }
      }
      for (var dev of Object.keys($_.devices)) {
        if (!b.cons[dev]) {
          console.log("lost", dev);
          delete $_.devices[dev]
        }
      }
    }
    if (process.env.RUN && duh) {
      console.log(`\nexec: '${process.env.RUN}':`);
      duh=false
      console.log(await eval(process.env.RUN))
      process.exit()
    }
    if (argv.exec && duh) {
      console.log(`\nexec ${duh}: '${argv.exec}':`);
      duh=false
      console.log(await eval(argv.exec))
      process.exit()
    }
  });

})()

module.exports = {
  $$,
  $_,
}