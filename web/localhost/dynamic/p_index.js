class RedgeIndex extends RedgeFront {
  constructor(mq, conf, id, name) {
    super(mq, conf, id, name);
    console.log("loading p_index.js");
    window.$_.devices = {}
    window.$$ = (cpu_id) => {
      var dev;
      if (!cpu_id) {
        dump_devs()
        return
      }
      if ($_.devices[cpu_id])
        dev = cpu_id;
      else {
        dev = Object.keys($_.devices).find(key => $_.devices[key].serno == cpu_id)
        if (!dev) {
          dev = Object.keys($_.devices).find(key => $_.devices[key].cpu_id == cpu_id)
        }
      }
      if (!dev) {
        dump_devs()
        return
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


    var dump_devs = () => {
      var devs = []
      for (var [d, o] of Object.entries($_.devices)) {
        devs.push([d, o.serno || ''])
      }
      var table = new AsciiTable()
        .setHeading('Id', 'Serno')
        .addRowMatrix(devs);
      console.log(table.toString());
    }

    var helper = (key) => {
      //console.log($_.devices[key].api);
      var cmds = []
      for (var a of $_.devices[key].api) {
        if (a.cmd == 'identity') continue;
        var params = []
        for (var aa of a.args) {
          if (aa.size)
            params.push(`${aa.name}:${aa.size}`)
          else if (aa.type)
            params.push(`${aa.name}:${aa.type}`)
          else
            params.push(aa.name)
        }
        cmds.push([a.cmd, a.descr, params.join()])
      }
      var table = new AsciiTable("x")
        .setHeading('Cmd', 'Descr', 'Args')
        .addRowMatrix(cmds);
      console.log(table.toString());
      return
    }

    mq.req_ind("broker", 'state', async (a, b) => {
      for (var con of Object.keys(b.cons)) {
        if (!$_.devices[con]) {
          try {
            var c = b.cons[con];
            var api = await mq.req(con, ['api'], {})
            var handler = {}
            for (var a of api) {
              var args = []
              var params = []
              for (var aa of a.args) {
                args.push(aa.name)
                params.push(`"${aa.name}":${aa.name}`)
              }
              handler[a.cmd] = eval(`async (${args.join()}) => { return await mq.req("${con}", ['${a.cmd}',{${params}}], {}) }`)
            }
            handler.help = eval(`() => { return helper("${con}") }`)

            $_.devices[con] = {
              connected: c.connected,
              api,
              handler,
            }
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
              emit_button_event('DEVICE_UPDATED', { con, ...$_.devices[con] });
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
    })
  }
  deconstructor() {
    console.log("***** deconstructor indeksi");
    super.deconstructor()
  }
}