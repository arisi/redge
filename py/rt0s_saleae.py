#!/usr/bin/env python3

from saleae import automation
import os
import os.path
from datetime import datetime
from rt0s_py import rt0s
import json5
import csv
import tempfile

def rt0s_connect(url, username, password, client_id, dut = None, cb_indication  = None):
  global mq
  mq = rt0s(url, username=username, password=password, client_id=client_id)


manager= automation.Manager.connect(port=10430)


device_configuration = automation.LogicDeviceConfiguration(
    enabled_digital_channels=[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15],
    digital_sample_rate=10_000_000,
    digital_threshold_volts=3.3,
)


def do_cap(obj):
  args = obj['req']['args'][1]
  print("capturing", args)
  with tempfile.TemporaryDirectory() as output_dir:
    json_fn = os.path.join(os.getcwd(), 'cap-'+args['id']+'.json5')
    sal_fn = os.path.join(os.getcwd(), 'cap-'+args['id']+'.sal')

    capture_configuration = automation.CaptureConfiguration(
        capture_mode=automation.DigitalTriggerCaptureMode(
            trigger_type=automation.DigitalTriggerType.RISING,
            trigger_channel_index=3,
            after_trigger_seconds = args['duration']
            )
    )

    capture=manager.start_capture(
            device_configuration=device_configuration,
            capture_configuration=capture_configuration)

    capture.wait()

    node_pti_analyzer = capture.add_analyzer('SPI', label=f'node_pti', settings={
        'MOSI': 4,
        'Clock': 8,
        'Enable': 5,
        'Bits per Transfer': 8,
        'Significant Bit': 'Least Significant Bit First',
        'Clock State': 0,
        'Clock Phase': 0,
        'Enable Line': 'Enable line is Active High'
    })

    hub_pti_analyzer = capture.add_analyzer('SPI', label=f'hub_pti', settings={
        'MOSI': 6,
        'Clock': 9,
        'Enable': 7,
        'Bits per Transfer': 8,
        'Significant Bit': 'Least Significant Bit First',
        'Clock State': 0,
        'Clock Phase': 0,
        'Enable Line': 'Enable line is Active High'
    })

    # node_pti_analyzer = capture.add_analyzer('Async Serial', label=f'node_pti', settings={
    #     'Input Channel': 4,
    #     'Bit Rate (Bits/s)': 2500000,
    #     'Bits per Frame': 8,
    #     'Stop Bits': 1,
    #     'Parity Bit': 0,
    #     'Mode': 'Normal'

    # })

    hub_uart_analyzer = capture.add_analyzer('Async Serial', label=f'hub_uart', settings={
        'Input Channel': 14,
        'Bit Rate (Bits/s)': 115200
    })
    node_uart_analyzer = capture.add_analyzer('Async Serial', label=f'node_uart', settings={
        'Input Channel': 15,
        'Bit Rate (Bits/s)': 115200
    })


    data_conf = automation.DataTableExportConfiguration(
      analyzer=node_pti_analyzer,
      radix=automation.RadixType.HEXADECIMAL
    )
    capture.export_data_table(
        filepath=os.path.join(output_dir, 'node_pti_export.csv'),
        analyzers=(node_pti_analyzer, data_conf),
        #iso8601_timestamp=True,
    )
    hub_data_conf = automation.DataTableExportConfiguration(
      analyzer=hub_pti_analyzer,
      radix=automation.RadixType.HEXADECIMAL
    )
    capture.export_data_table(
        filepath=os.path.join(output_dir, 'hub_pti_export.csv'),
        analyzers=(hub_pti_analyzer, hub_data_conf),
    )
    capture.export_raw_data_csv(directory=output_dir, digital_channels=[0, 1, 2, 3,5,7])
    capture.save_capture(filepath=sal_fn)

    node_pti=[]
    with open(os.path.join(output_dir, 'node_pti_export.csv'), mode ='r') as file:
      csvFile = csv.reader(file)
      i=0
      for line in csvFile:
        if i:
          t=round(float(line[2])*1000000)
          if t>=0:
            v = 0
            if len(line)>5 and line[5] > '':
              v = int(line[5],0)
            node_pti.append([t, line[1], v])
        i+=1

    hub_pti=[]
    with open(os.path.join(output_dir, 'hub_pti_export.csv'), mode ='r') as file:
      csvFile = csv.reader(file)
      i=0
      for line in csvFile:
        if i:
          t=round(float(line[2])*1000000)
          if t>=0:
            v = 0
            if len(line)>5 and line[5] > '':
              v = int(line[5],0)
            hub_pti.append([t,line[1],v])
        i+=1

    cap=[]
    with open(os.path.join(output_dir, 'digital.csv'), mode ='r') as file:
      csvFile = csv.reader(file)
      # pins 3=HUB_TX, 0=NODE_RX, 2=NODE_TX, 1=HUB_RX, 5=NODE_FRAME, 7=HUB_FRAME
      i=0
      for line in csvFile:
        if i:
          t=round(float(line[0])*1000000)
          if t>=0:
            cap.append([t,line[4],line[1],line[3],line[2],line[6],line[5]])
        i+=1

    capture.close()
    print("capturing done",output_dir)
    with open(json_fn, "w") as outfile:
      json5.dump({"cap":cap, "node_pti": node_pti, "hub_pti": hub_pti}, outfile)
    return {"id": args['id'], "cap":cap, "node_pti": node_pti, "hub_pti": hub_pti}

print("CAP ready")

rt0s_connect("mqtt://localhost:8091","demo","demo","saleae")

mq.registerAPI("cap","Capture stuff",[
  { "name": 'id', "type": 'string', "default": "temp" },
  { "name": 'duration', "type": 'number', "default": 0.001 },
  ], do_cap)

