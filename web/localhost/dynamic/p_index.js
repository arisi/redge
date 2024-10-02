class RedgeIndex extends RedgeFront {
  constructor(mq, conf, id, name) {
    super(mq, conf, id, name);
    console.log("loading p_index.js");
    window.$_.devices = {}
    window.$$ = (cpu_id) => {
      var dev;
      if ($_.devices[cpu_id])
        dev = cpu_id;
      else {
        dev = Object.keys($_.devices).find(key => $_.devices[key].serno == cpu_id)
        if (!dev) {
          dev = Object.keys($_.devices).find(key => $_.devices[key].cpu_id == cpu_id)
        }
      }
      var ret = {
        p: dev,
        path: () => {
          return dev;
        },

      };
      var module = {
        x: 42,
        getX: function () {
          return this.x;
        },
      }
      const unboundGetX = module.getX;
      const boundGetX = unboundGetX.bind(module);
      ret['getX'] = boundGetX
      var module2 = {
        x: 48,
        getX: function () {
          return this.x;
        },
      }
      const unboundGetX2 = module2.getX;
      const boundGetX2 = unboundGetX2.bind(module2);
      ret['getX2'] = boundGetX2

      for (var api of $_.devices[dev].api) {
        var a = api;

        ret[api.cmd] = () => {
          return "poks " + this.p;
        }
          //$_.devices[dev].api[0],
      }
      return ret
    }
    var getSync = async (fn) => {
      return new Promise((res, err) => {
        $.get(fn, function(data) {
          res(data)
        });
      });
    }
    var ind_state = async (a, b) => {
      //console.log("cons", b.cons);
      for (var con of Object.keys(b.cons)) {
        if (!$_.devices[con]) {
          try {
            var c = b.cons[con];
            var api = await mq.req(con, ['api'], {})
            $_.devices[con] = {
              connected: c.connected,
              api
            }
            console.log("NEW DEVICE", con);
          } catch (error) {
            console.log("tout caught", con);
          }
        }
        if (b.cons[con].indications.identity) {
          var o = b.cons[con].indications.identity;
          if ($_.devices[con]) {
            if ($_.devices[con].af != o.af) {
              $_.devices[con].serno = o.serno
              $_.devices[con].af = o.af
              if (o.af) {
                o.syms = JSON5.parse(await getSync(`artefact/${o.af}/syms.json5`));
                o.hws = JSON5.parse(await getSync(`artefact/${o.af}/hw.json5`));
              }
              emit_button_event('DEVICE_UPDATED', {con, ...$_.devices[con]});
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

    mq.req_ind("broker", 'state', ind_state)
  }
  deconstructor() {
    console.log("***** deconstructor indeksi");
    super.deconstructor()
  }
}