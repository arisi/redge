#!/usr/bin/env node

const SerialPort = require('serialport').SerialPort
const readline = require('readline');
const sprintf = require('sprintf');
const fs = require("fs")
const yargs = require('yargs');
const HDLC = require("../hdlc.js")
const mqttsn = require("../mqttsn.js")
const path = require("path")

var mq = undefined
var reqs = {}
const BAUDS = 38400
var new_baud = BAUDS
var old_af = false

console.log("\nrt0s Edge Gate v1.0\n");

var term = true
const argv = yargs
  .option('port', {
    description: 'Port to Use',
    type: 'string'
  })
  .option('rt0s', {
    description: 'rt0s broker to use',
    type: 'string'
  })
  .option('id', {
    description: 'rt0s node id',
    type: 'string'
  })
  .option('schema', {
    description: 'MQTTSN Base Schema',
    type: 'string'
  })
  .option('path', {
    description: 'Path to Artifacts',
    type: 'string',
    default: 'web/localhost/artefact/'
  })
  .option('args', {
    description: 'args',
    type: 'string',
  })
  .help()
  .alias('help', 'h').argv;

var itoh = i => {
  return sprintf("%02X", i)
}

stamp = () => {
  return (new Date).getTime();
}

if (argv.args) {
  for (var [k,v] of Object.entries(JSON.parse(argv.args))) {
    console.log(`puttin args k='${k}', v='${v}'`);
    argv[k] = v;
  }
  console.log("argv", JSON.stringify(argv, null, 2));
}

var schema_fn = argv.schema

var schema = mqttsn.init(schema_fn)
if (schema == null) {
  console.log("no mqttsn defined");
  process.exit(0)
}

//console.log("Using srec:", argv.srec);

if (argv.rt0s) {
  rt0s = require('rt0s_js');
  mq = new rt0s(argv.rt0s, argv.id, "demo", "demo");
  console.log('Connected to Broker at', argv.rt0s);
}

var read_srec = (fn) => {
  var max_a = 0
  var min_a = 0xffffffff
  var info = ""
  var blocks = []

  for (var r of fs.readFileSync(fn).toString().split("\n")) {
    if (r[0] == 'S') {
      var len = parseInt(r.substr(2, 2), 16)
      var data = []
      sum = len
      for (var i = 0; i < len; i++) {
        var val = parseInt(r.substr(4 + 2 * i, 2), 16)
        data.push(val)
        if (i < len - 1)
          sum += val
      }
      var crc = data.pop()
      var crc_check = 0xff - (sum & 0xff)
      if (crc != crc_check) {
        console.log("BAD CRC");
        break
      }
      switch (r[1]) {
        case '0':
          for (ch of data.splice(2))
            info += String.fromCharCode(ch)
          break;
        case '9':
          break;
        case '3': // 4-byte address
          var a = data.shift() << 24
          a = data.shift() << 16
          a = data.shift() << 8
          a += data.shift()
          blocks.push([a, data])
          break
        case '2': // 3-byte address
          var a = data.shift() << 16
          a = data.shift() << 8
          a += data.shift()
          blocks.push([a, data])
          break
        case '1': // 2-byte address
          var a = data.shift() << 8
          a += data.shift()
          blocks.push([a, data])
          break;
      }
    }
  }

  for (b of blocks) {
    var a = b[0]
    var data = b[1]
    if (a < min_a)
      min_a = a
    if (a + data.length > max_a)
      max_a = a + data.length
    // process.stdout.write(sprintf("%08X: ", a));
    // for (var b of data)
    //   process.stdout.write(sprintf("%02X ", b));
    // console.log("");
  }
  return {
    info,
    min_a,
    max_a,
    blocks
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ']',
});

