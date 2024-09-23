const sprintf = require('sprintf');
var crc = require("crc");

var FRAME_OCTET = 0x7E;
var ESCAPE_OCTET = 0x7D;
var INVERT_OCTET = 0x20;
escapeCharacter = false
framePosition = 0

dump = (head, bytes) => {
  process.stdout.write(head + ": ");
  for (b of bytes) {
    process.stdout.write(sprintf("%02X ", b & 0xff))
  }
  console.log("");
}

send = (rawFrame) => {
  var byte;
  var fcs;
  var buf = []
  sendchar = (b) => {
    buf.push(b & 0xff)
  }
  sendchar(FRAME_OCTET);
  for (var i = 0; i < rawFrame.length; i++) {
    byte = rawFrame[i];
    if (typeof byte == "string")
      byte = byte.charCodeAt(0)

    fcs = crc.crc8([byte], fcs);
    if ((byte === ESCAPE_OCTET) || (byte === FRAME_OCTET)) {
      sendchar(ESCAPE_OCTET);
      byte ^= INVERT_OCTET;
    }
    sendchar(byte);
  }
  byte = Buffer.from([fcs]).readInt8(0);
  if ((byte === ESCAPE_OCTET) || (byte === FRAME_OCTET)) {
    sendchar(ESCAPE_OCTET);
    byte ^= INVERT_OCTET;
  }
  sendchar(byte);
  byte = Buffer.from([fcs >> 8]).readInt8(0);
  if ((byte === ESCAPE_OCTET) || (byte === FRAME_OCTET)) {
    sendchar(ESCAPE_OCTET);
    byte ^= INVERT_OCTET;
  }
  sendchar(byte);
  sendchar(FRAME_OCTET);
  dump("SENT TO DUT", buf)
  return buf
};

frame = (bytes) => {
  dump("frame", bytes)
}

var idle = [FRAME_OCTET, FRAME_OCTET]

var receivedFrameBuffer = [];
let frameChecksum

got = (bytes, cb) => {
  for (var i = 0; i < bytes.length; i++) {
    var data = bytes[i];
    if (data === FRAME_OCTET) {
      if (escapeCharacter === true) {
        escapeCharacter = false;
      }
      else if (framePosition >= 2) {
        //dump("RAW FROM DUT", receivedFrameBuffer)
        if (frameChecksum === ((receivedFrameBuffer[framePosition - 1] << 8) | (receivedFrameBuffer[framePosition - 2] & 0xff))) {
          cb(null, receivedFrameBuffer.slice(0, receivedFrameBuffer.length - 2));
        } else {
          cb(null, receivedFrameBuffer.slice(0, receivedFrameBuffer.length - 2));
          //cb("CRC", receivedFrameBuffer.slice(0, receivedFrameBuffer.length - 2))
        }
      }
      else if (framePosition == 0) {
        cb("PING")
      }
      framePosition = 0;
      frameChecksum = undefined;
      escapeCharacter = false;
      receivedFrameBuffer = [];
      continue;
    }
    if (escapeCharacter) {
      escapeCharacter = false;
      data ^= INVERT_OCTET;
    }
    else if (data === ESCAPE_OCTET) {
      escapeCharacter = true;
      continue;
    }
    receivedFrameBuffer[framePosition] = data;
    if (framePosition - 2 >= 0) {
      //frameChecksum = crc.crc16ccitt([receivedFrameBuffer[framePosition - 2]], frameChecksum);
      frameChecksum = crc.crc8([receivedFrameBuffer[framePosition - 2]], frameChecksum);
    }
    framePosition++;
  }
};

module.exports = {
  got,
  send,
  dump,
  idle,
}
