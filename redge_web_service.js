const fs = require('fs')
const os = require('os')
const sprintf = require('sprintf')
const https = require('https')
const jwt = require('jsonwebtoken')
const ws = require('websocket-stream')
const express = require('express')
const session = require('express-session')
const cors = require('cors');
const proxy = require('express-http-proxy');
var busboy = require('connect-busboy');
const tls = require('tls')
const WebSocket = require('ws');
const JSON5 = require('json5');
const path = require('path')
const dns = require('dns')
const Handlebars = require("handlebars");
const chokidar = require('chokidar');
const log = console.log.bind(console);

const certs = {}
var aedes;
var web_mq;
var conf;
var web_conf
const home_dir = os.homedir();
const pwd = process.cwd()

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

var build_index = (site) => {
  var s = ""
  var tags = []

  var tag = (t, obj, body) => {
    var o = ""
    if (obj)
      for (k of Object.keys(obj)) {
        o += ` ${k}="${obj[k]}"`;
      }
    if (['html', 'head', 'body'].indexOf(t) != -1) {
      s += `<${t}>\n`
      tags.push(t)
    } else if (['script', 'input'].indexOf(t) != -1) {
      s += `<${t}${o}>`
      if (body)
        s += body;
      s += `</${t}>\n`
    } else
      s += `<${t}${o}>\n`
  }
  var ctag = () => {
    s += `</${tags.pop()}>\n`
  }
  tag("html")
  tag("head")
  var scripts = []
  var metas = []
  var links = []
  var csss = []
  try {
    var cfn = path.join(conf.web_home, site.static, "config.json")
    oo = JSON.parse(fs.readFileSync(cfn).toString())
    scripts = oo.scripts;
    metas = oo.metas;
    links = oo.links;
    csss = oo.css;
  } catch (error) {
    console.log("no config.json for ", site, cfn);
    return ("no config.json for " + site.name);
  }
  s += `<title>${oo.title}</title>\n`
  for (var m of metas)
    tag("meta", m)
  for (var script of scripts)
    tag("script", { src: script })
  for (var link of links)
    tag("link", link)
  for (var css of csss)
    tag("link", { rel: 'stylesheet', href: css, crossorigin: "anonymous" })
  tag("link", { rel: 'preload', href: 'conf.json', as: 'fetch', type: "application/json", crossorigin: "anonymous" })
  var p = path.join(conf.web_home, "web/lib")
  var lpreloads = fs.readdirSync(p)
  for (var preload of lpreloads) {
    tag("link", { rel: 'preload', href: preload, as: 'fetch', type: "text/html", crossorigin: "anonymous" })
  }
  var p = path.join(conf.web_home, site.static, "dynamic")
  var preloads = fs.readdirSync(p)
  for (var preload of preloads) {
    tag("link", { rel: 'preload', href: preload, as: 'fetch', type: "text/html", crossorigin: "anonymous" })
  }
  tag("script", {}, `\nwindow.preloads=${JSON.stringify(preloads.concat(lpreloads), null, 2)};\n`)
  ctag()
  tag("body")
  var ss = ""
  var lfn = path.join(conf.web_home, site.static, "loading.html")
  if (fs.existsSync(lfn)) {
    s += fs.readFileSync(lfn) + "\n"
  } else {
    s += `<br><br><br><br><br><br><hr><h1><center>Loading site .. please wait..</center></h1><br><hr>\n`
  }
  ctag()
  ctag()
  return s;
}

var hostcheck = (h) => {
  var hits = conf.urls.filter(a => h.match(`${a}$`))
  return (hits.length > 0)
}

logger = s => {
  dd = new Date(stamp()).toISOString()
  var fn = `${argv.log_dir}/${dd.slice(0, 10)}.log`
  console.log(fn, `${dd};${s}`)
  if (argv.log_dir)
    fs.appendFile(fn, dd + ';' + s + '\n', () => { })
}

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

