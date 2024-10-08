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
  runners[name].stopped = 0;
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
    runners[name].last_error_message = error.message;
  });

  child.on('exit', (code, signal) => {
    console.log(`child process exited with code ${code} sig ${signal}`);
    delete runners[name].child
    runners[name].stopped = stamp();
    runners[name].last_exit_code = child.exitCode - 256;
    runners[name].last_signal = signal;

    if (runners[name].req_msg) {
      runners[name].req_msg['reply'] = {
        pid: child.pid,
        bin: runners[name].bin,
        id: name,
        args: runners[name].args,
        dur: (runners[name].stopped - runners[name].start) / 1000,
        last_exit_code: runners[name].last_exit_code,
        last_signal: runners[name].last_signal,
      }
      runner_mq.publish(`/up/${runners[name].req_msg['src']}/${runners[name].req_msg['mid']}`, runners[name].req_msg);
      runners[name].req_msg = undefined;
    }
  });
}
runner_tick = () => {
  var runs = [];
  for (var [r, o] of Object.entries(runners)) {
    //console.log(`runner_tick '${r}'`, o)
    if (o.oneshot) continue;
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
  rt0s = require('rt0s_js');
  runner_mq = new rt0s(argv.rt0s, argv.id + "_runner", "demo", "demo");
  console.log('Connected to Broker at', argv.rt0s);
  runner_mq.registerSyncAPI("poks", "Count Records", [], async (msg) => {
    return "jesp"
  });

  for (var [r, o] of Object.entries(runners)) {
    o.id = `${argv.id}_${r}`;
    o.runs = 0;
    console.log(`run '${r}'`, o)
    if (o.oneshot) continue;
    do_runner(r, o);
  }
  runner_tick();
  runner_mq.registerSyncAPI('list_runners', "Get Runners", [], msg => {
    console.log('Runners?', runners)
    var ret = {}
    try {
      for (var [k, o] of Object.entries(runners)) {
        ret[o.id] = {
          bin: o.bin,
          runs: o.runs,
          start: o.start,
          oneshot: o.oneshot,
          stopped: o.stopped,
          args: o.args,
          last_error_message: o.last_error_message,
          last_exit_code: o.last_exit_code,
          last_signal: o.last_signal,
          pid: o.child ? o.child.pid : 0,
        }
      }
    } catch (error) {
      console.error("runners lost?", error);
    }
    return ret
  })
  runner_mq.registerSyncAPI('kill_runner', "Kill a Runner", [
    { name: 'id', type: 'string' },
  ], msg => {
    var id = msg.req.args[1].id;
    console.log('kill Runner', id)
    var ret = []
    try {
      for (var [k, o] of Object.entries(runners)) {
        if (o.id == id) {
          console.log('killin Runner', k, o.child.pid)
          o.child.kill('SIGINT')
          ret.push({
            bin: o.bin,
            id: o.id,
          })
        }
      }
    } catch (error) {
      console.error("runners lost?");
    }
    return ret
  })
  runner_mq.registerAPI('run_once', "Run a One-Shot Runner", [
    { name: 'id', type: 'string' },
    { name: 'args', type: 'json' },
  ], msg => {
    var id = msg.req.args[1].id;
    var args = msg.req.args[1].args;
    console.log('Run OneShot Runner', id, args)
    var ret = []
    try {
      for (var [k, o] of Object.entries(runners)) {
        if ((o.id == id) && o.oneshot && (!o.pid)) {
          o.args = args;
          console.log('running one-shot Runner', k, args)
          // o.child.kill('SIGINT')
          do_runner(k, o);
          ret.push({
            bin: o.bin,
            id: o.id,
            args: o.args,
            pid: o.child ? o.child.pid : 0,
          })
          o.req_msg = msg;
        }
      }
    } catch (error) {
      console.error("runners lost?");
    }

    // msg['reply'] = ret
    // setTimeout(() => {
    //   runner_mq.publish(`/up/${msg['src']}/${msg['mid']}`, msg);
    // }, 1000);
    return null;
  })
}

module.exports = {
  config,
}