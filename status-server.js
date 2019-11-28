'use strict'

const { ApiPromise, WsProvider } = require('@polkadot/api')
const { registerJoystreamTypes } = require('@joystream/types')
const getStatusUpdate = require('./getstatus')
const express = require('express')
const sleepSeconds = require('./sleep')
const app = express()

var STATUS = {}

async function main () {
  // const provider = new WsProvider('wss://staging-reckless.joystream.org/reckless/rpc/');
  // const provider = new WsProvider('wss://staging-lts.joystream.org/staging/rpc/');
  const provider = new WsProvider('ws://127.0.0.1:9944')
  registerJoystreamTypes()
  const api = await ApiPromise.create({provider})
  await api.isReady;

  while (true) {
    try {
      STATUS = await getStatusUpdate(api)
    } catch (err) { console.error(err.message) }

    await sleepSeconds(6)
  }
}

main()

app.get('/', function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(STATUS))
})

const server = app.listen(8081, function () {
  const host = server.address().address
  const port = server.address().port
  console.log('Status server listening at http://%s:%s', host, port)
})
