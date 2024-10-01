class RedgeLomake extends RedgeFront {
  constructor(mq, conf, id, name, fdata) {
    super(mq, conf, id, name);
    this.state.fdata = fdata;

    register_button_handler("LOGIN_LOGIN", "index", async (obj) => {
      console.log("LOGIN_LOGIN BUT!! at lomake", obj);
    })
    register_button_handler('RENDER', "", (conf, id) => {
      log_magenta("Lomake renderöity !*****!!")
    });
  }

  deconstructor() {
    super.deconstructor()
    deregister_button_handler("LOGIN_LOGIN", "index");
  }

  render(rebuild) {
    super.render(rebuild)
  }

  set_message(level, header, msg, icon) {
    $(`#${this.id}_msg_header`).html(header || "")
    $(`#${this.id}_msg_body`).html(msg || "")
    $(`#${this.id}_msg`).removeClass('success')
    $(`#${this.id}_msg`).removeClass('negative')
    if (icon) {
      $(`#${this.id}_msg_icon`).prop('class', `icon ${icon}`)
      $(`#${this.id}_msg_icon`).show()
    } else {
      $(`#${this.id}_msg_icon`).hide()
    }

    $(`#${this.id}_msg`).addClass(level)
    $(`#${this.id}_msg`).show()
  }

  sync(req) {
    if (!(req.form in window.json_forms)) {
      throw (`No form '${req.form}' Defined`)
    }

    this.state.form = window.json_forms[req.form];
    this.state.full_data = req;

    for (var fld of this.state.form.fields) {
      if (("default" in fld) && (!this.state.fdata[fld.key])) {
        this.state.fdata[fld.key] = fld.default
      }

      if (!("validate" in fld)) {
        fld.validate = {};
      }

      if (fld.type == 'number') {
        if (("format" in fld) && (fld.format != 'd')) {
          if (!("min" in fld.validate)) {
            fld.validate.min = 0;
          }
          if (!("max" in fld.validate)) {
            if (fld.format == 'x')
              fld.validate.max = Math.pow(2, 8 * fld.size);
            else if (fld.format == 'b')
              fld.validate.max = Math.pow(2, fld.size);
          }
        }
      }
    }
    $('select.dropdown').dropdown();
    $('.ui.checkbox').checkbox();
  }

  i2bin(val, size = 8) {
    var rval = '0b'
    for (var b = size - 1; b >= 0; b--) {
      if (val & (1 << b))
        rval += '1';
      else
        rval += '0';
    }
    return rval;
  }

  populate(fname) {
    super.populate(fname)
    this.validate()

    for (var fld of this.state.form.fields) {
      if (fld.type == "button") {
        if (fld.hidden)
          $(`#${this.id}_${fld.key}`).parent().addClass('d-none');
        else
          $(`#${this.id}_${fld.key}`).parent().removeClass('d-none');

      }
      if (fld.type != "button" && fld.type != "buttons" && ((!fname) || (fname == fld.key))) {
        var el = $(`#${this.id}_${fld.key}`)[0]
        if (!el) {
          console.log("form el missin", this.id, fld,this.name, `#${this.id}_${fld.key}`, $(`#${this.id}_${fld.key}`));
        } else {
          var val
          switch (fld.type) {
            case 'log':
              val = this.state.fdata[fld.key] || ""
              break;
            case 'text':
              val = this.state.fdata[fld.key] || ""
              break;
            case 'select':
              val = this.state.fdata[fld.key] || ""
              {
                var s = '';
                for (var o of fld.values)
                  s += `<option value="${o.key}">${o.val}</option>`
                $(`#${this.id}_${fld.key}`).html(s)
              }
              break;
            case 'number':
              val = this.state.fdata[fld.key] || 0
              if (fld.format == 'b' && val > 0) {
                var rval = '0b'
                for (var b = fld.size - 1; b >= 0; b--) {
                  if (val & (1 << b))
                    rval += '1';
                  else
                    rval += '0';
                }
                val = rval;
              } else if (fld.format == 'x' && val > 0)
                val = sprintf(`0x%0${(fld.size || 4) * 2}X`, parseInt(val))
              else
                val = sprintf(`%d`, 1 * parseInt(val))
              break
          }
          el.value = val
        }
      }
    }
    $('select.dropdown').dropdown();
    $('.ui.checkbox').checkbox();
  }

  update(data) {
    for (var fld of this.state.form.fields) {
      var old_value = this.state.fdata[fld.key]
      if (fld.key in data) {
        if (fld.type != "button")
          if (this.state.fdata[fld.key] != data[fld.key]) {
            this.state.fdata[fld.key] = data[fld.key]
            this.populate(fld.key);
          }
      }
    }
  }

  hide(key) {
    $(`#${this.id}_${key}`).hide();
  }

  addClass(key, c) {
    $(`#${this.id}_${key}`).addClass(c);
  }

  removeClass(key, c) {
    $(`#${this.id}_${key}`).removeClass(c);
  }

  show(key) {
    $(`#${this.id}_${key}`).show();
  }

  parseInt(value) {
    var val;
    if (value.substring(0, 2) == '0b') {
      val = parseInt(value.substring(2), 2);
      log("BIN", value.substring(2), val)
    }
    else
      val = parseInt(value);
    return val
  }

  validate() {
    for (var fld of this.state.form.fields) {
      var value = this.state.fdata[fld.key]
      var feedback = []
      fld.valid = true
      if (Object.keys(fld.validate).length > 0) {
        var validated = false;
        if (fld.optional) {
          if (!document.getElementById(`${this.id}_${fld.key}_toggle`).checked) {
            continue;
          }
        }
        fld.valid = false
        switch (fld.type) {
          case 'text':
            console.log("ERRRRRR ????", fld);
            if (value)
              fld.valid = true;
            validated = true;
            break;
          case 'number':
            //console.log("validates", fld.key, fld.validate, value);
            fld.valid = true;
            if (typeof value == "string") {
              if (value.substring(0, 2) == '0b') {
                val = parseInt(value.substring(2), 2);
              }
              else
                val = parseInt(value);
            } else
              val = value
            var bits = fld.size * 8;
            if (fld.format == 'b')
              bits = fld.size;
            if (fld.show_hex)
              $(`#${this.id}_${fld.key}_show_hex`).html(sprintf(`0x%0${bits / 4}X`, val))
            if (fld.show_bin)
              $(`#${this.id}_${fld.key}_show_bin`).html(this.i2bin(val, bits))
            if (fld.show_dec)
              $(`#${this.id}_${fld.key}_show_dec`).html(sprintf(`%d`, val))

            if ("min" in fld.validate) {
              if (val < fld.validate.min) {
                fld.valid = false;
                feedback.push(`must be bigger than ${fld.validate.min}${fld.unit || ''} (now:${val})`)
              }
            }
            if ("max" in fld.validate) {
              if (val >= fld.validate.max) {
                fld.valid = false;
                var max = fld.validate.max - 1
                if (("format" in fld) && (fld.format != 'd')) {
                  max = sprintf(`0x%X`, max)
                  val = sprintf(`0x%X`, val)
                }
                feedback.push(`must be less or equal than ${max}${fld.unit || ''} (now:${val})`)
              }
            }
            validated = true;
            break;
        }
        if (validated) {
          if (fld.valid) {
            $(`#${this.id}_${fld.key}`).closest('.field').removeClass("error")
            $(`#${this.id}_${fld.key}_feedback`).hide()
            $(`#${this.id}_${fld.key}_feedback`).html("")
          } else {
            console.log("ERRRRRR", `#${this.id}_${fld.key}`);
            $(`#${this.id}_${fld.key}`).closest('.field').addClass("error")
            $(`#${this.id}_${fld.key}_feedback`).html(feedback.join(','))
            $(`#${this.id}_${fld.key}_feedback`).show()
          }
        }
      } else {
        $(`#${this.id}_${fld.key}`).closest('.field').removeClass("error")
      }
      //console.log("validate", fld.key, fld.type, value);
    }
    //console.log("validated", this.state.form);
  }

  onEvent(obj) {
    super.onEvent(ob)
    var fld = this.state.form.fields.find(o => obj.key == o.key)
    //console.log("lomakkeen onEvent", fld, obj);
    switch (obj.event) {

      case 'focusout':
        //console.log("DUH!!!!!!!!", fld, obj);
        if (fld && (fld.type != 'button') && (fld.type != 'bool')) {
          var val = $(`#${this.id}_${obj.key}`)[0].value
          this.state.fdata[obj.key] = val;
          //log("set", obj.key, val, this.state.fdata)
          this.populate(obj.key);
          this.validate()
        }
        break;
      case 'click':
        if (obj.data.toggle) {
          log("toggleri", this.id, this.state.req, this.state.fdata, `#${this.id}_${obj.key}_toggle`)
          log($(`#${this.id}_${obj.key}`).enabled)
          log("result", document.getElementById(`${this.id}_${obj.key}_toggle`).checked)
          document.getElementById(obj.data.toggle).disabled = !document.getElementById(`${this.id}_${obj.key}_toggle`).checked;
          var checked = document.getElementById(`${this.id}_${obj.key}_toggle`).checked
          $(`#${this.id}_${obj.key}_plus`).prop('disabled', !checked);
          $(`#${this.id}_${obj.key}_minus`).prop('disabled', !checked);
          if (!checked) {
            $(`#${this.id}_${obj.key}_feedback`).removeClass("d-block")
          } else {
            this.validate();
          }
          return
        } else if (obj.data.act) {
          console.log("ACT", this.id, obj.data.act, obj);
          var val = 1 * parseInt($(`#${this.id}_${obj.key}`)[0].value);
          switch (obj.data.act) {
            case 'plus':
              this.state.fdata[obj.key] = val + 1;
              break;
            case 'minus':
              this.state.fdata[obj.key] = val - 1;
              break;
          }
          this.populate(obj.key);
          this.validate();
          return;
        } else if (obj.data.event) {
          emit_button_event(obj.data.event, { ...this.state.fdata, button: obj.key }, this.id)
        // } else {
        //   log("button?", this.id, obj, this.state.fdata)
        }
        break;
      default:
        var val
        if (fld && (fld.type == 'bool')) {
          val = $(`#${this.id}_${obj.key}`).hasClass("checked")
          console.log("CHEKKI", val);
        } if (fld && (fld.type == 'number')) {
          val = 1 * this.parseInt($(`#${this.id}_${obj.key}`)[0].value);
          console.log("CHEKKI NUM", val);
        } else if (fld) {
          val = $(`#${this.id}_${obj.key}`)[0].value;
        } else
          return

        if (this.state.fdata[obj.key] != val) {
          log_green("Changed id=%d fld='%s' val: '%s' -> '%s'", this.id, fld.key,  this.state.fdata[obj.key], val)
          this.state.fdata[obj.key] = val;
        }
        //console.log("formi", this.state.fdata);
        //this.populate(obj.key);
        this.validate();
        return
        break;
    }
    obj.e.preventDefault();
    preserved_state[this.name] = JSON.parse(JSON.stringify(this.state.fdata));
  }
}
