#!/usr/bin/env python3

import paho.mqtt.client as mqtt
import uuid, time, threading, json, re
from threading import Thread, Lock
from urllib.parse import urlparse
import signal

class rt0s:
  apis = {}
  reqs = {}
  req_inds = {}
  client = None
  timer = None
  quit = False
  client_id = ""
  port = 1884
  protocol = "ws"
  host ="localhost"

  def __del__(self):
    self.quit = True

  def disconnect(self):
    self.client.disconnect()
    self.quit = True

  def __init__(self, url, client_id=None, password="", username=None ):
    if not client_id:
      self.client_id = str(uuid.uuid4())
    else:
      self.client_id = client_id
    parts = urlparse(url)
    if parts.port:
      self.port=parts.port
    if parts.scheme:
      self.protocol=parts.scheme
    print("Connecting to ", url)
    self.host = parts.hostname

    def on_connect(client, userdata, flags, rc):
      if rc == 0:
        self.client.subscribe("/up/"+self.client_id+"/+")
        self.client.subscribe("/dn/"+self.client_id+"/+")
        for key in self.req_inds:
          ind = self.req_inds[key]
          #print("recon", ind)
          self.client.subscribe("/ind/"+ind['target']+"/"+ind['msg'])

    def on_disconnect(client, userdata, flags):
      #print("disconnected")
      pass

    def on_message(client, userdata, msg):
      #print("*WARN* got",msg.topic,msg.payload.decode("utf-8") )
      hit=re.match(r"^/ind/(.+)/(.+)$",msg.topic)
      if hit:
        src = hit[1]
        id = hit[2]
        key = src+"_"+id
        if key in self.req_inds:
          obj = json.loads(msg.payload.decode("utf-8"))
          if "cb" in self.req_inds[key]:
            self.req_inds[key]['cb'](src, obj)
        key = src+"_+"
        if key in self.req_inds:
          obj = json.loads(msg.payload.decode("utf-8"))
          if "cb" in self.req_inds[key]:
            self.req_inds[key]['cb'](src, obj)
        return

      hit=re.match(r"^/up/"+self.client_id+"/(.+)$",msg.topic)
      if hit:
        mid = hit[1]
        if mid in self.reqs:
          obj = json.loads(msg.payload.decode("utf-8"))
          r = self.reqs[mid]
          r['done'] = True
          if r['cb']:
            r['cb'](obj['reply'], ctx=r['ctx'])

      hit=re.match(r"^/dn/"+self.client_id+"/(.+)$",msg.topic)
      if hit:
        mid = hit[1]
        obj = json.loads(msg.payload.decode("utf-8"))
        if obj['req']['args'][0] in self.apis:
          api = self.apis[obj['req']['args'][0]]
          reply = api['f'](obj)
          if reply == None:
            return
          obj['reply'] = reply
        elif "*" in self.apis:
          api = self.apis["*"]
          reply = api['f'](obj)
          if reply == None:
            return
          obj['reply'] = reply
        else:
          print("bad api req", obj['req']['args'][0])
          obj['reply'] = {
            "error": "no api "+obj['req']['args'][0]+" at "+self.client_id
          }
        self.client.publish("/up/"+obj['src']+"/"+obj['mid'], json.dumps(obj))
    if self.protocol == "wss" or self.protocol == "ws":
      self.client = mqtt.Client(client_id=self.client_id, clean_session=False, transport="websockets")
    else:
      self.client = mqtt.Client(client_id=self.client_id, clean_session=False)
    self.client.on_connect = on_connect
    self.client.on_disconnect = on_disconnect
    self.client.on_message = on_message

    if username:
      self.client.username_pw_set(username, password=password)
    #print("*WARN* CON",self.protocol , self.host, self.port)
    self.client.connect(self.host, port=self.port)
    self.client.loop_start()

    def do_ping(obj):
      return {"pong": True}
    self.registerAPI("ping","Ping",[], do_ping)

    def do_api(obj):
      ret=[]
      for api in self.apis:
        ret.append({"cmd": api,"descr": self.apis[api]["descr"],"args": self.apis[api]["args"]})
      return ret
    self.registerAPI("api","Apis",[], do_api)

    def poller():
      dels=[]
      for k in self.reqs:
        r = self.reqs[k]
        now = self.stamp()
        if r['done']:
          dels.append(k)
        elif now > r['sent'] + r['timeout']:
          if r['retries'] > r['tries']:
            r['tries'] += 1
            r['obj']['resend'] = r['tries']
            topic = "/dn/"+r['obj']['target']+"/"+r['obj']['mid']
            self.client.publish(topic, json.dumps(r['obj']))
            r['sent'] = now
          else:
            if r['cb']:
              r['cb'](None, error = "timeout", ctx=r['ctx'])
            r['done'] = True
      for k in dels:
        del self.reqs[k]
      if not self.quit:
        self.timer = threading.Timer(1, poller).start()

    poller()

  @staticmethod
  def stamp():
    t = time.time()
    return int(t * 1000)

  def registerAPI(self, path, descr, args, cb):
    self.apis[path] = {
      "f": cb,
      "descr": descr,
      "args": args,
    }

  def req_ind(self, target, msg, cb, ctx = {}):
    key = target+"_"+msg
    self.req_inds[key] = {
      'target': target,
      'msg': msg,
      'key': key,
      'cb': cb,
      'ctx': ctx,
    }
    self.client.subscribe("/ind/"+target+"/"+msg)

  def send_ind(self, msg, obj):
    topic = "/ind/"+self.client_id+"/"+msg
    self.client.publish(topic, json.dumps(obj))

  def req(self, target, msg, cb = None, ctx = {}):
    obj = {
      'mid': str(uuid.uuid4()),
      'src': self.client_id,
      'target': target,
      'req': { 'args': msg },
    }
    if cb:
      self.reqs[obj['mid']] = {
        'obj': obj,
        'cb': cb,
        'ctx': ctx,
        'done': False,
        'created': self.stamp(),
        'sent': self.stamp(),
        'tries': 1,
        'retries': 5,
        'timeout': 500
      }
    topic = "/dn/"+target+"/"+obj['mid']
    self.client.publish(topic, json.dumps(obj))

  def call(self, target, args, options = None):
    if options == 'NoAck':
      self.req(target, args)
      return {'success': True}

    ctx= {
      'ret': "",
      'done': False,
      'mutex': Lock(),
    }
    def got_reply(ret, error=None, ctx = {}):
      ctx['ret'] = ret
      ctx['err'] = error
      ctx['done'] = True
      ctx['mutex'].release()
    ctx['mutex'].acquire()
    #print("*WARN* call:", target, args, options)
    self.req(target, args, got_reply, ctx = ctx)
    ctx['mutex'].acquire()
    #print("*WARN* call ret:", ctx['ret'])
    return ctx['ret']


if __name__ == "__main__":
    print("OKE")
    mq = rt0s("ws://localhost:8092", username="demo", password="demo", client_id="pyx")
    #if not dut:
    ret = mq.call('dev:runner:daemon' ,[".list_runners", { } ])
    dut = ret[0]
    # self.dut = dut
    # if cb_indication:
    #   self.mq.req_ind(self.dut, '+', cb_indication)
    # else:
    #   self.mq.req_ind(self.dut, '+', self.indd)
