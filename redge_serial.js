const SerialPort = require('serialport').SerialPort
const { spawn, execSync } = require('child_process');
var { AsciiTable3, AlignmentEnum } = require('ascii-table3');
const { log } = require('console');
const fs = require('fs')
const os = require('os')

var g_ports = {};
var tick = 0;
var argv = {}
var win = os.platform() == "win32";
var serial_mq

var filter_path = (p) => {
  var hit = false;
  if (argv.serial_path != '')
    if (p.path.match(new RegExp(argv.serial_path)))
      hit = true;
  if (argv.serial_vendor == p.vendorId) {
    hit = true;
  }
  if ((argv.serial_product == p.productId) && (argv.serial_vendor == p.vendorId))
    hit = true;
  if (argv.serial_sernos && ((argv.serial_sernos.split(',').indexOf(p.serialNumber)) != -1))
    hit = true;
  return hit;
}

scan = async () => {
  var serialList
  serialList = await SerialPort.list();
  var ports = []
  for (var p of serialList) {
    if (p.vendorId) {
      var state = ""
      var hit = filter_path(p);
      if (p.path in g_ports) {
        if (g_ports[p.path].live)
          state = "online"
        else
          state = "offline"
      }
      ports.push([p.path, `0x${p.vendorId}`, `0x${p.productId}`, p.serialNumber || "", p.manufacturer || "", hit ? 'in_use': 'ignored', state])
    }
  }

  var table = new AsciiTable3()
    .setHeading('Path', 'Vendor', 'Product', 'Serial', 'Manufacturer', 'Usage', ' State')
    .addRowMatrix(ports);
  console.log(table.toString());
}
var tty_logger = (tty, s) => {
  var dd = new Date(stamp()).toISOString()
  var fn = `log/${tty}_${dd.slice(0, 10)}.log`
  fs.appendFileSync(fn, dd + ';' + s + '\n')
}

runner = (tty, driver) => {
  var ttys = tty.replace(/\/dev\//g, '').replace(/\//g, '_');
  var fn = `log/${ttys}.log`
  var raf, s
  var id = `${argv.id}:${driver}:${ttys}`
  if (!win) {
    raf = `./redge_serial_${driver}.js`
    s = `--schema ${argv.schema} --rt0s ${argv.rt0s} --id ${id} --port ${tty}`;

  } else {
    raf = 'node'
    s = `.\\redge_serial_${driver}.js --schema ${argv.schema} --rt0s ${argv.rt0s} --id ${id} --port ${tty}`;
  }
  if (driver == 'dptest')
    s += ` --usb_serno ${g_ports[tty].serialNumber}`
  s += ` --log ${fn}`
  console.log("runner", raf, s, fn);

  const child = spawn(raf, s.split(' '));
  var sss = ""
  child.stdout.on('data', (s) => {
    if (driver == 'wss_hdlc') {
      console.log("zendin", s);
      g_ports['hdlc']['wss_hdlc'].send(Buffer.from(s));
    } else {
      sss += s.toString().replace('\r', '')
      if (sss.indexOf('\n') != -1) {
        for (var ss of sss.split('\n'))
          if (ss.length > 1) {
            tty_logger(ttys, `${ss}`)
          }
        sss = ""
      }
    }
  });
  g_ports[tty].child = child;
  g_ports[tty].id = id;

  child.stderr.on('data', (data) => {
    tty_logger(ttys, `STDERR??: ${data}\n`)
  });

  child.on('error', (error) => {
    tty_logger(ttys, `ERROR: ${error.message}\n`)
  });

  // child.on('close', (code) => {
  //   console.log(`child process closed with code ${code}`);
  // });
  child.on('exit', (code) => {
    console.log(`child process exited with code ${code}`);
    g_ports[tty].lost = g_ports[tty].live;
    g_ports[tty].live = false;
    //                    dev/tty.usbserial-AG0K2PHQ
    //Ari_iMac_local_edge:tty:tty.usbserial-AG0K2PHQ
    var ttys = tty.replace(/\/dev\//g, '').replace(/\//g, '_');
    var id = `${argv.id}:${driver}:${ttys}`
    console.log("lost2", tty, id, ttys, `/ind/${argv.id}/lost`);

    //mq.publish(`/ind/${argv.id}/lost`, { path: id })

    aedes.publish({
      topic: `/ind/${argv.id}/lost`,
      payload: JSON.stringify({ path: id }),
      retain: false,
    })

    console.log("lost", tty);
  });
}


add = async (p, type) => {
  runner(p, type);
  console.log("\nScanning Serial Ports after adding", p);
  await scan();
}


config = (_argv) => {
  argv = _argv;
  rt0s = require('rt0s_js');
  serial_mq = new rt0s(argv.rt0s, argv.id + "_serial", "demo", "demo");
  console.log('Connected to Broker at', argv.rt0s);

}

poll = async () => {
  tick += 1;
  var serialList
  try {
    serialList = await SerialPort.list();
  } catch (error) {
    console.error("serial poll failed", error);
    setTimeout(poll, 200);
    return;
  }
  for (var p of serialList) {
    if (filter_path(p)) {
      if (!g_ports[p.path]) {
        g_ports[p.path] = p
        g_ports[p.path].lost = tick;
      } else if (!g_ports[p.path].live && (g_ports[p.path].lost + 20 < tick)) {
        g_ports[p.path].live = tick;
        add(p.path, 'hdlc');
      } else if (g_ports[p.path].live) {
        g_ports[p.path].live = tick;
      }
    }
  }
  for (var path of Object.keys(g_ports)) {
    if (g_ports[path].live && (tick > g_ports[path].live + 10)) {
      g_ports[path].lost = g_ports[path].live;
      g_ports[path].live = false;
      console.log("\nScanning Serial Ports after removing", path);
      scan();
    }
  }
  setTimeout(poll, 200);
}

module.exports = {
  config,
  scan,
  poll,
  g_ports,
}