var web_respond = (s, req, res, next) => {
  if (!("hostname" in req)) {
    res.end()
    return
  }
  if (typeof req.hostname != "string") {
    res.end()
    return
  }

  if (!hostcheck(req.hostname)) {
    res.end()
    return
  }
  // if (req.hostname.match(/\d+\.\d+\.\d+\.\d+/) || req.hostname.match(/::ffff:\d+\.\d+\.\d+\.\d+/)) {
  //   res.end()
  //   return
  // }
  if (req.path.match(/\.php$/) || req.path.match(/\.aspx$/)) {
    res.end()
    return
  }
  var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  try {
    dns.reverse(ip, function(err, result) {
      logger(`rd;;${s.protocol};${req.hostname};${req.path};${ip};0;${result || ''}`)
    })
  } catch (error) {
    //
  }
  if (ip.slice(0, 7) == '::ffff:') ip = ip.slice(7)
  hit = false
  for (i = 0; i < s.sites.length && !hit; i++) {
    site = s.sites[i]
    for (j = 0; j < site.urls.length && !hit; j++) {
      if (req.hostname == site.urls[j]) {
        hit = site
      }
    }
  }
  if (!hit) {
    for (i = 0; i < s.sites.length && !hit; i++) {
      site = s.sites[i]
      for (j = 0; j < site.urls.length && !hit; j++) {
        if (req.hostname.match(site.urls[j])) {
          hit = site
        }
      }
    }
  }
  if (hit) {
    if (hit.redir) {
      log("redir", hit.redir)
      res.redirect(hit.redir);
      return;
    }
    var p = req.path == '/' ? '/index.html' : req.path
    var fn = `${hit.static}/${p}`
    var full_fn = path.join(conf.web_home, fn)
    if (p.substr(0, 10) == "/artefact/") {
      full_fn = path.join(conf.web_home, p)
      fn = p;
    }
    var ext = fn.split(".").pop();
    var base = fn.substr(0, fn.length - ext.length - 1);
    res.header('sid', req.sessionID)
    if (p == '/conf.json') {
      obj = {
        site: hit.name,
        sid: req.sessionID,
        ip: req.ip,
        ...web_conf,
      }
      if ('conf' in hit) {
        obj = {
          ...hit.conf,
          ...obj
        }
      }
      res.send(JSON.stringify(obj, null, 2))
    } else if (p == '/index.html' && !fs.existsSync(full_fn)) {
      res.send(build_index(hit))
      return;
    } else if (fs.existsSync(full_fn)) {
      var size = fs.statSync(full_fn).size
      dns.reverse(ip, function(err, result) {
        logger(
          `ok;${req.sessionID};${hit.name};${s.protocol};${req.hostname};${req.path};${ip};${size};${result ||
          ''}`
        )
      })
      res.sendFile(fn, { root: conf.web_home })
    } else {
      var pext = p.split(".").pop();
      var pbase = p.substr(0, p.length - pext.length - 1);

      // check libs
      //if ((pext == 'js') && (path.basename(p).substring(0,2) == 'l_')) {
        var lib_fn = path.join(conf.web_home, "web/lib", p)
        if (fs.existsSync(lib_fn)) {
          console.log("lib hit", lib_fn);
          res.sendFile(lib_fn)
          return
        }
      //}

      var html_fn = path.join(conf.web_home, hit.static, "dynamic", p)
      if (fs.existsSync(html_fn)) {
        res.sendFile(html_fn)
        return
      }
      if (ext == 'html') {
        var hb_fn = path.join(conf.web_home, hit.static, "dynamic", pbase + ".hbs")
        if (fs.existsSync(hb_fn)) {
          var ss = fs.readFileSync(hb_fn);
          const template = Handlebars.compile(ss.toString());
          res.send(template({ name: "Nils" }));
          return;
        }
      }
      if (req.method.toString() == 'POST') {
        req.pipe(req.busboy);
        console.log("Uploading...");
        req.busboy.on('file', function(fieldname, file, filename) {
          console.log("Uploading: " + filename);

          fstream = fs.createWriteStream('/tmp/img/' + filename);
          file.pipe(fstream);
          fstream.on('close', function() {
            console.log("Upload Finished of " + filename);
            res.redirect('back');
          });
        });
        return;
      }
      res.sendStatus(404)
      dns.reverse(ip, function(err, result) {
        logger(
          `nf;${req.sessionID};;${hit.name};${s.protocol};${req.hostname};${req.path};${ip};0;${result || ''};${req.method}`
        )
      })
    }
  }
}

var my_session = session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  genid: function(req) {
    var id = uuidv4()
    return id
  },
  cookie: { secure: true, maxAge: 600000 }
});

