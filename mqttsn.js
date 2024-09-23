const sprintf = require('sprintf');
const fs = require("fs")
const JSON5 = require('json5');

var schema = {}

var stamp = () => {
  return Date.now()
}

var build_c_lib = (product, build) => {
  var path = `gen/`

  console.log("buildin python to", path);
  s = ""
  s += `# pylint: disable=missing-module-docstring\n`;
  s += `# pylint: disable=missing-class-docstring\n`;
  s += `# pylint: disable=missing-function-docstring\n`;
  s += `# pylint: disable=invalid-name\n`;
  s += `\n`;
  s += `from rt0s_py import rt0s\n`
  s += `import json5,time\n`
  s += `\n`;
  s += `class ${product}_${build}_robot():\n`
  s += `  ROBOT_LIBRARY_SCOPE = "TEST SUITE"\n`
  s += `  mq = None\n`
  s += `  dut = ""\n`
  s += `  indication = False\n`
  s += `\n`;

  s += `  def __init__(self):\n`
  s += `    pass\n`
  s += `\n`;
  s += `  def rt0s_disconnect(self):\n`
  s += `    self.mq.disconnect()\n`
  s += `\n`;
  s += `  def rt0s_connect(self, url, username, password, client_id, dut, cb_indication  = None):\n`
  s += `    self.dut = dut\n`
  s += `    self.mq = rt0s(url, username=username, password=password, client_id=client_id)\n`
  s += `    if cb_indication:\n`
  s += `      self.mq.req_ind(self.dut, '+', cb_indication)\n`
  s += `\n`;

  for (const [key, msg] of Object.entries(schema.messages)) {
    if (msg.direction == 'up')
      continue;
    args = []
    alist = "";
    for (p of msg.payload) {
      var hit = p.name.match(/^(.+)_len$/);
      if (hit && msg.payload.find(i => i.name == hit[1]))
        alist += `"${p.name}": len(${hit[1]}), `
      else {
        alist += `"${p.name}": ${p.name}, `
        args.push(p.name)
      }
    }
    s += `  def rt0s_${key}(self, ${args.join(', ')}, options = None):\n`;
    if ("n" in p) {
      s += `    if isinstance(data, str):\n`;
      s += `      data = eval(data)\n`;
    }
    s += `    ret = self.mq.call(self.dut,["${key}", {${alist} } ], options)\n`

    if (msg.reply) {
      s += `    if ret:\n`;
      s += `      return ret\n`;
    } else {
      s += `    if ret and "ack" in ret:\n`;
      s += `      return ret['ack']\n`;
      s += `    if ret:\n`;
      s += `      return ret\n`;
    }
    s += `    raise AssertionError("Failed to excecute ${key}")\n`;
    s += `\n`;
  }

  fs.writeFileSync(`${path}/lib/${product}_${build}_robot.py`, s);

  console.log("buildin clib to", path);

  s = ""
  h = ""
  s += `#include "mqttsn.h"\n`;
  s += `#include "mqtt.h"\n`;
  s += `#include "puts.h"\n\n`;
  s += "unsigned int mqttsn_seq = 0;\n";
  s += "extern unsigned int last_ping;\n";
  s += "unsigned int stamp();\n";
  s += "\n";
  s += `void mqttsn_decode(int len, unsigned char *buf)\n{\n`
  s += `    int seq = mqttsn_get_bits(len, buf, 0, MQTTSN_seqlen);\n`;
  s += `    int id = mqttsn_get_bits(len, buf,  MQTTSN_seqlen, MQTTSN_idlen);\n`;
  s += `    last_ping = stamp();\n`
  s += `    int bit_position;\n`
  s += `    switch (id)\n    {\n`
  w = "";
  h += "\n";
  h += `#define MQTTSN_idlen ${schema.config.idlen}\n`
  h += `#define MQTTSN_seqlen ${schema.config.seqlen}\n`
  h += "\n";
  h += "extern unsigned int mqttsn_seq;\n";
  h += "\n";
  for (const [key, msg] of Object.entries(schema.messages)) {
    h += `#define MQTTSN_MSG_ID_${key} 0x${sprintf("%02X", msg.id)}\n`
  }
  h += "\n";
  h += `void mqttsn_decode(int len, unsigned char *buf);\n`
  //h += `void mqttsn_sender(int len, unsigned char *buf);\n`
  for (const [key, msg] of Object.entries(schema.messages)) {
    s += `    case ${sprintf("MQTTSN_MSG_ID_%s", key)}:\n`
    s += `    {\n`
    s += `        bit_position = 12;\n`

    cb = `mqttsn_decoded_${key}(`
    w += `__attribute__ ((weak)) void ${cb}`;
    h += `void ${cb}`;
    var type = "unsigned int", wname = "seq"
    h += `${type} ${wname}, `;
    w += `${type} ${wname}, `;
    var i = 0;
    var bit_position = schema.config.idlen + schema.config.seqlen;
    cb += "seq, "
    for (p of msg.payload) {
      var type = "unsigned int"
      var name = p.name;
      var wname = p.name;
      if (p.size <= 8)
        type = "unsigned char"
      if (p.n)
        name = name + "[64]"
      if (p.n)
        wname = "*" + p.name
      if (i) {
        cb += ", "
        h += ", "
        w += ", "
      }
      cb += `${p.name}`;
      h += `${type} ${wname}`;
      w += `${type} ${wname}`;
      if (p.n) {
        if (typeof p.n == "string")
          s += `        ${type} ${name};\n`;
        else
          s += `        ${type} ${p.name}[${p.n}];\n`;
        s += `        for (int i = 0; i < ${p.n}; i++)\n`;
        s += `            ${p.name}[i] = mqttsn_get_bits(len, buf, bit_position + ${p.size} * i, ${p.size});\n`;
        bit_position += p.size
        s += `        bit_position += ${p.size} * ${p.n};\n`
      } else {
        s += `        ${type} ${name} = mqttsn_get_bits(len, buf, bit_position, ${p.size});\n`;
        s += `        bit_position += ${p.size};\n`
      }
      i++;
    }
    cb += `)`;
    h += `);\n`;

    w += `) {\n`;
    w += `    puts("weak cb: '${key}'");\n`;
    w += `    puts_lf();\n`;
    for (p of msg.payload) {
      var size = 2
      if (p.size > 8)
        size = p.size / 8
      w += `    puts("${p.name}: ");\n`;
      if (p.n) {
        w += `    for (int i = 0; i < ${p.n}; i++)\n`;
        w += `        {\n`;
        w += `        puts_h((unsigned int)${p.name}[i], ${size});\n`;
        w += `        puts(" ");\n`;
        w += `        }\n`;
      } else
        w += `    puts_h(${p.name}, ${size});\n`;
      w += `    puts_lf();\n`;
    }
    w += `};\n\n`;
    s += `        ${cb};\n`
    s += `    }\n`
    s += `    break;\n`
  }
  s += `    }\n`
  s += `}\n\n`
  s += `${w}\n`

  for (const [key, msg] of Object.entries(schema.messages)) {
    proto = `int mqttsn_encode_${key}(char *buf, int maxlen`;
    for (p of msg.payload) {
      var type = "unsigned int"
      var name = p.name;
      if (p.size <= 8)
        type = "unsigned char"
      else if (p.size <= 16)
        type = "unsigned short int"
      if (p.n)
        name = "*" + name
      proto += `, ${type} ${name}`;
    }
    proto += `)`;
    h += `${proto};\n`;
    s += `${proto}\n{\n`;
    s += `    int bit_counter = 0;\n\n`;
    var bit = 0;

    s += `    bit_counter += mqttsn_push_bits(buf, maxlen, bit_counter, MQTTSN_seqlen, mqttsn_seq);\n`;
    s += `    bit_counter += mqttsn_push_bits(buf, maxlen, bit_counter, MQTTSN_idlen, MQTTSN_MSG_ID_${key});\n`;
    s += `    mqttsn_seq = (mqttsn_seq + 1) & ((1 << MQTTSN_seqlen) - 1);\n`;
    for (p of msg.payload) {
      var type = "int"
      if (p.size <= 8)
        type = "unsigned char"
      else if (p.size <= 16)
        type = "unsigned short int"
      if (p.n) {
        s += `    for (int i = 0; i < ${p.n}; i++)\n`;
        s += `        bit_counter += mqttsn_push_bits(buf, maxlen, bit_counter, ${p.size}, ${p.name}[i]);\n`;
      } else {
        s += `    bit_counter += mqttsn_push_bits(buf, maxlen, bit_counter, ${p.size}, ${p.name});\n`;
      }
    }
    s += "\n    MQTT_sender((bit_counter + 7) / 8, (void *)buf);\n"
    s += "\n    return (bit_counter + 7) / 8;\n"
    s += "}\n\n";
  }
  fs.writeFileSync(`${path}/lib/${product}_${build}_mqtt.c`, s);
  fs.writeFileSync(`${path}/lib/inc/${product}_${build}_mqtt.h`, h);
}

