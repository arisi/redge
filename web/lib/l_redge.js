const log = console.log.bind(console);
var reload_req = 0;
$$ = {
  objects: [],
  buttons: {},
  preserved_state: {},
  idc: 1,
}

var requireSync = async (fn) => {
  var i = preloads.findIndex((a) => a == fn);
  if (i != -1) {
    preloads.splice(i, 1);
  }
  return new Promise((res, err) => {
    require([fn], (foo) => {
      res(foo)
    });
  });
}

$(document).ready(async () => {
  await requireSync("l_util.js");
  await requireSync("l_hb.js");
  log_green("Rt0s Edge Web Front:\n");
  await requireSync("l_test.js");
  lib_testeri();

  const urlSearchParams = new URLSearchParams(window.location.search);
  window.args = Object.fromEntries(urlSearchParams.entries());
  for (var [key, val] of Object.entries(args)) {
    if (val == 'true')
      args[key] = true
    else if (val == 'false')
      args[key] = false
    else {
      var num = parseInt(val)
      if (val == `${num}`) {
        args[key] = num;
      }
    }
  }
  window.conf = JSON.parse(await Rt0s.get_file("conf.json"))
  console.log("preloads", preloads);

  for (preload of preloads) {
    var hit = preload.match(/(.+)\.(.+)$/);
    if (hit) {
      var base = hit[1]
      var ext = hit[2]
      if ((ext == 'js') && ((base.substring(0, 6) == 'redge-') || (base.substring(0, 4) == 'lib-'))) {
        await requireSync(base);
        log_green("preload: JS created '%s'", preload);
      } else if ((ext == 'hbs') && (base.substring(0, 2) == 'p_')) {
        var key = base;
        var ss = "";
        if (window.args.debug !== undefined && window.args.debug != 'false') {
          var debug = "";
          debug = `<div class="banner">ID:{{id}}<br>`
          debug += `{{#each req}}`
          debug += `req:{{@key}}: {{@this}}<br>`
          debug += `{{/each}}`
          debug += `{{#each args}}`
          debug += `arg:{{@key}}: {{@this}}<br>`
          debug += `{{/each}}`
          debug += `</div>`
          ss = debug + ss;
        }
        ss += `{{#> ${key} state=state args=args}} ${key} Missing {{/${key}}}`
        window[`hbs_${key}`] = Handlebars.compile(ss)
        var s = await Rt0s.get_file(preload);
        Handlebars.registerPartial(key, s);
        log_green("preload: HB created '%s'", key);
      } else if ((ext == 'json') || (ext == 'json5')) {
        var key = `json_${base}`;
        var s = await Rt0s.get_file(preload);
        window[`${key}`] = JSON5.parse(s)
        log_green("preload: JSON created '%s'", key);
      }
    }
  }

  for (preload of preloads) {
    var hit = preload.match(/(.+)\.(.+)$/);
    if (hit) {
      var base = hit[1]
      var ext = hit[2]
      if ((ext == 'js') && (base.substring(0, 2) == 'p_')) {
        var s = await Rt0s.get_file(preload);
        var ss = `window.js_${base} = ${s}\n`
        eval(ss)
        log_green("preload: JS template created '%s'", preload);
      }
    }
  }

  let observer = new MutationObserver((m) => {
    for (var o in m) {
      for (var el of m[o].addedNodes) {
        update_element(el)
      }
    }
  });

  window.register_button_handler = (name, id, cb) => {
    if (!(name in $$.buttons))
      $$.buttons[name] = {}
    $$.buttons[name][id] = cb;
  }

  window.deregister_button_handler = (name, id) => {
    if ((name in $$.buttons))
      $$.buttons[name][id] = undefined;
  }

  window.emit_button_event = (name, obj, id) => {
    log_magenta("emit_button_event name='%s' id=%s %s", name, id, JSON.stringify(obj));
    if ((name in $$.buttons)) {
      for (var [_id, b] of Object.entries($$.buttons[name])) {
        if (b)
          b(obj, id)
      }
    }
  }

  window.update_element = async (el, js_reload) => {
    var cl = $(el).children()
    if (cl && cl.length) {
      for (var c of cl) {
        update_element(c, js_reload)
      }
    }
    var src = $(el).data("src")
    if (src) {
      var old_id = $(el).attr('data-id');
      var name = $(el).attr('name')
      var id
      var ddd = $(el).html();

      if (old_id) {
        id = old_id
      } else {
        id = $$.idc++
        var old = $$.objects.findIndex(o => o && (o.name == name))
        if (old != -1) {
          log_darkcyan("DELETE EL name='%s' id=%s fdata=%s", name, old, JSON.stringify($$.objects[old].state.fdata));
          $$.objects[old].deconstructor();
          delete $$.objects[old]
          $(`#${old}`).remove();
        }
      }
      var req = $(el).data();
      if (req.js) {
        if (!old_id || js_reload) {
          var name = $(el).attr('name');
          if (js_reload && old_id) {
            // try to retain form data
            var oldf = {}
            if (id in $$.objects) {
              oldf = $$.objects[id].state.fdata;
              if ("destructor" in $$.objects[id])
                $$.objects[id].destructor()
            }
            delete $$.objects[id]
            $$.objects[id] = new window[`js_${req.js}`](mq, conf, id, $(el).attr('name'), oldf, ddd)
            await $$.objects[id].sync(req)
            emit_button_event('RENDER', { id, name: $(el).attr('name') }, '');
          } else {
            if (!window[`js_${req.js}`]) {
              log_darkcyan("MISSING FILE '%s'", `${req.js}.js`)
              return;
            }
            try {
              var fdata = req.data
              if (name in $$.preserved_state) {
                fdata = $$.preserved_state[name];
              }
              log_darkcyan("CREATE EL name='%s' '%s' id=%d data='%s'", $(el).attr('name'), req.js, id, JSON.stringify(fdata));
              $$.objects[id] = new window[`js_${req.js}`](mq, conf, id, $(el).attr('name'), fdata, ddd)

            } catch (error) {
              console.log("new errs", `js_${req.js}`, error);

            }
            if (!window[`hbs_${req.js}`]) {
              log_darkcyan("MISSING FILE '%s'", `${req.js}.hbs`)
              return;
            }
            try {
              await $$.objects[id].sync(req)
              emit_button_event('RENDER', { id, name: $(el).attr('name') }, '');
            } catch (error) {
              console.error("ERROR1", req, src, error);
              $(el).html(`<b>ERROR: '${src}': ${error}</b>`);
              return
            }
          }
        }
      }
      var state;
      if (!(id in $$.objects)) {
        return
      }
      state = $$.objects[id].state
      if (!window[src]) {
        log_darkcyan("UNDEFINED %s", src)
        return;
      }
      $(el).html(window[src]({
        id,
        state,
        req,
        args: window.args,
      }))
      $(el).attr('id', id)
      $(el).attr('data-id', id)
      $$.objects[id].populate("") // populate the contents
    }
  }

  var do_loader = async (event, preload, s, initial) => {
    var hit = preload.match(/(.+)\.(.+)$/);
    if (hit) {
      if ((event == 'created') && (preloads.includes(preload))) {
        return;
      }
      var base = hit[1]
      var ext = hit[2]
      var key = `${ext}_${base}`;
      log_magenta("LIVE %s: '%s' (%s,%s,%s) ...", event, preload, base, ext, key);
      switch (event) {
        case 'modified':
          switch (ext) {
            case 'css':
              $(`style[data-src='${key}']`).remove();
              $("head").append(`<style data-src="${key}">${s}</style>`);
              break;
            case 'hbs':
              if (window.args.debug !== undefined && window.args.debug != 'false') {
                var debug = "";
                debug = `<div class="banner">ID:{{id}}<br>`
                debug += `{{#each req}}`
                debug += `req:{{@key}}: {{@this}}<br>`
                debug += `{{/each}}`
                debug += `{{#each args}}`
                debug += `arg:{{@key}}: {{@this}}<br>`
                debug += `{{/each}}`
                debug += `</div>`
                s = debug + s;
              }
              log_green("HB updated '%s'", key);
              window[`${key}`] = Handlebars.compile(s)
              if ($$.objects[0])
                $$.objects[0].render(true)
              else
                for (var el of $(`div[data-src='${key}']`))
                  update_element(el)
              break;
            case 'json5':
            case 'json':
              key = `json_${base}`;
              window[`${key}`] = JSON5.parse(s)
              if (!initial) {
                //redraw everything to be sure
                $$.objects[0].render(true)
              }
              log_green("JSON %s '%s'", event, key);
              break;
            case 'js':

              if ((base.substring(0, 6) == 'redge-')) {
                if (!initial) {
                  reload_req = stamp() + 100;
                }
                return;
              }
              console.log("********* RELOAD?", base);
              if ((base == 'p_index')) {
                if (!initial) {
                  reload_req = stamp() + 100;
                }
                console.log("********* RELOAD");
                return;
              }
              if (base.substring(0, 2) == 'l_') {
                await requireSync(preload);
                log_green("preload: JS update '%s'", preload);
                return;
              }
              try {
                log_green("JS updated '%s' EL '%s'", key, `[data-js='${base}']`);
                var ss = `window.${key} = ${s}\n`
                eval(ss)
                if ($$.objects[0])
                  $$.objects[0].render(true)
              } catch (error) {
                log(`js err in ${key}`, error)
              }
              try {
                for (var el of $(`[data-js='${base}']`)) {
                  log("hits ?? update_element", el)
                  update_element(el, true)
                }
              } catch (error) {
                log(`update errs ${key}`, error)
              }
              break;
            default:
              window[`${key}`] = s
          }
          break;
        case 'deleted':
          var i = preloads.findIndex((a) => a == preload);
          if (i != -1) {
            //remove from preloads, so next create will be done
            preloads.splice(i, 1);
          }
          window[`${key}`] = undefined;
      }
    }
  }

  var tick = () => {
    var now = stamp();
    if (reload_req && now > reload_req) {
      log("RELOAD")
      reload_req = 0;
      location.reload();
    }
    for (var [k, o] of Object.entries($$.objects)) {
      if ('tick' in o) {
        o.tick()
      }
    }
  }
  setInterval(tick.bind(this), 100)
  var done = false

  var onChange = async (s) => {
    if (s)
      log_magenta("Connected\n");
    else
      log_magenta("Connecting ...");

    if (!s && !done) {
      mq.end()
      return;
    }
    if (s && !done) {

      done = true;
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterDataOldValue: true
      });

      // Build page at startup time
      var id = 0;
      var page = args.page || `index`
      if (!(`hbs_p_${page}` in window)) {
        log_red("MISSING page: '%s', defaulting to index", page);
        page = 'index';
      }
      try {
        log_darkcyan("CREATE EL name='%s' id=%d as root", page, id);
        $$.objects[id] = new window[`js_p_${page}`](mq, conf, id, 'index')
      } catch (error) {
        alert(error);
        return;
      }
      if ('sync' in $$.objects[id])
        try {
          await $$.objects[id].sync({})
        } catch (error) {
          $("body").html(`<b>ERROR: '${page}': ${error}</b>`);
          return
        }
      $("body").html(window[`hbs_p_${page}`]({ id: 0, args: window.args, conf }))
      $("body").attr('id', 0)
      $("body").attr('data-id', 0)
      $("body").attr('data-js', `p_${page}`)
      $("body").attr('data-src', `hbs_p_${page}`)

      mq.req_ind(`site_${conf.site}`, "updates", (a, status) => {
        log_darkcyan("CHANGED SOURCE '%s'", status.fn)
        do_loader(status.event, status.fn, status.payload)
      })
    }
  }

  var do_get_preload = async (preload) => {
    var s = await Rt0s.get_file(preload);
    do_loader('created', preload, s, true)
  }

  await Promise.all(preloads.map(preload => do_get_preload(preload)))
  window.token = localStorage.getItem('token')
  if (window.token) {
    try {
      var jwt = KJUR.jws.JWS.parse(window.token)
      window.user = jwt.payloadObj.u
    } catch (error) {
      log_darkcyan("bad token");
    }
  }
  var u = "demo", pw = "demo"
  if (window.token > "") {
    u = "token"
    pw = window.token

  }

  var mq = window.mq = new window.Rt0s(conf.mqtt, "web", u, pw, onChange)

  for (var event of ['click', 'focusout', 'keyup', 'change'])
    document.addEventListener(event, (e) => {
      if (e && e.target) {

        var key = "", hit;
        for (var p of $(e.target).parents()) {
          key = $(p).data('src')
          if (key) {
            hit = p;
            break;
          }
        }
        var id = parseInt($(hit).attr('id'));
        log_green("EVENT '%s' id=%d key='%s'", event, id, key);
        if ($$.objects[id]) {
          $$.objects[id].onEvent({
            e,
            listener: event,
            event: e.type,
            target: e.target,
            id,
            key: $(e.target).data('key'),
            data: $(e.target).data(),
          })
        }
      }
    });
});
