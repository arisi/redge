#!/usr/bin/env python3

from rt0s_py import rt0s

#mq = rt0s("ws://localhost:8092", username="demo", password="demo", client_id="binho")
mq = rt0s("ws://localhost:8192", username="demo", password="demo", client_id="binho")

import time
from binho import binhoHostAdapter
from binho.errors import DeviceNotFoundError, BinhoException
binho = binhoHostAdapter()

print("Connected to a {} (deviceID: {}) on {}".format(binho.productName, binho.deviceID, binho.commPort))

# set the LED to any color based on RGB values (0 - 255)
red = 128
green = 128
blue = 128

print("Setting the LED to {}, {}, {} (RGB)".format(red, green, blue))
binho.leds[1].setRGB(red, green, blue)

binho.operationMode = "I2C"
binho.i2c.frequency = 100000
binho.i2c.useInternalPullUps = True

def init():
  writeData = [0xa1]
  try:
    binho.i2c.write(targetDeviceAddress, writeData)

  except BinhoException:
    print("I2C Write transaction failed at INIT")

def do_tx(obj):
  args = obj['req']['args'][1]
  print("sent i2c", obj)
  try:
    binho.i2c.write(args['address'], args['payload'])

  except BinhoException:
    print("I2C Write transaction failed!")
    return False
  return True

mq.registerAPI("tx","Transmit on I2C",[
  { "name": 'address', "type": 'number', "default": 0x10 },
  { "name": 'payload', "type": 'string', "default": "TEST" },
  ], do_tx)


def do_rx(obj):
  args = obj['req']['args'][1]
  print("receive i2c", obj)


  try:
    rxData = binho.i2c.transfer(args['address'], [args['cmd']], args['rx_len'])

  except BinhoException:
    print("I2C Transfer Transaction failed!")
    return False

  else:
    print("I2C Transfer Succeeded: ")
    sentBytes = "Wrote {} byte(s):".format(len(writeData))

    for byte in writeData:
        sentBytes += "\t " + "0x{:02x}".format(byte)

    rcvdBytes = "Read {} byte(s):\t".format(len(rxData))
    rx=[]
    for byte in rxData:
        rcvdBytes += "\t " + "0x{:02x}".format(byte)
        rx.append(byte)

    print(sentBytes)
    print(rcvdBytes)

    return rx

mq.registerAPI("rx","Receive on I2C",[
  { "name": 'address', "type": 'number', "default": 0x10 },
  { "name": 'cmd', "type": 'number', "default": 0x10 },
  { "name": 'rx_len', "type": 'number', "default": 1 },
  ], do_rx)


if False:
  scanResults = binho.i2c.scan()

  print("Found {} I2C devices on the bus:".format(len(scanResults)))
  print(scanResults)
  print()
else:
  #scanResults= [0x68]
  scanResults= [0x12]
scanResults= [0x12]

if len(scanResults) > 0:
  targetDeviceAddress = scanResults[0]
  print("Addr: 0x{:02x}".format(targetDeviceAddress))



  if False:
    rxData = []

    try:
        rxData = binho.i2c.read(targetDeviceAddress, 2)
        print(rxData)

    except BinhoException:
        print("I2C Read Transaction failed!")

    print()
    rcvdBytes = "Read {} byte(s):\t".format(len(rxData))
    for byte in rxData:
        rcvdBytes += "\t " + "0x{:02x}".format(byte)

    print(rcvdBytes)
    print()

  if True:
    #init()
    for _ in range(2):
      time.sleep(1)
      writeData = [0x61,0x55,0x77]
      try:
        binho.i2c.write(targetDeviceAddress, writeData)

      except BinhoException:
        print("I2C Write transaction failed!")

      else:
        sentBytes = "Wrote {} byte(s):".format(len(writeData))
        for byte in writeData:
            sentBytes += "\t " + "0x{:02x}".format(byte)

        print(sentBytes)

      print()

  if False:
    writeData = [0x0c]
    #writeData = [0x6B]
    bytesToRead = 3
    rxData = []

    try:
      rxData = binho.i2c.transfer(targetDeviceAddress, writeData, bytesToRead)

    except BinhoException:
      print("I2C Transfer Transaction failed!")

    else:
      print("I2C Transfer Succeeded: ")
      sentBytes = "Wrote {} byte(s):".format(len(writeData))

      for byte in writeData:
          sentBytes += "\t " + "0x{:02x}".format(byte)

      rcvdBytes = "Read {} byte(s):\t".format(len(rxData))
      for byte in rxData:
          rcvdBytes += "\t " + "0x{:02x}".format(byte)

      print(sentBytes)
      print(rcvdBytes)

  print()


print("Finished!")
#binho.close()
