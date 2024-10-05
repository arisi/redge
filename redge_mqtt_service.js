var conf = {}
var cons = {}
var users = {}
var user_stats = {}
var apis = []
var do_send_ind_state = true;
var _id = "broker"
var { AsciiTable3, AlignmentEnum } = require('ascii-table3');

var aconf = {
  realPublished: (client, packet) => {
    if (packet && 'payload' in packet) {
      id = client ? client.id : client
    }
  }
}

var aedes = require('aedes')(aconf)
const match = require('mqtt-match')

stamp = () => {
  return (new Date).getTime();
}

var start_time = stamp();
var old_cpu_usage;

var send_ind_state = () => {
  var usage = process.cpuUsage(old_cpu_usage)
  var musage = process.memoryUsage()
  old_cpu_usage = usage
  var obj = {
    topic: "state",
    users: users,
    cons: cons,
    pid: process.pid,
    now: stamp(),
    start_time: start_time,
    ...usage,
    ...musage
  }

  cons['broker'] = {
    pings: 0,
    last_ping: 0,
    pubs: [],
    pub_bytes: 0,
    pub_messages: 0,
    sub_bytes: 0,
    sub_messages: 0,
    last_pub: 0,
    last_sub: 0,
    connected: stamp(),
    indications: {},
  }
  aedes.publish({
    topic: '/ind/broker/state',
    payload: JSON.stringify(obj),
    retain: true,
  })
  //console.log("ind sent", obj);
  var rows = [];
  for (var [name, o] of Object.entries(cons)) {
    if (o.indications && ("identity" in o.indications)) {
      //console.log("inds", o.indications.identity.serno);
      rows.push([name, timed((stamp() - o.connected) / 1000), o.indications.identity.serno, o.indications.identity.af])
    } else
      rows.push([name, timed((stamp() - o.connected) / 1000),"",""])
  }
  var table = new AsciiTable3()
    .setHeading('Name', 'Uptime', 'Serno', 'Af')
    .addRowMatrix(rows);
  console.log(table.toString());
}

aedes.on('client', function(client) {
})

aedes.on('ping', function(pac, client) {
  id = client ? client.id : client
  if (id in cons) {
    cons[id].pings += 1
    cons[id].last_ping = stamp()
  } else console.error('ping from nowhere?', id)
})

aedes.on('publish', (packet, client) => {
  if (packet.topic.match("/ind/.+")) {
    id = client ? client.id : client
    if (id) {
      try {
        var s = packet.payload.toString();
        var obj = JSON.parse(s);
        if (id in cons) {
          cons[id].indications[obj.topic] = obj;
          do_send_ind_state = true;
        } else
          console.log("DUH", id);

      } catch (error) {
        console.log("err", error);
      }
    }
  }
})

aedes.on('clientDisconnect', function(client) {
  id = client ? client.id : client
  console.log('Client Disconnected: \x1b[31m' + id + '\x1b[0m', 'to broker', aedes.id)
  if (id in cons && cons[id].username in users) {
    cons[id].socket.connected -= 1
    users[cons[id].username].sessions -= 1
    delete cons[id]
    send_ind_state()
  } else
    console.log("dico with unknown id", id);
})

var registerAPI = (path, descr, args, cb) => {
  apis[path] = { f: cb, descr, args }
}

onMessageReply = (packet, cb) => {
  if (packet.cmd == 'publish') {
    try {
      obj = JSON.parse(packet.payload.toString())
    } catch (error) {
      console.log("bad payload", packet.payload.toString());
    }
    topic = packet.topic
    console.log('mq11 got reply packet', packet, obj)
    if (obj['mid'] in reqs) {
      var r = reqs[obj['mid']];
      r.done = true;
      if (r.cb) r.cb(null, obj.reply);
    }
  }
}

onMessageInd = (packet, cb) => {
  var m = packet.payload.toString();
  try {
    var msg = JSON.parse(m)
    console.log("INDDD", m, Object.keys(msg), msg);
  } catch (error) {
    console.log("Bad payload", m);
    return;
  }
}

onMessage = (packet, cb) => {
  if (packet.cmd == 'publish') {
    var m = packet.payload.toString();
    try {
      msg = JSON.parse(m)
    } catch (error) {
      console.log("Bad payload", m);
      return;
    }
    topic = packet.topic

    if (msg['req']['args'][0] in apis) {
      var api = apis[msg['req']['args'][0]]
      var reply = api['f'](msg)

      if (reply == null) {
        return
      }
      msg['reply'] = reply
    } else {
      msg['reply'] = {
        error: "no api '${msg['req']['args'][0]}' at '${_id}'"
      }
    }
    aedes.publish({
      topic: `/up/${msg['src']}/${msg['mid']}`,
      payload: JSON.stringify(msg, null, 2)
    })
  }
  cb()
}
aedes.subscribe(`/dn/${_id}/+`, onMessage, () => {
  console.log('mq11 subscribed api calls')
})

