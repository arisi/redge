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
      return $_.devices[dev].handler
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
            var handler = {}
            for (var a of api) {
              var args = []
              var params= []
              for (var aa of a.args) {
                args.push(aa.name)
                params.push(`"${aa.name}":${aa.name}`)
              }
              handler[a.cmd] = eval(`async (${args.join()}) => { return await mq.req("${con}", ['${a.cmd}',{${params}}], {}) }`)
            }

            $_.devices[con] = {
              connected: c.connected,
              api,
              handler,
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