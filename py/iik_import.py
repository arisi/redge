#!/usr/bin/env python3
import os
import os.path
from datetime import datetime
import json5
import csv
import tempfile

iik=[]
state = 0
read = True
with open('iik.csv', mode ='r') as file:
  csvFile = csv.reader(file)
  i=0
  dr=[]
  dw=[]
  addr = 0
  start = 0

  for line in csvFile:
    if i:
      t=round(float(line[2])*1000000)
      if t>=0:
        ack = not (line[8] == "false")

        if line[1] == "start":
          if state == 0:
            state = 1
            start = t

          pass
        elif line[1] == "stop":
          if addr:
            addrs = "%X" % addr
            drs = str.join("", ("%02X " % i for i in dr))
            if len(dr):
              if len(dw) == 1:
                dws = "%02x" % dw[0]
                print(t,"R("+addrs+","+dws+"): "+drs)
              else:
                dws = str.join("", ("%02X " % i for i in dw))

                print(t,"R "+addrs+" ["+dws+"] ["+drs+"]")
              iik.append({
                "t":t,
                "rw":"R",
                "a": addr,
                "dw": dw,
                "dr": dr,
              })
            elif len(dw):

              iik.append({
                "t":t,
                "rw":"W",
                "a": addr,
                "dw": dw,
              })
              dd = dw.copy()
              reg = dd.pop(0)
              regs = "%02X" % reg
              dws = str.join("", ("%02X " % i for i in dd))
              print(t,"W("+addrs+","+regs+"): "+dws)

          dr=[]
          dw=[]
          state = 0

        elif line[1] == "address":
          read = line[6] == "true"
          addr = int(line[7],16)
          #print("ADDR",read,addr)
          pass
        elif line[1] == "data":
          data = int(line[5],16)
          #print("DATA",read, data)
          if read:
            dr.append(data)
          else:
            dw.append(data)
          pass
        # if not ack:
        #   print("NACK")

    i+=1
with open("iik.json5", "w") as outfile:
  json5.dump(iik, outfile, indent=4)