var seq_cnt = 1

var encode = (payload) => {
  var bits = []
  var my_seq = seq_cnt
  var sch = schema.messages[payload.topic]
  for (b = 0; b < schema.config.seqlen; b++) {
    bits.push(seq_cnt & (1 << b) ? 1 : 0)
  }
  seq_cnt += 1
  seq_cnt &= (1 << (schema.config.seqlen)) - 1;
  if (seq_cnt == 0)
    seq_cnt = 1; //avoid zero
  for (b = 0; b < schema.config.idlen; b++) {
    bits.push(sch.id & (1 << b) ? 1 : 0)
  }
  var lens = []
  for (p of sch.payload) {
    if (p.type == "string") {
      if (p.name in payload)
        lens.push([`${p.name}_len`, payload[p.name].length])
      else {
        lens.push([`${p.name}_len`, 0])
        lens.push([p.name, ''])
      }
    }
  }
  for (var obj of lens) {
    payload[obj[0]] = obj[1];
  }
  console.log(payload)
  for (p of sch.payload) {
    var val = payload[p.name];
    var len = 0
    if (p.n != undefined) {
      if (typeof val == "string") {
        var data = [];
        for (var i = 0; i < val.length; i++) {
          data.push(val.charCodeAt(i));
        }
        val = data
      }
      if (typeof val != "object") {
        console.error("no array???");
        continue;
      }
      if (typeof p.n == "string")
        len = payload[p.n]
      else
        len = val.length;
    }
    if (len > 0) {
      for (i = 0; i < len; i++) {
        v = val[i]
        for (b = 0; b < p.size; b++) {
          bits.push(v & (1 << b) ? 1 : 0)
        }
      }

    } else {
      for (b = 0; b < p.size; b++) {
        bits.push(val & (1 << b) ? 1 : 0)
      }
    }
  }
  var bytes = Math.ceil(bits.length / 8)
  var ret = []
  for (byte = 0; byte < bytes; byte++) {
    var val = 0
    for (bit = 0; bit < 8 && bit + byte * 8 < bits.length; bit++) {
      var pos = bit + byte * 8;
      if (bits[pos])
        val |= 1 << bit
    }
    ret.push(val)
  }
  return [my_seq, ret]
}

