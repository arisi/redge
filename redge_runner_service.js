const fs = require('fs')
const os = require('os')
const sprintf = require('sprintf')
const JSON5 = require('json5');
const path = require('path')
const chokidar = require('chokidar');
const log = console.log.bind(console);
var { AsciiTable3, AlignmentEnum } = require('ascii-table3');
const { spawn } = require('child_process');

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
  var args_sum={
    ...runners[name].args,
    ...runners[name].args_run,
  }
  s = `--name ${name} --id ${r.id} --rt0s ${argv.rt0s} --args="${JSON.stringify(args_sum)}"`;
  console.log("runner", r.bin, s);

  runners[name].runs += 1;
  runners[name].start = stamp();
  runners[name].stopped = 0;
  runners[name].stdout=[]
  runners[name].stderr = []
  if (runners[name].req_msg) {
    runners[name].last_exit_code = 0;
    runners[name].last_error_message = '';
  }
  const child = spawn(r.bin, s.split(' '));
  child.stdout.on('data', (s) => {
    var sss = s.toString().replace('\r', '')
    if (sss.indexOf('\n') != -1) {
      for (var ss of sss.split('\n'))
        if (ss.length > 1) {
          runners[name].stdout.push(ss)
        }
    }
  });
  runners[name].child = child;

  child.stderr.on('data', (s) => {
    var sss = s.toString().replace('\r', '')
    if (sss.indexOf('\n') != -1) {
      for (var ss of sss.split('\n'))
        if (ss.length > 1) {
          runners[name].stderr.push(ss)
        }
    }
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
        stdout: runners[name].stdout,
        stderr: runners[name].stderr,
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
    if (!o.run) continue;
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

config = (_argv, _conf, _web_conf) => {
  argv = _argv;
  conf = _conf;
  web_conf = _web_conf;
  runners = conf.runners;
  console.log(`Runner Services Started.. `, runners)
  rt0s = require('rt0s_js');
  runner_mq = new rt0s(argv.rt0s, argv.id + ":runner:daemon", "demo", "demo");
  console.log('Connected to Broker at', argv.rt0s);
  runner_mq.registerSyncAPI("poks", "Count Records", [], async (msg) => {
    return "jesp"
  });

  for (var [r, o] of Object.entries(runners)) {
    o.id = `${argv.id}:${r}:runner`;
    o.runs = 0;
    console.log(`run '${r}'`, o)
    if (!o.run) continue;
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
          run: o.run,
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

  runner_mq.registerSyncAPI('kill', "Kill a Runner", [
    { name: 'id', type: 'string' },
  ], msg => {
    var id = msg.req.args[1].id;
    console.log('kill Runner', id)
    var ret = []
    try {
      for (var [k, o] of Object.entries(runners)) {
        if (o.id == id) {
          if (o.child) {
            console.log('killin Runner', k, o.child.pid)
            o.child.kill('SIGINT')
            ret.push({
              bin: o.bin,
              id: o.id,
            })
          }
        }
      }
    } catch (error) {
      console.error("runners lost?");
    }
    return ret
  })

  runner_mq.registerAPI('run', "Run a Runner", [
    { name: 'once' },
    { name: 'id', type: 'string' },
    { name: 'args', type: 'json' },
  ], msg => {
    var once = msg.req.args[1].once;
    var id = msg.req.args[1].id;
    var args = msg.req.args[1].args;
    console.log('Run a Runner', id, args)
    var ret = []
    try {
      for (var [k, o] of Object.entries(runners)) {
        if ((o.id == id) && (!o.run) && (!o.pid)) {
          o.args_run = args;
          console.log('running a Runner', k, o.args, args)
          if (o.child) {
            return {error: "already running", pid:o.child.pid}
          }
          do_runner(k, o);
          ret.push({
            once,
            bin: o.bin,
            id: o.id,
            args: o.args,
            args_run: o.args_run,
            pid: o.child ? o.child.pid : 0,
          })
          if (once)
            o.req_msg = msg; // causes exit to send result message
          else
            return ret
        }
      }
    } catch (error) {
      console.error("runners lost?");
    }
    if (once)
      return null;
    else
      return {}
  })
}

module.exports = {
  config,
}