var start_services = () => {
  var p = path.join(conf.web_home, "web")
  var watchers = []
  var register_watch = (path, cb) => {
    log("reg watch", path)
    watchers.push({path, cb});
  }
  var changed = (event, path) => {
    for (var o of watchers) {
      //log("changed ", event, path, o.path, path.substr(0, o.path.length))
      if (o.path == path.substr(0, o.path.length)) {
        //log("changed HIT", event, path,o.path)
        o.cb(event,path)
      }
      // else if (o.path == path.substr(0, o.path.length)) {
      //   log("changed HIT", event, path,o.path)
      //   o.cb(event,path)
      // }
    }
  }
  chokidar.watch(p, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  })
    .on('error', (error) => log(`Watcher error: ${error}`))
    .on('ready', () => log(`.. watching ${p}`))
    .on('change', (path) => {
      changed('modified', path);
    })
    .on('add', (path) => {
      changed('created', path);
    })
    .on('unlink', (path) => {
      changed('deleted', path);
    });

  conf.sockets.forEach(s => {
    s.connected = 0
    switch (s.protocol) {
      case 'http':
      case 'https':
        {
          var app = express()
          app.set('trust proxy', 1) // trust first proxy
          app.use(cors());
          if (s.protocol == 'https') {
            app.use(function(req, res, next) {
              res.header("Access-Control-Allow-Origin", "*");
              res.header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
              res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
              next();
            });
          }
          app.use(busboy());
          app.use(my_session);
          app.use((req, res, next) => {
            return web_respond(s, req, res, next);
          });
          var appp = app
          if (s.protocol == 'https') {
            appp = https.createServer(options, app)
          }
          appp.listen(s.port, () => {
            s.sites.forEach(u => {
              if (u.redir) {
                return;
              }
              u.urls.forEach(uu => {
                console.log(`.. listening ${s.protocol}://${uu}:${s.port}`)
              })
              var p = path.join(conf.web_home, u.static, "dynamic")
              register_watch(p, (event, path) => {
                var fn = path.substr(p.length + 1)
                var payload = ""
                if (event != 'deleted')
                  payload = fs.readFileSync(path).toString()
                log("WATCHER:", event, path, "pub", `/ind/site_${u.name}/updates`);
                web_mq.publish(
                  `/ind/site_${u.name}/updates`,
                  {event, fn, payload},
                  {}
                )
              })
            });
          })
        }
        break
      case 'mqtt':
        {
          const server = require('net').createServer(aedes.handle)
          server.listen(s.port, () => {
            console.log(`.. listening ${s.protocol}://${s.url}:${s.port}`)
          })
        }
        break
      case 'mqtts':
        {
          const sserver = require('tls').createServer(options, aedes.handle)
          sserver.listen(s.port, () => {
            console.log(`.. listening ${s.protocol}://${s.url}:${s.port}`)
          })
        }
        break
      case 'ws':
        {
          const httpServer = require('http').createServer()
          const server = require('net').createServer(aedes.handle)
          verifyWsClient = (info, cb) => {
            info.req.ari = {
              remoteAddress: info.req.connection.remoteAddress,
              remotePort: info.req.connection.remotePort,
              localPort: info.req.connection.localPort,
              protocol: 'ws'
            }
            cb(true)
          }
          ws.createServer({ server: httpServer, verifyClient: verifyWsClient }, aedes.handle)
          httpServer.listen(s.port, function() {
            console.log(`.. listening ${s.protocol}://${s.url}:${s.port}`)
          })
        }
        break
      case 'wss':
        {
          verifyWsClient = (info, cb) => {
            info.req.ari = {
              remoteAddress: info.req.connection.remoteAddress,
              remotePort: info.req.connection.remotePort,
              localPort: info.req.connection.localPort,
              servername: info.req.client.servername,
              protocol: 'wss'
            }
            // console.log(info.req.ari);
            cb(true)
          }
          const httpServers = https.createServer(options)
          const ws_server = ws.createServer({ server: httpServers, verifyClient: verifyWsClient }, aedes.handle)
          httpServers.listen(s.port, function() {
            console.log(`.. listening ${s.protocol}://${s.url}:${s.port}`)
          })
        }
        break
      case 'wss_hdlc':
        {
          var dump = (bytes) => {
            for (b of bytes) {
              process.stdout.write(sprintf("%02X ", b & 0xff))
            }
            console.log("");
          }
          const wss = new WebSocket.Server({ port: s.port });
          wss.binaryType = 'arraybuffer';
          wss.on('connection', function connection(ws) {
            console.log("got connection");
            ws.on('error', console.error);

            ws.on('message', function message(data) {
              ports["hdlc"].child.stdin.write(data);
              dump(data);
            });

            ports["hdlc"] = { wss_hdlc: ws };
            runner("hdlc", 'wss_hdlc');
          });
          console.log(`.. listening ${s.protocol}://${s.url}:${s.port}`)
        }
        break
      default:
        break
    }
  })
}

config = (_argv, _conf, _web_conf, _aedes) => {
  argv = _argv;
  conf = _conf;
  aedes = _aedes;
  web_conf = _web_conf;
  rt0s = require('rt0s_js');
  web_mq = new rt0s(argv.rt0s, argv.id + ":web:daemon", "demo", "demo");
  console.log('Connected to Broker at', argv.rt0s);
  web_mq.registerSyncAPI("poks", "Count Records", [], async (msg) => {
    return "jesp!"
  });
  start_services()
}

console.log(`WEB Services Started.. `)

module.exports = {
  config,
}