var decode = (s) => {
  bits = [], bc = 0
  for (byte of s) {
    for (bit = 0; bit < 8; bit++) {
      bits[bc++] = (byte >> bit) & 1
    }
  }
  var pick = (size) => {
    var ret = 0;
    var i;
    for (i = 0; i < size; i++) {
      ret += bits.shift() * (1 << i)
    }
    return ret
  }
  var seq = pick(schema.config.seqlen)
  var id = pick(schema.config.idlen)
  if (schema.ids[id]) {
    var msg = schema.messages[schema.ids[id]]
    //console.log("msg: ", schema.ids[id], msg.payload);
    var payload = {
      topic: schema.ids[id],
      seq,
    }
    for (p of msg.payload) {
      var len = 0
      if (p.n != undefined) {
        if (typeof p.n == "string") {
          len = payload[p.n]
        } else
          len = p.n;
      }
      if (len) {
        payload[p.name] = []
        for (var i = 0; i < len; i++)
          payload[p.name].push(pick(p.size));
        if (p.type == "string") {
          payload[p.name] = String.fromCharCode.apply(null, payload[p.name]);
          delete (payload[p.name + "_len"])
        }
      } else
        payload[p.name] = pick(p.size);
    }
    return payload
  }
  console.log("bad msg id: ", id);
  return {}
}

var curr_schema_fn = "";

init = (schema_fn) => {
  if (schema_fn == curr_schema_fn)
    return;
  try {
    schema = JSON5.parse(fs.readFileSync(schema_fn).toString())
    schema.ids = []
    for (const [key, msg] of Object.entries(schema.messages)) {
      schema.ids[msg.id] = key
    }
    console.log("schema file loaded", schema_fn);
    curr_schema_fn = schema_fn;
    return schema;
  } catch (error) {
    console.log("schema file missing", schema_fn);
    throw `schema file missing ${schema_fn}`
  }
}

module.exports = {
  init,
  decode,
  build_c_lib,
  encode,
}