main = async (pfn) => {
  var baudRate = 115200
  const port = new SerialPort( {
    path: pfn,
    baudRate,
    parity: 'none',
    stopBits: 1,
    lock: false,
  });
  console.log("Opened Serial Port:", pfn, baudRate);
  port.on('error', function(err) {
    console.log(err);
    console.error("Bad port", pfn);
    process.exit(1)
  });
  port.on('close', function(err) {
    console.log(err);
    console.error("Closed", pfn);
    process.exit(1)
  });
  //const parser = port.pipe(new ByteLength({ length: 1 }))


  console.log("Ready ...");

  var state = 1
  var i = 0
  var inbuf = []
  var expect = 0
  var cmd = null
  var f = null
  var dev = { areas: [] }


  var register_apis = (schemax) => {
    if (!schemax)
      return;
    if (!schemax.messages)
      return;
    for (const [key, value] of Object.entries(schemax.messages)) {
      if (value.direction != 'up' && (!mq.apis[key])) {
        mq.registerAPI(key, value.descr, value.payload, (msg) => {

          var [id, s] = mqttsn.encode({
            topic: msg.req.args[0],
            ...msg.req.args[1],
          })
          console.log(`RECEIVED FROM HOST id: ${id}`, JSON.stringify(msg));
          //dump("ENCODED", 0, s);
          var buf = HDLC.send(Buffer.from(s))
          port.write(Buffer.from(buf))
          // TODO: need to add no-reply flag to json
          if (key == 'reset') {
            return { done: 'reset' }
          }
          reqs[id] = msg
          return null
        })
      }
    }
  }


  function isprint(char) {
    if (char < 32)
      return false
    return !(/[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(String.fromCharCode(char)));
  }

  var dump = (title, a, d) => {
    var ss = ""
    if (title && title != "")
      ss += `${title}:`;
    //process.stdout.write(`${sprintf("%08X:", a)}: `);
    var i = 0
    var s = ""
    if ((a % 0x10) != 0) {
      ss += sprintf("\n%08X: ", a - (a % 0x10));
      for (var j = 0x10 - (a % 0x10); j < 0x10; j++) {
        ss += sprintf("   ");
        s += " "
      }
    }
    for (var c of d) {
      // if (((i + a) % 0x10) == 0) {
      //   process.stdout.write(sprintf(" %s\n%08X: ", s, a + i));
      //   s = ""
      // }
      ss += sprintf("%02X ", c);
      if (isprint(c))
        s += String.fromCharCode(c)
      else if (c == 0xff)
        s += " "
      else
        s += "."
      i++
    }
    var z = ((a + d.length) % 0x10)

    if (z)
      for (var j = z; j < 0x10; j++) {
        s = "   " + s
      }
    console.log(ss + s);
  }

  var dump32 = (title, a, d) => {
    if (title && title != "")
      process.stdout.write(`${title}:`);
    //process.stdout.write(`${sprintf("%08X:", a)}: `);
    var i = 0
    var s = ""
    if ((a % 0x10) != 0) {
      process.stdout.write(sprintf("\n%08X: ", a - (a % 0x10)));
      for (var j = 0x10 - (a % 0x10); j < 0x10; j++) {
        process.stdout.write(sprintf("   "));
        s += " "
      }
    }
    /*
    for (var c of d) {
      if (((i + a) % 0x10) == 0) {
        process.stdout.write(sprintf("\n%08X: ", a + i));
      }
      process.stdout.write(sprintf("%08X ", c))
      i++
    }
    console.log(""); */
  }

  var do_probe = async () => {
    await do_inquiry()
    await do_signature()
    for (var j = 0; j < dev.noa; j++) {
      await do_area_info(j)
    }
  }
  var inc = 0
  var inbuf = ""
  cmd_cb = null
  var ping_cnt = 0
  var crc_cnt = 0

  a2s = (a) => {
    s = ""
    for (b of a) {
      s += String.fromCharCode(b)
    }
    return s
  }
  port.on('readable', async () => {
    var d = port.read();

    if (term) {
      HDLC.got(d, (err, frame) => {
        if (err) {
          switch (err) {
            case "PING":
              // process.stdout.write(`\r*PING ${ping_cnt} CRC ${crc_cnt} MSG ${msg_cnt / uptime} Q: ${out_q.length} INC: ${inc_count / uptime} OUTC: ${outc_count / uptime} ${uptime}\r`);
              ping_cnt += 1
              break;
            case "CRC":
              crc_cnt += 1
              dump("RECEIVED FROM DUT WITH CRC ERROR", 0, frame)
            // msg = mqttsn.decode(frame)
            // console.log("CRAP:", JSON.stringify(msg));
            // break;
          }
        } else {
          dump("RECEIVED FROM DUT", 0, frame)
          msg = mqttsn.decode(frame)
          msg.sent = stamp();
          if (msg.topic == "ping") {
            console.log(`from DUT PING ${JSON.stringify(msg)}`);
            const pong = {
              topic: 'pong',
              tick: Math.floor(new Date().getTime() / 1000.0),
              source: 2,
            };
            var [id, s] = mqttsn.encode(pong)
            console.log("PUNG TO DUT", JSON.stringify(pong));
            //dump("ENCODED", 0, s);
            var buf = HDLC.send(Buffer.from(s))
            port.write(Buffer.from(buf))
          } else if (msg.topic == "pong") {
            console.log("from device PONG:", a2s(msg.data));
          } else if (msg.topic == "read32ack") {
            dump32("dada", 0, msg.data)
          } //else
          console.log("SENT TO HOST:", JSON.stringify(msg));
          if ("rseq" in msg) {
            if (reqs[msg.rseq] && !reqs[msg.rseq.invalid]) {
              console.log("IS REPLY TO", JSON.stringify(reqs[msg.rseq]));
              mq.reply(reqs[msg.rseq], msg)
              msg.rseq.invalid = true;
            } else if (msg.rseq) {
              console.log("STRAY REPLY TO ", msg.rseq);
            } else {
              console.log("IND 0:", JSON.stringify(msg));
              if (msg.topic == "identity") {
                try {
                  var sfn = path.join(argv.path,msg.af,"schema.json5")
                  if (old_af && (msg.af != old_af)) {
                    console.log("new schema, reboot", sfn);
                    process.exit(0)
                  }
                  else if (msg.af == old_af) {
                    console.log("have this schema already", sfn);
                  } else {
                    old_af = msg.af
                    //schema = mqttsn.init(`bin/${msg.sw}-${msg.sw_rev}-schema.json5`)
                    schema = mqttsn.init(sfn)
                    register_apis(schema);
                  }
                } catch (error) {
                  console.log("no schema :(",sfn);
                }
              }
              mq.publish(`/ind/${argv.id}/${msg.topic}`, msg)
            }
          } else {
            if (msg.topic == "identity") {
              try {
                //schema = mqttsn.init(`bin/${msg.sw}-${msg.sw_rev}-schema.json5`)
                var sfn = path.join(argv.path,msg.af,"schema.json5")
                //schema = mqttsn.init(`bin/${msg.sw}-${msg.sw_rev}-schema.json5`)
                schema = mqttsn.init(sfn)
                register_apis(schema);
              } catch (error) {
                console.log("no schema2 :(",sfn);
              }
            }
            console.log("IND!!:", `/ind/${argv.id}/${msg.topic}`, JSON.stringify(msg));
            mq.publish(`/ind/${argv.id}/${msg.topic}`, msg)
          }
          console.log("");
        }
      })
      return
      var ch = String.fromCharCode(d[0])
      if (ch == '\r' || ch == '\n') {
        if (inbuf != "") {
          inlen = inbuf.length
          if (inbuf[0] == '[' && inbuf[inlen - 1] == ']') {

            if (inbuf[1] == 'D') {
              var data = inbuf.substr(2, inlen - 3)
              console.log("data", data);
              if (mq)
                mq.publish(`/data/${argv.rt0s}`, data)
            } else if (inbuf[1] == 'O') {
              var cc = parseInt(inbuf.substr(2, 2), 16)
              var data = inbuf.substr(4, inlen - 3 - 2)
              var dlen = data.length / 2
              var sum = 0
              var ret = []
              for (var i = 0; i < dlen; i++) {
                var s = parseInt(data.substr(i * 2, 2), 16)
                ret.push(s)
                sum += s
              }
              if ((sum & 0xff) != cc)
                console.log("ERR CRC");
              {
                if (cmd_cb) {
                  cmd_cb(null, ret)
                  cmd_cb = null
                } else
                  console.log("ret:", ret);
              }
            } else
              console.log(":", inbuf);
          } else
            console.log(">", inbuf);
        }
        inbuf = ""
      } else
        inbuf += ch
      //process.stdout.write(sprintf("%c", d[0]));
      return
    }
    for (v of d) {
      if (state == 2 && expect) {
        if (inbuf.length == 0 && v != 0x81) {
          console.error("Missing SOD");
          expect = 0
        }

        inbuf.push(v)
        if (inbuf.length == expect) {
          len = (inbuf[1] << 8) + inbuf[2]
          inbuf = inbuf.splice(3)
          var e = inbuf.pop()
          if (e != 0x03 && cmd != 0x15) {
            console.log("Missing ETX", e);
            dump("buf", 0, inbuf)
          } else {
            var result = inbuf.shift()
            f(result, inbuf)
          }
        }
      } else {
        if (v == 0) {
          //console.log("BOOT DETECTED");
          state = 1
          i = 0
        } else if (v == 0xc3) {
          console.log("Device Found:");
          state = 2
          await do_probe()
          if (new_baud != BAUDS) {
            console.log("setting bauds to ", new_bauds);
            await do_set_bauds(new_baud)
            await port.update({ baudRate: new_baud })
          }
          console.log(dev);
          if (argv.srec)
            await flaz()
          rl.prompt(true)
        }
      }
    }
  })

  var send = (op, a) => {
    var sum = 0;
    for (var b of a)
      sum += b
    // cmd = a[2]
    a.unshift(op)
    var check = 0 - sum
    a.push(check & 0xff)
    a.push(0x03)
    port.write(Buffer.from(a))
  }

  var do_cmd = (op, a, exp, cb) => {
    inbuf = []
    expect = exp
    send(op, a)
    f = cb
  }

  var do_area_info = async (a) => {
    return new Promise((res, err) => {
      do_cmd(0x01, [0x00, 0x02, 0x3b, a], 23, (result, b) => {
        if (result != 0x3b) {
          err(`BAD STATUS FROM AREA_INFO: ${itoh(result)}`)
        } else {
          dev.areas[a] = {
            koa: b[0],
            start: (b[1] << 24) + (b[2] << 16) + (b[3] << 8) + (b[4]),
            end: (b[5] << 24) + (b[6] << 16) + (b[7] << 8) + (b[8]),
            eau: (b[9] << 24) + (b[10] << 16) + (b[11] << 8) + (b[12]),
            wau: (b[13] << 24) + (b[14] << 16) + (b[15] << 8) + (b[16])
          }
          res(dev)
        }
      })
    })
  }

  var do_signature = async (a) => {
    return new Promise((res, err) => {
      do_cmd(0x01, [0x00, 0x01, 0x3a], 18, (result, b) => {
        if (result != 0x3a) {
          err(`BAD STATUS FROM SIGNATURE: ${itoh(result)}`)
        } else {
          dev.sci_clk = (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + (b[3])
          dev.max_bauds = (b[4] << 24) + (b[5] << 16) + (b[6] << 8) + (b[7])
          dev.noa = b[8]
          dev.type = b[9]
          dev.version = parseFloat(`${b[10]}.${b[11]}`)
          res(dev)
        }
      })
    })
  }

  var do_inquiry = async () => {
    return new Promise((res, err) => {
      do_cmd(0x01, [0x00, 0x01, 0x00], 7, (result, b) => {
        if (result != 0) {
          err(`BAD STATUS FROM INQUIRY: ${itoh(result)}`)
        } else {
          dev.sts = b[0]
          res(dev)
        }
      })
    })
  }

  var do_set_bauds = async (b) => {
    return new Promise((res, err) => {
      do_cmd(0x01, [
        0x00, 0x05, 0x34,
        (b >> 24) & 0xff, (b >> 16) & 0xff, (b >> 8) & 0xff, b & 0xff
      ], 7, (result, b) => {
        if (result != 0x34) {
          err(`BAD STATUS FROM SET_BAUDS: ${itoh(result)}`)
        } else {
          dev.sts = b[0]
          res(dev)
        }
      })
    })
  }

  var do_read = async (a, l) => {
    if (l > 0x400) {
      console.log("Too big read len", l);
      return false
    }
    return new Promise((res, err) => {
      var e = a + l - 1
      do_cmd(0x01, [0x00, 0x09, 0x15,
        (a >> 24) & 0xff, (a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff,
        (e >> 24) & 0xff, (e >> 16) & 0xff, (e >> 8) & 0xff, e & 0xff
      ], 6 + e - a, (result, b) => {
        if (result != 0x15) {
          err(`BAD STATUS FROM READ: ${itoh(result)}`)
        } else {
          res(b)
        }
      })
    })
  }

  var do_erase = async (a, l) => {
    return new Promise((res, err) => {
      var e = a + l - 1
      console.log("do_eraze...");
      do_cmd(0x01, [0x00, 0x09, 0x12,
        (a >> 24) & 0xff, (a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff,
        (e >> 24) & 0xff, (e >> 16) & 0xff, (e >> 8) & 0xff, e & 0xff
      ], 7, (result, b) => {
        if (result != 0x12) {
          err(`BAD STATUS FROM ERASE: ${itoh(result)}`)
        } else {
          res(true)
        }
      })
    })
  }

  var do_writea = async (a, l) => {
    return new Promise((res, err) => {
      var e = a + l - 1
      do_cmd(0x01, [0x00, 0x09, 0x13,
        (a >> 24) & 0xff, (a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff,
        (e >> 24) & 0xff, (e >> 16) & 0xff, (e >> 8) & 0xff, e & 0xff
      ], 7, (result, b) => {
        if (result != 0x13) {
          err(`BAD STATUS FROM WRITEA: ${itoh(result)} ${itoh(b[0])}`)
        } else {
          res(true)
        }
      })
    })
  }

  var do_writeb = async (d) => {
    return new Promise((res, err) => {
      var l = d.length + 1
      do_cmd(0x81, [l >> 8, l & 0xff, 0x13
      ].concat(d), 7, (result, b) => {
        if (result != 0x13) {
          err(`BAD STATUS FROM WRITEB: ${itoh(result)} ${itoh(b[0])}`)
        } else {
          res(true)
        }
      })
    })
  }

  var in_range = (s, e, S, E) => {
    //console.log(sprintf("in_range %04x,%04x,%04x,%04x", s, e, S, E));
    if (e < S) return false
    if (s > E) return false
    return true
  }

  var do_write = async (a, d) => {
    var l = d.length

    var missing = l % 4
    if (missing != 0) {
      missing = 4 - missing
      for (var add = 0; add < missing; add++)
        d.push(0xff)
    }
    l = d.length
    var e = a + l - 1

    //console.log(a, e, d, d.length);

    if (in_range(a, e, 0x400, 0x500)) {
      console.error("Protected Area 1 Write Attempt Denied");
      return;
    }
    if (in_range(a, e, 0x2400, 0x2500)) {
      console.error("Protected Area 2 Write Attempt Denied");
      return;
    }

    await do_writea(a, d.length)
    await do_writeb(d)
  }

  var cmd = (line, cb) => {
    cmd_cb = cb
    var cc = 0;
    for (c of line) {
      cc += c.charCodeAt(0)
    }
    var ss = sprintf("<%02X%s>", cc & 0xff, line)
    port.write(ss)
  }


  if (mq) {
    register_apis(schema)
  }
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  var flaz = async () => {
    console.log("flaz");
    if (!argv.srec) {
      console.log("No Srec File Given");
      return;
    }
    var d = await do_erase(0, 0x10000)
    console.log("Erased");

    var d = await do_erase(0, 0x10000)
    console.log("Erased All");
    console.log("Flashing", argv.srec);
    //var s = read_srec("pcar_ra2e1_dev-0.1.srec")
    var s = read_srec(argv.srec)
    console.log("");
    console.log(s.info);
    s.min_a = 0x2800
    process.stdout.write(sprintf("MIN : 0x%08X\n", s.min_a));
    process.stdout.write(sprintf("MAX : 0x%08X\n", s.max_a));
    process.stdout.write(sprintf("SIZE: %.1fkb\n", (s.max_a - s.min_a) / 1024));
    console.log(s.blocks.length, "blocks");
    var cnt = 0
    for (var b of s.blocks) {
      process.stdout.write(sprintf("F: 0x%08X %04X\r", b[0], b[1].length));
      try {
        await do_write(b[0], b[1])
      } catch (error) {
        console.log("duh", error);
        break;
      }
      // cnt+=1
      // if (cnt>20)
      //   break
    }
    console.log("FLASH DONE OK                   ");
    await delay(100);
    // var d = await do_read(0x400, 0x40)
    // if (d) {
    //   dump("secure area", 0x400, d)
    await port.update({ baudRate: BAUDS })
    term = 1;
    console.log("In terminal mode -- deassert MD and RESET!");
    //}
  }

  rl.on('line', async (line) => {
    if (term) {
      // console.log("line: ",line);
      // dump("RAW  send",0,Buffer.from(line))
      var s = mqttsn.encode({
        topic: "read32",
        address: 0x0,
        data_len: 8,
      })
      // var s = mqttsn.encode({
      //   topic: "ping",
      //   data_len: line.length,
      //   data: line,
      // })
      var buf = HDLC.send(Buffer.from(s))
      //HDLC.dump("hdlc", buf)
      //dump("HDLC send",0,buf)
      port.write(Buffer.from(buf))
      return;
    }
    if (state != 2) {
      switch (line.substr(0, 1)) {
        case 'P':
          state = 1;
          port.write(Buffer.from([0, 0, 0x55]))
          console.log("PROBE");
          return
        case 'f':
          await flaz()
          rl.prompt(true)
          return;
        case 'a':
          do_probe()
          await console.log(dev);
          rl.prompt(true)
          return;
        case 't':
          //await port.update({ baudRate: BAUDS })
          rl.prompt(true)
          term = true
          state = 0
          return;
        case 'q':
          process.exit(0)
        default:
          console.log("??");
      }
    } else {
      var a = 0
      var l = 0x20
      if (line.length > 1) {
        s = line.substr(1).split(",")
        a = parseInt(s[0], 16)
        if (s.length > 1)
          l = parseInt(s[1], 16)
      }


      switch (line.substr(0, 1)) {
        case 'r':
          var d = await do_read(a, l)
          if (d)
            dump("", a, d)
          rl.prompt(true)
          return

        case 'e':
          var d = await do_erase(0, 0x10000)
          console.log("Erased", a);
          rl.prompt(true)
          return;
        case 'w':
          console.log("Write");
          //var d = ['A'.charCodeAt(0),'B'.charCodeAt(0),'B'.charCodeAt(0),'A'.charCodeAt(0)]
          var d = ['A'.charCodeAt(0), 'B'.charCodeAt(0)]
          await do_write(a, d)
          var d2 = await do_read(a, d.length)
          dump("R", a, d2)
          rl.prompt(true)
          return;
        case 's':
          //await do_set_bauds(57600)
          //await port.update({ baudRate: 57600 })
          break;
        case 'W':
          console.log("Write!");
          await do_write(a, [
            0, 64, 0, 32
          ])
          rl.prompt(true)
          return;
        case 'f':
          await flaz()
          rl.prompt(true)
          return;
        case 'a':
          do_probe()
          await console.log(dev);
          rl.prompt(true)
          return;
        case 'P':
          state = 1;
          console.log("forced 1 state");
          return
        case 't':
          //await port.update({ baudRate: BAUDS })
          term = true
          state = 0
          rl.prompt(true)
          return;
        case 'q':
          process.exit(0)
      }
      rl.prompt(true)
    }
  });

  // rl.prompt(true)
  setInterval(() => {
    i += 1;
    if (state == 1) {
      if ((i % 5) == 4) {
        try {
          //port.write(Buffer.from([0, 0, 0x55]))
          //console.log(".");
        } catch (error) {
          console.log("duh");
        }
        i = 0;
      }
    } else if (term) {
      port.write(Buffer.from(HDLC.idle))
    }
  }, 10)

  var ping_ticks = 0;
  var old_ping_cnt = 0;
  var ping_cnt_change_tick = 0;
  setInterval(() => {
    ping_ticks += 1;
    if ((ping_cnt == 0) && (ping_ticks > 3)) {
      console.log("duh -- port silent", ping_ticks, ping_cnt);
      process.exit(-1)
    }
    if (old_ping_cnt != ping_cnt) {
      old_ping_cnt = ping_cnt
      ping_cnt_change_tick = ping_ticks;
    }
    if (ping_ticks>ping_cnt_change_tick+10) {
      console.log("duh -- port died", ping_ticks, ping_cnt);
      process.exit(-1)

    }
  }, 1000)
}

(async () => {
  if (argv.port) {
    main(argv.port)
  }
  else {
    try {
      const serialList = await SerialPort.list();
      pfn = null
      for (var p of serialList) {
        if (p.vendorId == '067b' || p.vendorId == '0403') {
          if (pfn) {
            console.log("\nMultiple serial ports:\n");
            for (var p of serialList) {
              if (p.vendorId == '067b' || p.vendorId == '0403') {
                console.log(p.path);
              }
            }
            console.log("\nPlease select one with argument --port=\n");
            process.exit(1)
          }
          pfn = p.path
        }
      }
      if (pfn)
        main(pfn)
      else {
        console.log("No serial port found");
        process.exit(1)
      }
    } catch (e) {
      console.log(e);
    }
  }
})()