aedes.subscribe(`/up/${_id}/+`, onMessageReply, () => {
  console.log('mq11 subscribed req reply')
})

aedes.authenticate = function(client, username, password, callback) {
  var s = false
  var ok = false

  id = client ? client.id : client
  pw = ''
  if (password) pw = password.toString('utf8')
  if (username) username = username.toString('utf8')

  console.log('Client Connecting: \x1b[33m' + id + '\x1b[0m', ': ', username, pw)

  if ((username == 'token') && pw) {
    console.log("doin tokeni", conf, username, pw);
    //var obj = jwt.decode(pw, conf.jwt_secret)
    try {
      var obj = jwt.verify(pw, conf.jwt_secret);
      console.log("token ok", pw, obj);
      username == obj.u;
    } catch (error) {
      console.log("token not ok", pw, obj);
      var error = new Error('Auth error')
      error.returnCode = 4
      callback(error, false)
      return;

    }
  } else if ((username != 'demo') || (pw != 'demo')) {
    console.log("USER IS **NOT** OK", username, pw);
    var error = new Error('Auth error')
    error.returnCode = 4
    callback(error, false)
    return;
  }

  cons[id] = {
    socket: s,
    pings: 0,
    last_ping: 0,
    username: username,
    password: pw,
    pubs: [],
    pub_bytes: 0,
    pub_messages: 0,
    sub_bytes: 0,
    sub_messages: 0,
    last_pub: 0,
    last_sub: 0,
    connected: stamp(),
    remoteAddress: client.conn.remoteAddress,
    servername: client.conn.servername,
    indications: {},
  }
  if (client.req) {
    cons[id].remoteAddress = client.req.ari.remoteAddress
    cons[id].servername = client.req.ari.servername
  }

  console.log("USER IS OK", username, pw);
  send_ind_state()
  callback(null, true)
}

const certs = {}

init_users = () => {
  olds = {}
  for (var p in conf.users) {
    pub_bytes = 0
    pub_messages = 0
    sub_bytes = 0
    sub_messages = 0
    since = stamp()
    if (conf.users[p].username in olds) {
      pub_bytes = olds[conf.users[p].username].pub_bytes
      pub_messages = olds[conf.users[p].username].pub_messages
      sub_bytes = olds[conf.users[p].username].sub_bytes || 0
      sub_messages = olds[conf.users[p].username].sub_messages || 0
      since = olds[conf.users[p].username].since
    }
    users[conf.users[p].username] = {
      pub_bytes: pub_bytes,
      pub_messages: pub_messages,
      sub_bytes: sub_bytes,
      sub_messages: sub_messages,
      since: since,
      sessions: 0
    }
    user_stats[conf.users[p].username] = {
      pubs: [],
      subs: []
    }
  }
}

registerAPI('ping', "Ping", [], msg => {
  console.log('WE WERE PINGED - AND PONGED BACK')
  return { pong: true }
})

registerAPI("api", "Get API", [], (msg) => {
  var ret = []
  for (var c of Object.keys(apis)) {
    ret.push({
      cmd: c,
      descr: apis[c].descr,
      args: apis[c].args,
    })
  }
  return ret;
})

const options = {
  SNICallback: (servername, cb) => {
    var ok = hostcheck(servername)
    if (!ok) {
      console.log("bad url at tls", servername)
      cb(null)
      return;
    }
    key_fn = `${conf.acme_home}/${servername}/${servername}.key`.replace('~', home_dir)
    cer_fn = `${conf.acme_home}/${servername}/fullchain.cer`.replace('~', home_dir)
    if (!fs.existsSync(key_fn)) {
      console.error(`*** no tls file for ${servername} ${key_fn} at ${__dirname}`)
    }
    if (!fs.existsSync(cer_fn)) {
      console.error(`*** no tls files for ${servername} ${cer_fn} at ${__dirname}`)
    }
    if (!(servername in certs)) {
      try {
        certs[servername] = tls.createSecureContext({
          key: fs.readFileSync(key_fn),
          cert: fs.readFileSync(cer_fn)
        })
      } catch (error) {
        console.log('no tls', servername)
      }
    }
    const ctx = certs[servername]
    if (!ctx) {
      console.log(`Not found SSL certificate for host: ${servername}`)
    }
    if (cb) {
      cb(null, ctx)
    } else {
      return ctx
    }
  }
}
setInterval(() => {
  if (do_send_ind_state) {
    //save_state()
    send_ind_state()
    do_send_ind_state = false;
  }
}, 1000)

config = (_argv, _conf) => {
  argv = _argv;
  conf = _conf;
  init_users()
  return aedes;
}

console.log(`MQTT Service Starting.. `)

module.exports = {
  config,
  registerAPI,
}