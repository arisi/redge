#!/usr/bin/env node

const yargs = require('yargs')
rt0s = require('rt0s_js');
const JSON5 = require('json5');

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.ZT_MONGO;
if (!uri) {
  console.error("ZT_MONGO not set, please provide mongoDb access uri");
  process.exit(-1);
}

const argv = yargs
  .command('r_mongo.js', 'Runner for mongoDb', {})
  .option('id', {
    description: 'Broker Id',
    default: 'r_mongoDb',
    type: 'string',
  })
  .option('rt0s', {
    alias: 'r',
    description: 'rt0s broker to use',
    type: 'string',
    default: "mqtt://localhost:8091",
  })
  .help()
  .alias('help', 'h').argv;

mq = new rt0s(argv.rt0s, argv.id, "demo", "demo");
console.log('r_mongoDb Connected to Broker at', argv.rt0s);

async function main() {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });
  // Connect the client to the server	(optional starting in v4.7)
  await client.connect();
  // Send a ping to confirm a successful connection
  var c = await client.db("arikoe").collection('tadaa')
  mq.registerSyncAPI("findOne", "Find One Record", [
    { name: 'query', type: 'json' },
  ], async (msg) => {
    var ret = await c.findOne(msg.req.args[1].query)
    if (ret === null)
      return { error: `Not Found` };
    return ret
  });
  mq.registerSyncAPI("count", "Count Records", [
    { name: 'query', type: 'json' },
  ], async (msg) => {
    var ret = await c.countDocuments(msg.req.args[1].query)
    return ret
  });
  mq.registerSyncAPI("find", "Find Multiple Records", [
    { name: 'query', type: 'json' },
    { name: 'limit', default: 10 },
    { name: 'skip', default: 0 },
    { name: 'sort', type: 'json' },
  ], async (msg) => {
    var ret = await c.find(msg.req.args[1].query).sort(msg.req.args[1].sort || {}).limit(msg.req.args[1].limit || 10).skip(msg.req.args[1].skip || 0).toArray()
    if (ret === null)
      return { error: `Not Found` };
    return ret
  });
  mq.registerSyncAPI("deleteOne", "Delete One Record", [
    { name: 'query', type: 'json' },
  ], async (msg) => {
    var ret = await c.deleteOne(msg.req.args[1].query)
    return ret
  });
  mq.registerSyncAPI("deleteMultiple", "Delete Multiple Records", [
    { name: 'query', type: 'json' },
  ], async (msg) => {
    var ret = await c.deleteMultiple(msg.req.args[1].query)
    return ret
  });
  mq.registerSyncAPI("insertOne", "Insert One Record", [
    { name: 'item', type: 'json' },
  ], async (msg) => {
    var ret = await c.insertOne(msg.req.args[1].item)
    return ret
  });
  mq.registerSyncAPI("updateOne", "Update One Record", [
    { name: 'query', type: 'json' },
    { name: 'item', type: 'json' },
  ], async (msg) => {
    var ret = await c.updateOne(msg.req.args[1].query, msg.req.args[1].item)
    return ret
  });
  mq.registerSyncAPI("updateMany", "Update Multiple Records", [
    { name: 'query', type: 'json' },
    { name: 'item', type: 'json' },
  ], async (msg) => {
    var ret = await c.updateMany(msg.req.args[1].query, msg.req.args[1].item)
    return ret
  });
  mq.registerSyncAPI("upsertOne", "Upsert One Record", [
    { name: 'query', type: 'json' },
    { name: 'item', type: 'json' },
  ], async (msg) => {
    var ret = await c.updateOne(msg.req.args[1].query, msg.req.args[1].item, { upsert: true })
    return ret
  });
}
main()