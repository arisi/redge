const fs = require('fs')
const os = require('os')
const sprintf = require('sprintf')
const JSON5 = require('json5');
const path = require('path')
const chokidar = require('chokidar');
const log = console.log.bind(console);
var { AsciiTable3, AlignmentEnum } = require('ascii-table3');
const { spawn, execSync } = require('child_process');

var aedes;
var conf;
var web_conf
var runners
const home_dir = os.homedir();
const pwd = process.cwd()

timed = (d) => {
  var dd = d || 0
  if (dd < 60 * 60)
    return sprintf("%d:%02d", dd / 60, dd % 60)
  else
    return sprintf("%d:%02d:%02d", dd / 3600, (dd / 60) % 60, dd % 60)
}

uuidv4 = () => {
  var result, i, j
  result = ''
  for (j = 0; j < 32; j++) {
    if (j == 8 || j == 12 || j == 16 || j == 20) result = result + '-'
    i = Math.floor(Math.random() * 16).toString(16).toUpperCase()
    result = result + i
  }
  return result
}

do_runner = (name, r) => {
  s = `--name ${name} --id ${r.id} --rt0s ${argv.rt0s}`;
  console.log("runner", r.bin, s);

  runners[name].runs += 1;
  runners[name].start = stamp();
  const child = spawn(r.bin, s.split(' '));
  var sss = ""
  child.stdout.on('data', (s) => {
    sss += s.toString().replace('\r', '')
    if (sss.indexOf('\n') != -1) {
      for (var ss of sss.split('\n'))
        if (ss.length > 1) {
          log(`>>${ss}`)
        }
      sss = ""
    }
  });
  runners[name].child = child;

  child.stderr.on('data', (data) => {
    log(`STDERR??: ${data}\n`)
  });

  child.on('error', (error) => {
    log(`ERROR: ${error.message}\n`)
    delete runners[name].child
    runners[name].stopped = stamp();
  });

  child.on('exit', (code) => {
    console.log(`child process exited with code ${code}`);
    delete runners[name].child
    runners[name].stopped = stamp();
  });
}
runner_tick = () => {
  var runs = [];
  for (var [r, o] of Object.entries(runners)) {
    //console.log(`runner_tick '${r}'`, o)
    if (!o.child) {
      if (stamp() - runners[r].stopped > 5000) {
        console.log("dead runner", r);
        do_runner(r, o);
      }
    }
    runs.push([
      r,
      o.id,
      JSON5.stringify(o.args),
      o.child ? o.child.pid : '',
      o.child ? timed((stamp() - o.start) / 1000) : '',
      o.runs
    ])
  }
  var table = new AsciiTable3()
    .setHeading('Name', 'Id', 'Args', 'Child', 'Uptime', 'Runs')
    .addRowMatrix(runs);
  //console.log(table.toString());

  setTimeout(runner_tick, 1000);
}

config = (_argv, _conf, _web_conf, _aedes) => {
  argv = _argv;
  conf = _conf;
  aedes = _aedes;
  web_conf = _web_conf;
  runners = conf.runners;
  console.log(`Runner Services Started.. `, runners)
  for (var [r, o] of Object.entries(runners)) {
    o.id = `${argv.id}_${r}`;
    o.runs = 0;
    console.log(`run '${r}'`, o)
    do_runner(r, o);
  }
  runner_tick();
}

module.exports = {
  config,
}