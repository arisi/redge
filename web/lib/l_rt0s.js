
window.Rt0s = class Rt0s {
  constructor(url, app, uid, pw, onChangeState) {
    this.sublist = {};
    this.apis = {};
    this.reqs = {};
    this.req_inds = {};
    this.sreqs = {}
    this.req_seq = 0
    this.connected = false;
    this.connected_reported = false;
    this.onChangeState = onChangeState;
    this.client = null;
    this.current_user = '';
    this.current_user_stamp = 0;
    this.visitorId = "?"
    this._url = url
    this._app = app
    this._uid = uid
    this._pw = pw
    this.token = ""
    //this.dut = "dut2"
    this.dut = "tif"

    if (true) {
      const fpPromise = import('https://openfpcdn.io/fingerprintjs/v3')
        .then(FingerprintJS => FingerprintJS.load())
      fpPromise
        .then(fp => fp.get())
        .then(result => {
          this.cpu_id = result.visitorId
          this._cid = result.visitorId + "_" + (Rt0s.stamp().toString()+ ":" +this._app )
          this.do_connect(this._uid, this._pw)
        })
    } else
      this.do_connect(this._uid, this._pw)

    this.registerAPI('ping', "pings", [], (msg) => {
      console.log('WE WERE PINGED - AND PONGED BACK');
      return { pong: true };
    });

    this.registerAPI("api", "Get API", [], (msg) => {
      var ret = []
      for (var c of Object.keys(this.apis)) {
        ret.push({
          cmd: c,
          descr: this.apis[c].descr,
          args: this.apis[c].args,
        })
      }
      return ret;
    })

    setInterval(() => {
      if ((this.current_user == "anon" || this.current_user == "")) {
        return;
      }
      for (var k in this.reqs) {
        var r = this.reqs[k];
        const now = Rt0s.stamp();
        if (r.done) delete this.reqs[k];
        else if (now > r.sent + r.timeout * r.tries) {
          if (r.retries > r.tries) {
            r.tries += 1;
            r.obj.resend = r.tries;
            if (r.logger)
              r.logger(`R${r.req_seq}:${r.tries}/${r.retries}:${r.obj.target}:${JSON.stringify(r.obj.req.args)}`, 'yellow')

            this.publish(`/dn/${r.obj.target}/${r.obj.mid}`, r.obj);
            r.sent = now;
          } else {
            if (r.logger)
              r.logger(`T${r.req_seq}:${r.tries}/${r.retries}:${r.obj.target}:${JSON.stringify(r.obj.req.args)}`, 'red')
            r.err('timeout');
            r.done = true;
          }
        }
      }
    }, 100);

  }

  static dates = (d) => {
    if (!d || d == 0)
      return ""
    now = stamp()
    oset = (new Date).getTimezoneOffset();
    dd = new Date(d - oset * 60 * 1000).toISOString()
    if (now - d < 24 * 60 * 60 * 1000)
      return dd.slice(11, 19);
    return dd.slice(0, 19);
  }

  static timed(d) {
    var dd = d || 0
    if (dd < 60 * 60)
      return sprintf("%d:%02d", dd / 60, dd % 60)
    else
      return sprintf("%d:%02d:%02d", dd / 3600, (dd / 60) % 60, dd % 60)
  }

  static hide_id(id) {
    var e = document.getElementById(id)
    if (e) {
      e.style.display = "none"
    }
  }

  static show_id(id, style) {
    var e = document.getElementById(id)
    if (e) {
      e.style.display = style ? style : "block"
    }
  }

  static $(sel) {
    switch (sel.substring(0, 1)) {
      case '#':
        return document.getElementById(sel.substring(1))
    }
    return ""
  }

  static async get_file(fn) {
    return new Promise((res) => {
      fetch(fn)
        .then((resp) => {
          return resp.text()
        })
        .then(function(data) {
          res(data)
        })
    });
  }
  static async get_binary_file(fn) {
    return new Promise((res) => {
      fetch(fn)
        .then((resp) => {
          return resp.arrayBuffer()
        })
        .then(function(data) {
          res(data)
        })
    });
  }

  static uuidv4() {
    var result = '';
    for (var j = 0; j < 32; j++) {
      if (j == 8 || j == 12 || j == 16 || j == 20) result = result + '-';
      result = result + Math.floor(Math.random() * 16).toString(16).toUpperCase();
    }
    return result;
  };
  /*
    async rt0s_read(size, address, data_len) {
      //await Rt0s.sleep(10)
      var verb
      if (size == "B")
        verb = "read8"
      else if (size == "W")
        verb = "read16"
      else if (size == "L")
        verb = "read32"
      else
        return []
      var ret = await mq.req(this.dut, [verb, { address, data_len }], {})
      if (ret && "data" in ret)
        return ret['data']
      else
        return []
    }

    async rt0s_write(size, address, data) {
      //await Rt0s.sleep(10)
      var verb
      if (size == "B")
        verb = "write8"
      else if (size == "W")
        verb = "write16"
      else if (size == "L")
        verb = "write32"
      else
        return false
      var ret = await mq.req(this.dut, [verb, { address, data_len: data.length, data:data }], {})
      console.log("rt0s_write",size,address,data,ret);
      return ret
    }
  */
  static async sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  };

  static stamp() {
    return new Date().getTime();
  };
  static stamps() {
    return new Date().getTime() / 1000;
  };

  static match(filter, topic) {
    const filterArray = filter.split('/');
    const length = filterArray.length;
    const topicArray = topic.split('/');

    for (var i = 0; i < length; ++i) {
      var left = filterArray[i];
      var right = topicArray[i];
      if (left === '#') return topicArray.length >= length - 1;
      if (left !== '+' && left !== right) return false;
    }
    return length === topicArray.length;
  };

  change_state(newstate) {
    if (this.connected == newstate && newstate == false) {
      this.client.end(true, () => {
        delete this.client;
        this.client = {};
        log_red("** MQTT Client Deleted");
      });
      return;
    }
    if (newstate && this.current_user_stamp == 0)
      this.current_user_stamp = Rt0s.stamp()

    if (this.connected == newstate) return;
    this.connected = newstate;
    if (newstate) {
      Rt0s.sleep(50).then(() => {
        if (this.connected != this.connected_reported) {
          this.onChangeState(this.connected);
          this.connected_reported = this.connected;
        }
      });
    } else if (this.connected != this.connected_reported) {
      this.onChangeState(this.connected);
      this.connected_reported = this.connected;
    }
  }

  end() {
    // if (this.client)
    //   this.client.end(true);
    //this.change_state(false);
  };

  reconnect() {
    client.reconnect();
  };

  send_ind(path, obj, options = {}) {
    try {
      this.client.publish(`/ind/${this._cid}/${path}`, JSON.stringify(obj), options);
    } catch (error) {
      console.error('ERR broadcast:', error);
    }
  };

  req_ind(src, topic, name, cb) {
    var key = src + "_" + topic
    var path = "/ind/" + src + "/" + topic
    // if (!(this.req_inds[name])) {
    //   this.req_inds[name] = []
    // }
    var len = this.req_inds[name] = {
      'src': src,
      'topic': topic,
      'key': key,
      path,
      'cb': cb,
    }
    //if (len == 1) // first of the kind => need to subs
    this.client.subscribe(path)
    //return len - 1; // return position
  }

  unreq_ind(src, topic, name) {
    var key = src + "_" + topic
    console.log("unreq_ind",src,topic,key,name,this.req_inds);
    if (!(this.req_inds[name]))
      return // no ind => nothing to do
    delete (this.req_inds[name])
  }

  publish(path, obj, options = {}) {
    try {
      this.client.publish(path, JSON.stringify(obj), options);
    } catch (error) {
      console.error('ERR publish:', error);
    }
  };

  subscribe(topic, cb) {
    this.client.subscribe(
      topic,
      function(err) {
        if (err) {
          console.error('ERR subscribe:', err);
        } else {
          if (cb)
            this.sublist[topic] = cb;
        }
      }.bind(this)
    );
  };

  registerAPI(path, descr, args, cb) {
    this.apis[path] = {
      "f": cb,
      descr,
      args,
    };
  }

  async req(target, msg, options, logger) {
    return new Promise((ok, err) => {

      if ((this.current_user == "anon" || this.current_user == "") && target != "manager") {
        console.log("no reqs for anon", target, this.current_user);
        ok({ results: [] })
        return
      }
      var obj = {
        mid: Rt0s.uuidv4(),
        src: this._cid,
        target: target,
        req: { args: msg },
        token: this.token,
      };
      this.req_seq += 1
      this.reqs[obj['mid']] = {
        obj: obj,
        logger,
        ok: ok,
        err: err,
        done: false,
        created: Rt0s.stamp(),
        sent: Rt0s.stamp(),
        tries: 1,
        retries: 'retries' in options ? options.tries : 3,
        timeout: 'timeout' in options ? options.timeout : 3000,
        req_seq: this.req_seq,
      }
      if (this.reqs[obj['mid']].logger)
        this.reqs[obj['mid']].logger(`S${this.reqs[obj['mid']].req_seq}:1/${this.reqs[obj['mid']].retries}:${target}:${JSON.stringify(obj.req.args)}`, 'white')
      this.publish(`/dn/${target}/${obj['mid']}`, obj);
    })
  };

  do_subs() {
    this.subscribe(`/up/${this._cid}/+`, (topic, obj) => {
      if (obj['mid'] in this.reqs) {
        var r = this.reqs[obj['mid']];
        if (r.logger)
          r.logger(`R${r.req_seq}:${r.tries}/${r.retries}:${r.obj.target}:${JSON.stringify(obj.reply)}`, 'lightgreen')

        r.done = true;
        r.ok(obj.reply);
      } else {
        hit = Rt0s.match(/\/up\/(.+)\/(.+)/, topic)
        if (hit) {
          if (hit[2] in sreqs) {
            sreqs[hit[2]](hit[2], obj)
          }
        }
      }
    });

    this.subscribe(`/dn/${this._cid}/+`, (topic, msg) => {
      if (msg['req']['args'][0] in this.apis) {
        var api = this.apis[msg['req']['args'][0]];
        var reply = api['f'](msg);

        if (reply == null) {
          console.log('api will reply later');
          return;
        }
        msg['reply'] = reply;
      } else if ('*' in this.apis) {
        var api = this.apis['*'];
        var reply = api['f'](msg);

        if (reply == null) {
          return;
        }
        msg['reply'] = reply;
      } else
        msg['reply'] = {
          error: `no api '${msg['req']['args'][0]}'`,
        };
      this.publish(`/up/${msg['src']}/${msg['mid']}`, msg);
      return;
    });
  };

  do_connect(_uid, _pw) {
    this.current_user = _uid
    this.current_user_stamp = 0
    if (this.connected)
      this.end()
    this.client = mqtt.connect(this._url, {
      reconnectPeriod: 10000,
      clean: true,
      username: _uid,
      password: _pw,
      clientId: this._cid,
    });
    this.onChangeState(this.connected);

    this.client.on('connect', function() {
      this.change_state(true);
      if (this.current_user != "anon")
        this.send_ind("state", { "state": "online", "stamp": Rt0s.stamp() }, { retain: false, qos: 2 });
      this.do_subs();
    }.bind(this));

    this.client.on('disconnect', function(err) {
      log_red("** MQTT Disconnected");
      this.change_state(false);
    }.bind(this));

    this.client.on('offline', function(err) {
      log_red("** MQTT Offline");
      this.change_state(false);
    }.bind(this));

    this.client.on(
      'message',
      function(topic, msg) {
        for (var key of Object.keys(this.req_inds)) {
          var req_ind = this.req_inds[key]
          //console.log("chkxxx", key, req_ind,Object.keys(this.req_inds));
            var ind = req_ind
            if (Rt0s.match(ind['path'], topic)) {
              var obj = JSON.parse(msg.toString());
              var p = topic.split("/");
              obj.device = p[2]
              obj.indication = p[3]
              obj.received = Rt0s.stamp();
              ind['cb'](ind, obj);
            }

        }
        Object.keys(this.sublist).forEach(sub => {
          if (Rt0s.match(sub, topic)) {
            try {
              var obj = JSON.parse(msg.toString());
              obj.received = Rt0s.stamp();
              this.sublist[sub](topic, obj);
            } catch (error) {
              console.log('bad handler', topic, this.sublist, msg.toString());
            }
          }
        });
      }.bind(this)
    );


  };
}
