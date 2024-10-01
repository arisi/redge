class RedgeIndex extends RedgeFront {
  constructor(mq, conf, id, name) {
    super(mq, conf, id, name);
    console.log("loading p_index.js");
    $$.devices = {}
    var getSync = async (fn) => {
      return new Promise((res, err) => {
        $.get(fn, function(data) {
          res(data)
        });
      });
    }
    var ind_state = async (a, b) => {
      console.log("cons", b.cons);
      for (var con of Object.keys(b.cons)) {
        if (!window.devices[con]) {
          try {
            var c = b.cons[con];
            var api = await mq.req(con, ['api'], {})
            window.devices[con] = {
              connected: c.connected,
              serno: con,
              api
            }
            console.log("NEW DEVICE", con);
          } catch (error) {
            console.log("tout caught", con);
          }
        }
        if (b.cons[con].indications.identity) {
          var o = b.cons[con].indications.identity;
          if (window.devices[con]) {
            if (window.devices[con].af != o.af) {
              window.devices[con].af = o.af
              if (o.af) {
                o.syms = JSON5.parse(await getSync(`artefact/${o.af}/syms.json5`));
                o.hws = JSON5.parse(await getSync(`artefact/${o.af}/hw.json5`));
              }
              emit_button_event('DEVICE_UPDATED', {con, ...window.devices[con]});
            }
          }
        }
        if (b.cons[con].indications.ping) {
          var o = b.cons[con].indications.ping;
          //console.log("PINKI",o);
          if (window.devices[con]) {
            window.devices[con].tick = o.tick
            window.devices[con].tsent = o.sent
          }
        }
      }
      for (var dev of Object.keys(window.devices)) {
        if (!b.cons[dev]) {
          console.log("lost", dev);
          delete window.devices[dev]
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